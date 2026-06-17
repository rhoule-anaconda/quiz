import { GameRoom, Env } from "./game-room.ts";
import { QUIZZES, QUIZ_LIST } from "./gen/quizzes.ts";
import { newGamePage } from "./pages/new-game.ts";
import { hostPage } from "./pages/host.ts";
import { playerPage } from "./pages/player.ts";

export { GameRoom };

const ROOM_CODE_RE = /^[A-Z0-9]{4,8}$/;

function generateRoomCode(): string {
  // Avoid confusable chars (0/O, 1/I/L). 4 chars = ~1.6M combos, plenty.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 4; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // -- Multiplayer routes --

    // Host landing page: pick a quiz, get a room
    if (path === "/new" || path === "/new/") {
      return html(newGamePage(QUIZ_LIST));
    }

    // Create a room: POST { quizSlug } -> { code }
    if (request.method === "POST" && path === "/api/rooms") {
      const body = (await request.json()) as { quizSlug?: string };
      const slug = body.quizSlug;
      if (!slug || !QUIZZES[slug]) {
        return json({ error: "Unknown quiz" }, 400);
      }
      // Try a few codes in case of collision (extremely unlikely)
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateRoomCode();
        const stub = env.GAME_ROOM.getByName(code);
        // Initialize the DO (idempotent if attempted twice on the same name,
        // but we only call this once per code attempt)
        const initRes = await stub.fetch(`https://do/init`, {
          method: "POST",
          body: JSON.stringify({ quizSlug: slug, quiz: QUIZZES[slug] }),
        });
        if (initRes.ok) {
          return json({ code });
        }
      }
      return json({ error: "Could not allocate room" }, 500);
    }

    // Host dashboard
    const hostMatch = path.match(/^\/host\/([A-Z0-9]{4,8})\/?$/);
    if (hostMatch) {
      const code = hostMatch[1];
      return html(hostPage(code));
    }

    // Player join
    const playMatch = path.match(/^\/play\/([A-Z0-9]{4,8})\/?$/);
    if (playMatch) {
      const code = playMatch[1];
      return html(playerPage(code));
    }

    // Name reservation pre-flight (player page calls this before opening WS)
    const checkNameMatch = path.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/check-name$/);
    if (request.method === "POST" && checkNameMatch) {
      const code = checkNameMatch[1];
      const stub = env.GAME_ROOM.getByName(code);
      const forwardUrl = new URL(request.url);
      forwardUrl.pathname = "/check-name";
      return stub.fetch(forwardUrl.toString(), request);
    }

    // WebSocket upgrade routed to the room's DO
    const wsMatch = path.match(/^\/ws\/([A-Z0-9]{4,8})\/?$/);
    if (wsMatch) {
      const code = wsMatch[1];
      if (!ROOM_CODE_RE.test(code)) {
        return new Response("Bad code", { status: 400 });
      }
      const stub = env.GAME_ROOM.getByName(code);
      // Forward the WS upgrade. The DO checks ?role and ?name itself.
      const forwardUrl = new URL(request.url);
      forwardUrl.pathname = "/ws";
      return stub.fetch(forwardUrl.toString(), request);
    }

    // -- Static site --
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function html(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-frame-options": "SAMEORIGIN",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
