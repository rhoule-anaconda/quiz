import { DurableObject } from "cloudflare:workers";

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  ASSETS: Fetcher;
}

// Quiz JSON shape (matches questions/*.json files baked into the worker bundle)
export interface QuizQuestion {
  cat: string;
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface QuizCategoryMeta {
  label?: string;
  icon?: string;
  bg?: string;
  fg?: string;
}

export interface Quiz {
  categories?: Record<string, QuizCategoryMeta>;
  questions: QuizQuestion[];
}

interface PlayerState {
  name: string;
  score: number;
  currentAnswer: number | null;
}

interface RoomMetadata {
  quizSlug: string;
  createdAt: number;
}

type Phase = "lobby" | "question" | "reveal" | "final";

interface SocketAttachment {
  role: "host" | "player";
  playerId?: string;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export class GameRoom extends DurableObject<Env> {
  private quiz: Quiz | null = null;
  private quizSlug: string | null = null;
  private phase: Phase = "lobby";
  private currentQuestionIndex = 0;
  private players: Map<string, PlayerState> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    ctx.blockConcurrencyWhile(async () => {
      // Lightweight schema — most game state lives in memory and is rebuilt
      // from storage on cold start.
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS meta (
          k TEXT PRIMARY KEY,
          v TEXT NOT NULL
        )
      `);
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          score INTEGER NOT NULL DEFAULT 0,
          current_answer INTEGER
        )
      `);

      // Restore in-memory state from storage
      await this.restore();
    });
  }

  // -- public API (called via fetch, since WS upgrade needs Response) --

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Initialize a new room. Host calls this once with the chosen quiz.
    if (request.method === "POST" && url.pathname.endsWith("/init")) {
      const body = (await request.json()) as { quizSlug: string; quiz: Quiz };
      await this.initialize(body.quizSlug, body.quiz);
      return Response.json({ ok: true });
    }

    // Read-only state snapshot (used by host page on first render)
    if (request.method === "GET" && url.pathname.endsWith("/state")) {
      return Response.json(this.publicState());
    }

    // Pre-flight name check: returns 200 if the name is free or claimable as a
    // reconnect, 409 if a different active player already holds it.
    if (request.method === "POST" && url.pathname.endsWith("/check-name")) {
      const { name } = (await request.json()) as { name?: string };
      const trimmed = (name ?? "").trim().slice(0, 32);
      if (!trimmed) return Response.json({ error: "Name required" }, { status: 400 });
      const existing = this.findPlayerIdByName(trimmed);
      if (existing !== null && this.hasActiveSocketForPlayer(existing)) {
        return Response.json({ error: "Name taken" }, { status: 409 });
      }
      return Response.json({ ok: true });
    }

    // WebSocket upgrade for both host and player
    if (url.pathname.endsWith("/ws")) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected websocket", { status: 426 });
      }
      const role = url.searchParams.get("role");
      const name = url.searchParams.get("name") ?? "";
      if (role !== "host" && role !== "player") {
        return new Response("Bad role", { status: 400 });
      }
      if (!this.quiz) {
        return new Response("Room not initialized", { status: 404 });
      }

      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];

      let attachment: SocketAttachment;
      if (role === "host") {
        attachment = { role: "host" };
      } else {
        const trimmed = name.trim().slice(0, 32);
        if (!trimmed) {
          return new Response("Name required", { status: 400 });
        }
        // Reject if the name is already in use by a *different* live socket.
        // Reconnects (same name, prior socket closed) are allowed and inherit
        // the existing player's score.
        const existing = this.findPlayerIdByName(trimmed);
        if (existing !== null && this.hasActiveSocketForPlayer(existing)) {
          return new Response("Name taken", { status: 409 });
        }
        const playerId = this.upsertPlayer(trimmed);
        attachment = { role: "player", playerId };
      }

      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(attachment);

      // Send initial snapshot to the new socket
      server.send(JSON.stringify({ type: "state", state: this.publicState() }));

      // Tell everyone the roster changed (player count, names visible to host)
      this.broadcastState();

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  // -- WebSocket lifecycle (Hibernation API) --

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;

    let msg: { type: string; [k: string]: unknown };
    try {
      msg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }

    if (att.role === "host") {
      switch (msg.type) {
        case "start":
          if (this.phase === "lobby") {
            this.phase = "question";
            this.currentQuestionIndex = 0;
            this.clearAnswers();
            await this.persistMeta();
            this.broadcastState();
          }
          break;
        case "reveal":
          if (this.phase === "question") {
            this.scoreCurrentQuestion();
            this.phase = "reveal";
            await this.persistMeta();
            this.broadcastState();
          }
          break;
        case "next":
          if (this.phase === "reveal") {
            const isLast = this.currentQuestionIndex >= (this.quiz?.questions.length ?? 0) - 1;
            if (isLast) {
              this.phase = "final";
              await this.scheduleCleanup();
            } else {
              this.currentQuestionIndex += 1;
              this.phase = "question";
              this.clearAnswers();
            }
            await this.persistMeta();
            this.broadcastState();
          }
          break;
        case "end":
          this.phase = "final";
          await this.scheduleCleanup();
          await this.persistMeta();
          this.broadcastState();
          break;
      }
    } else if (att.role === "player" && att.playerId) {
      if (msg.type === "answer" && this.phase === "question") {
        const idx = msg.idx;
        if (typeof idx !== "number") return;
        const player = this.players.get(att.playerId);
        if (!player) return;
        // Lock answer — only the first submission counts for this question
        if (player.currentAnswer !== null) return;
        player.currentAnswer = idx;
        this.persistPlayer(att.playerId, player);
        this.broadcastState();
      }
    }
  }

  async webSocketClose(_ws: WebSocket, _code: number, _reason: string): Promise<void> {
    // We don't remove players on disconnect — they may reconnect (refresh, network blip).
    // The host can manually end the game; otherwise the alarm cleans up after 2h.
    this.broadcastState();
  }

  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {
    // Same policy as close
  }

  // -- alarm: 2h after game ends, wipe storage --

  async alarm(): Promise<void> {
    // Only act if we're actually in the final phase
    if (this.phase === "final") {
      // Close any lingering sockets
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.close(1000, "Game expired"); } catch { /* noop */ }
      }
      // Wipe everything
      await this.ctx.storage.deleteAll();
      this.quiz = null;
      this.quizSlug = null;
      this.phase = "lobby";
      this.currentQuestionIndex = 0;
      this.players.clear();
    }
  }

  // -- internal helpers --

  private async initialize(quizSlug: string, quiz: Quiz): Promise<void> {
    this.quizSlug = quizSlug;
    this.quiz = quiz;
    this.phase = "lobby";
    this.currentQuestionIndex = 0;
    this.players.clear();
    this.ctx.storage.sql.exec("DELETE FROM players");
    await this.persistMeta();
    await this.ctx.storage.put("quiz", quiz);
  }

  private async restore(): Promise<void> {
    const meta = this.ctx.storage.sql
      .exec<{ k: string; v: string }>("SELECT k, v FROM meta")
      .toArray();
    const m = Object.fromEntries(meta.map(r => [r.k, r.v]));
    if (m.quizSlug) {
      this.quizSlug = m.quizSlug;
      this.phase = (m.phase as Phase) ?? "lobby";
      this.currentQuestionIndex = parseInt(m.currentQuestionIndex ?? "0", 10);
      const q = await this.ctx.storage.get<Quiz>("quiz");
      this.quiz = q ?? null;
    }
    const rows = this.ctx.storage.sql
      .exec<{ id: string; name: string; score: number; current_answer: number | null }>(
        "SELECT id, name, score, current_answer FROM players"
      )
      .toArray();
    for (const r of rows) {
      this.players.set(r.id, {
        name: r.name,
        score: r.score,
        currentAnswer: r.current_answer ?? null,
      });
    }
  }

  private async persistMeta(): Promise<void> {
    const entries: [string, string][] = [
      ["phase", this.phase],
      ["currentQuestionIndex", String(this.currentQuestionIndex)],
    ];
    if (this.quizSlug) entries.push(["quizSlug", this.quizSlug]);
    for (const [k, v] of entries) {
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)",
        k,
        v
      );
    }
  }

  private persistPlayer(id: string, p: PlayerState): void {
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO players (id, name, score, current_answer) VALUES (?, ?, ?, ?)",
      id,
      p.name,
      p.score,
      p.currentAnswer
    );
  }

  private upsertPlayer(name: string): string {
    // Match by display name so a refresh keeps your score
    for (const [id, p] of this.players) {
      if (p.name === name) return id;
    }
    const id = crypto.randomUUID();
    const player: PlayerState = { name, score: 0, currentAnswer: null };
    this.players.set(id, player);
    this.persistPlayer(id, player);
    return id;
  }

  private findPlayerIdByName(name: string): string | null {
    for (const [id, p] of this.players) {
      if (p.name === name) return id;
    }
    return null;
  }

  private hasActiveSocketForPlayer(playerId: string): boolean {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as SocketAttachment | null;
      if (att?.role === "player" && att.playerId === playerId) {
        // Only count sockets in OPEN/CONNECTING states. webSocketClose runs
        // *before* getWebSockets stops returning the closed socket in some
        // versions of the runtime; readyState is the source of truth.
        if (ws.readyState === WebSocket.READY_STATE_OPEN || ws.readyState === WebSocket.READY_STATE_CONNECTING) {
          return true;
        }
      }
    }
    return false;
  }

  private clearAnswers(): void {
    for (const [id, p] of this.players) {
      p.currentAnswer = null;
      this.persistPlayer(id, p);
    }
  }

  private scoreCurrentQuestion(): void {
    if (!this.quiz) return;
    const q = this.quiz.questions[this.currentQuestionIndex];
    if (!q) return;
    for (const [id, p] of this.players) {
      if (p.currentAnswer === q.answer) {
        p.score += 1;
        this.persistPlayer(id, p);
      }
    }
  }

  private async scheduleCleanup(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + TWO_HOURS_MS);
  }

  private broadcastState(): void {
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      const att = ws.deserializeAttachment() as SocketAttachment | null;
      if (!att) continue;
      const payload = { type: "state", state: this.publicState(att) };
      try {
        ws.send(JSON.stringify(payload));
      } catch {
        // socket likely dead, ignore
      }
    }
  }

  /**
   * Build a per-role state snapshot.
   *
   * Anti-leader-following rule: while the question is open, NOBODY sees which
   * option got which votes — not even the host. The host only sees an
   * aggregate "answered" count. Per-option histograms appear at reveal.
   *
   * Players never see whether *other* players have answered (that would let a
   * latecomer infer "Bob picked, follow Bob"). Players only see their own
   * answer state. The host still sees per-player hasAnswered dots so they
   * know when to advance.
   *
   * - Host sees: question + per-player answered dots + total-answered count;
   *              full answer + per-option histogram only after reveal.
   * - Players see: question + their own answer state; scores only after reveal.
   */
  private publicState(forAttachment?: SocketAttachment): unknown {
    const totalQuestions = this.quiz?.questions.length ?? 0;
    const role = forAttachment?.role;
    const isReveal = this.phase === "reveal";
    const isFinal = this.phase === "final";

    // Player list shape depends on viewer + phase
    const playerList = [...this.players.entries()].map(([id, p]) => {
      // Score is always safe; it doesn't reveal which option anyone picked.
      const base = { id, name: p.name, score: p.score };
      // Host sees per-player answered dots so they can pace the round.
      // Players don't — they'd use it to coordinate.
      if (role === "host") {
        return { ...base, hasAnswered: p.currentAnswer !== null };
      }
      return base;
    });

    const base = {
      quizSlug: this.quizSlug,
      categories: this.quiz?.categories ?? {},
      phase: this.phase,
      questionIndex: this.currentQuestionIndex,
      totalQuestions,
      players: playerList,
    };

    if (this.phase === "lobby" || isFinal) {
      return base;
    }

    const q = this.quiz?.questions[this.currentQuestionIndex];
    if (!q) return base;

    const myAnswer =
      forAttachment?.role === "player" && forAttachment.playerId
        ? this.players.get(forAttachment.playerId)?.currentAnswer ?? null
        : null;

    // Pre-reveal aggregate: total answered, NO per-option breakdown.
    let answeredCount = 0;
    for (const p of this.players.values()) {
      if (p.currentAnswer !== null) answeredCount += 1;
    }

    if (role === "host") {
      // At reveal: per-option vote counts AND the names of who picked each,
      // so the host can narrate ("Bob, you went with C — let's see why...").
      // Before reveal: only the total answered count.
      const answers: Record<number, number> = {};
      const answersByName: Record<number, string[]> = {};
      if (isReveal) {
        for (const p of this.players.values()) {
          if (p.currentAnswer !== null) {
            answers[p.currentAnswer] = (answers[p.currentAnswer] ?? 0) + 1;
            (answersByName[p.currentAnswer] ??= []).push(p.name);
          }
        }
      }
      return {
        ...base,
        question: { cat: q.cat, q: q.q, options: q.options },
        correctIndex: isReveal ? q.answer : null,
        why: isReveal ? q.why : null,
        answers,
        answersByName,
        answeredCount,
      };
    }

    return {
      ...base,
      question: { cat: q.cat, q: q.q, options: q.options },
      correctIndex: isReveal ? q.answer : null,
      why: isReveal ? q.why : null,
      myAnswer,
      answeredCount,
    };
  }
}
