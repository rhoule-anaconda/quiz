import { SHARED_CSS } from "./shared.ts";

export function hostPage(code: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex,nofollow" />
<title>Host · ${code} · Anaconda Security Quiz</title>
<style>${SHARED_CSS}
  body { padding: 32px 48px; }
  .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
  .top h1 { margin: 0; font-size: 22px; background: linear-gradient(90deg, var(--green-1), var(--gold)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .room { font-family: "SF Mono", Menlo, monospace; font-size: 28px; letter-spacing: 4px; color: var(--gold); padding: 8px 16px; background: var(--panel); border: 1px solid #1f4a30; border-radius: 10px; }
  .pill { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; background: #1a334d; color: #8acaff; }
  .grid { display: grid; grid-template-columns: 1fr 280px; gap: 28px; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  .stage { background: var(--panel); border: 1px solid #1f4a30; border-radius: 18px; padding: 36px; min-height: 460px; display: flex; flex-direction: column; }
  .lobby h2 { margin: 0 0 12px; font-size: 32px; }
  .lobby p { color: var(--muted); font-size: 16px; line-height: 1.5; max-width: 540px; }
  .lobby .join-info { margin-top: 24px; padding: 20px; background: var(--panel-2); border-radius: 12px; border: 1px solid #1f4a30; max-width: 540px; }
  .lobby .join-info code { font-size: 18px; padding: 4px 10px; }
  .question-num { color: var(--muted); font-size: 14px; margin-bottom: 8px; }
  .question { font-size: 32px; font-weight: 600; line-height: 1.3; margin: 0 0 28px; }
  .options { display: grid; gap: 14px; }
  .option { display: flex; align-items: center; gap: 16px; background: var(--panel-2); border: 2px solid #1f4a30; padding: 18px 22px; border-radius: 12px; font-size: 20px; transition: all .2s; }
  .option .letter { width: 36px; height: 36px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #0a3517; color: var(--gold); font-weight: 700; }
  .option .text { flex: 1; }
  .option .bar { background: var(--green-3); height: 28px; border-radius: 6px; transition: width .4s ease; min-width: 0; opacity: 0.6; }
  .option .count { width: 36px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; font-size: 16px; }
  .option .pickers { width: 100%; flex-basis: 100%; padding-left: 52px; padding-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.4; }
  .option .pickers b { color: var(--text); font-weight: 500; }
  .option { flex-wrap: wrap; }
  .option.correct { border-color: var(--green-1); background: #1a4d22; }
  .option.correct .letter { background: var(--green-1); color: white; }
  .why { margin-top: 24px; padding: 22px 26px; background: #0e1f15; border-left: 4px solid var(--green-1); border-radius: 8px; font-size: 22px; line-height: 1.5; color: var(--text); }
  .why strong { color: var(--gold); }
  .why em { color: var(--text); font-style: italic; }
  .why code { font-size: 0.92em; }
  .reveal-banner { margin-top: 24px; padding: 20px 28px; background: #1a4d22; border: 3px solid var(--green-1); border-radius: 12px; font-size: 24px; font-weight: 700; color: #c5ffd0; text-align: center; line-height: 1.3; }
  .reveal-banner .letter-big { display: inline-block; width: 40px; height: 40px; line-height: 40px; border-radius: 50%; background: var(--green-1); color: white; margin-right: 12px; font-size: 22px; vertical-align: middle; }
  .reveal-banner .stats { display: block; font-size: 16px; font-weight: 400; color: var(--muted); margin-top: 8px; }
  .controls { margin-top: auto; padding-top: 28px; display: flex; gap: 12px; align-items: center; }
  .controls .progress { flex: 1; color: var(--muted); font-size: 13px; }
  .scoreboard { background: var(--panel); border: 1px solid #1f4a30; border-radius: 18px; padding: 24px; height: fit-content; }
  .scoreboard h3 { margin: 0 0 16px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--muted); }
  .player { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #1f4a30; font-size: 16px; }
  .player:last-child { border-bottom: none; }
  .player .name { display: flex; align-items: center; gap: 8px; }
  .player .dot { width: 8px; height: 8px; border-radius: 50%; background: #555; }
  .player.answered .dot { background: var(--green-1); }
  .player .score { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--gold); }
  .empty { color: var(--muted); font-size: 14px; padding: 12px 0; }
  .final h2 { font-size: 40px; margin: 0 0 16px; background: linear-gradient(90deg, var(--green-1), var(--gold)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .final ol { font-size: 24px; line-height: 1.8; padding-left: 32px; }
  .final ol li { margin-bottom: 4px; }
  .final ol li b { color: var(--gold); }
</style>
</head>
<body>
<div class="top">
  <h1>🐍 Anaconda Security Quiz · Host</h1>
  <div>Room: <span class="room">${code}</span></div>
</div>
<div class="grid">
  <div class="stage" id="stage">Connecting…</div>
  <div class="scoreboard">
    <h3>Players</h3>
    <div id="players"><div class="empty">Waiting for players…</div></div>
  </div>
</div>
<script>
  const CODE = ${JSON.stringify(code)};
  const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/" + CODE + "?role=host");
  let state = null;

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "state") {
      state = msg.state;
      render();
    }
  };
  ws.onclose = () => {
    document.getElementById("stage").innerHTML = '<h2>Disconnected</h2><p>Reload to rejoin.</p>';
  };

  function send(type, extra = {}) {
    ws.send(JSON.stringify({ type, ...extra }));
  }

  function render() {
    if (!state) return;
    renderPlayers();
    const stage = document.getElementById("stage");
    if (state.phase === "lobby") {
      stage.innerHTML = \`
        <div class="lobby">
          <span class="pill">Lobby</span>
          <h2>Waiting for players…</h2>
          <p>Once everyone has joined, click <b>Start</b>. They'll see the question on their phone, you'll see who's answered. Per-option results stay hidden until you click <b>Reveal</b> — no follow-the-leader.</p>
          <div class="join-info">
            Players go to <code>\${location.origin}/play/\${CODE}</code> and pick a name.
          </div>
          <div class="controls">
            <div class="progress">\${state.players.length} player\${state.players.length === 1 ? "" : "s"} joined</div>
            <button class="primary" \${state.players.length === 0 ? "disabled" : ""} onclick="send('start')">Start →</button>
          </div>
        </div>\`;
    } else if (state.phase === "question" || state.phase === "reveal") {
      const q = state.question;
      const isReveal = state.phase === "reveal";
      // Histogram shown ONLY at reveal — otherwise we'd leak the leading
      // option to anyone watching the screen-share, and players would
      // follow the crowd.
      const answers = isReveal ? (state.answers || {}) : {};
      const totalAnswered = state.answeredCount ?? 0;
      const max = Math.max(1, ...Object.values(answers));
      const cat = state.categories?.[q.cat];
      const catBadge = cat ? \`<span class="pill" style="background:\${cat.bg};color:\${cat.fg};margin-bottom:14px;">\${cat.icon || ""} \${cat.label || q.cat}</span>\` : "";
      const byName = isReveal ? (state.answersByName || {}) : {};
      const opts = q.options.map((o, i) => {
        const c = answers[i] || 0;
        const pct = isReveal ? (c / max) * 100 : 0;
        const isCorrect = isReveal && i === state.correctIndex;
        const names = byName[i] || [];
        const namesHtml = names.length
          ? \`<div class="pickers">\${names.map(n => \`<b>\${escape(n)}</b>\`).join(", ")}</div>\`
          : "";
        return \`
          <div class="option \${isCorrect ? "correct" : ""}">
            <div class="letter">\${String.fromCharCode(65 + i)}</div>
            <div class="text">\${o}</div>
            <div class="bar" style="width:\${isReveal ? pct * 1.2 + "px" : "0"}; visibility:\${isReveal ? "visible" : "hidden"}"></div>
            <div class="count" style="visibility:\${isReveal ? "visible" : "hidden"}">\${c}</div>
            \${namesHtml}
          </div>\`;
      }).join("");
      let revealBanner = "";
      if (isReveal) {
        const correctLetter = String.fromCharCode(65 + state.correctIndex);
        const correctText = q.options[state.correctIndex];
        const correctCount = answers[state.correctIndex] || 0;
        const totalAnsweredAtReveal = Object.values(answers).reduce((a, b) => a + b, 0) || 0;
        const noAnswerCount = state.players.length - totalAnsweredAtReveal;
        const noAnswerLine = noAnswerCount > 0 ? \` · \${noAnswerCount} didn't answer\` : "";
        revealBanner = \`
          <div class="reveal-banner">
            <span class="letter-big">\${correctLetter}</span>\${escape(correctText)}
            <span class="stats">\${correctCount} of \${state.players.length} got it right\${noAnswerLine}</span>
          </div>\`;
      }
      const why = isReveal && state.why ? \`<div class="why">\${state.why}</div>\` : "";
      const btn = isReveal
        ? (state.questionIndex >= state.totalQuestions - 1
            ? '<button class="primary" onclick="send(\\'next\\')">See results →</button>'
            : '<button class="primary" onclick="send(\\'next\\')">Next question →</button>')
        : \`<button class="primary" onclick="send('reveal')">Reveal answer →</button>\`;
      stage.innerHTML = \`
        <div>
          <div class="question-num">Question \${state.questionIndex + 1} of \${state.totalQuestions}</div>
          \${catBadge}
          <div class="question">\${q.q}</div>
          <div class="options">\${opts}</div>
          \${revealBanner}
          \${why}
        </div>
        <div class="controls">
          <div class="progress">\${totalAnswered} of \${state.players.length} answered</div>
          \${btn}
        </div>\`;
    } else if (state.phase === "final") {
      const sorted = [...state.players].sort((a, b) => b.score - a.score);
      const podium = sorted.slice(0, 10).map((p, i) =>
        \`<li>\${escape(p.name)} — <b>\${p.score}</b></li>\`
      ).join("");
      stage.innerHTML = \`
        <div class="final">
          <span class="pill">Final</span>
          <h2>🏆 Game Complete</h2>
          <ol>\${podium}</ol>
        </div>\`;
    }
  }

  function renderPlayers() {
    const el = document.getElementById("players");
    if (!state.players.length) {
      el.innerHTML = '<div class="empty">Waiting for players…</div>';
      return;
    }
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    el.innerHTML = sorted.map(p =>
      \`<div class="player \${p.hasAnswered ? "answered" : ""}">
        <div class="name"><span class="dot"></span>\${escape(p.name)}</div>
        <div class="score">\${p.score}</div>
      </div>\`
    ).join("");
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]));
  }
</script>
</body>
</html>`;
}
