import { SHARED_CSS } from "./shared.ts";

export function playerPage(code: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>Play · ${code}</title>
<style>${SHARED_CSS}
  body { display: flex; flex-direction: column; min-height: 100vh; padding: 16px; }
  .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-size: 13px; color: var(--muted); }
  .top .room { font-family: "SF Mono", Menlo, monospace; color: var(--gold); letter-spacing: 2px; }
  .panel { background: var(--panel); border: 1px solid #1f4a30; border-radius: 16px; padding: 24px; }
  .center { flex: 1; display: flex; flex-direction: column; justify-content: center; max-width: 560px; width: 100%; margin: 0 auto; }
  .join h1 { margin: 0 0 8px; font-size: 22px; background: linear-gradient(90deg, var(--green-1), var(--gold)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .join p { color: var(--muted); margin: 0 0 20px; font-size: 14px; }
  input[type=text] { width: 100%; background: var(--panel-2); border: 1px solid #1f4a30; border-radius: 10px; color: var(--text); padding: 14px 16px; font-size: 17px; outline: none; margin-bottom: 16px; }
  input[type=text]:focus { border-color: var(--green-1); }
  button.primary { width: 100%; padding: 14px; font-size: 16px; }
  .pill { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; background: #1a334d; color: #8acaff; margin-bottom: 12px; }
  .question { font-size: 20px; font-weight: 600; line-height: 1.4; margin: 0 0 20px; }
  .opts { display: grid; gap: 10px; }
  .opt { background: var(--panel-2); border: 2px solid #1f4a30; color: var(--text); text-align: left; padding: 16px 18px; border-radius: 12px; cursor: pointer; font-size: 16px; line-height: 1.4; transition: all .15s; }
  .opt:hover:not(:disabled):not(.locked) { background: #1d3f2a; border-color: var(--green-1); }
  .opt.selected { border-color: var(--green-1); background: #1d3f2a; }
  .opt.correct { border-color: var(--green-1); background: #1a4d22; color: #c5ffd0; }
  .opt.wrong-pick { border-color: var(--red); background: #4d1a1a; color: #ffc9c9; }
  .opt.dim { opacity: 0.5; }
  .opt:disabled { cursor: default; }
  .why { margin-top: 16px; padding: 14px 16px; background: #0e1f15; border-left: 3px solid var(--green-1); border-radius: 6px; font-size: 14px; line-height: 1.5; color: var(--muted); }
  .why strong { color: var(--gold); }
  .scoreline { margin-top: 14px; text-align: center; color: var(--muted); font-size: 14px; }
  .scoreline b { color: var(--gold); }
  .waiting { text-align: center; color: var(--muted); padding: 40px 0; font-size: 15px; }
  .final h2 { font-size: 28px; margin: 0 0 12px; background: linear-gradient(90deg, var(--green-1), var(--gold)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .final .your-score { font-size: 56px; font-weight: 700; color: var(--gold); text-align: center; margin: 16px 0; }
  .final .leaderboard { padding-left: 24px; line-height: 1.7; }
  .final .leaderboard b { color: var(--gold); }
  .err { color: #ff8a8a; font-size: 13px; min-height: 18px; margin-top: 6px; }
</style>
</head>
<body>
<div class="top">
  <span>🐍 Anaconda Security Quiz</span>
  <span class="room">${code}</span>
</div>
<div class="center" id="root">Connecting…</div>
<script>
  const CODE = ${JSON.stringify(code)};
  let ws = null;
  let myName = localStorage.getItem("quiz-name-" + CODE) || "";
  let state = null;
  let lastSelectedThisQuestion = null;
  let lastQuestionIndex = -1;

  function $(id) { return document.getElementById(id); }
  function escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]));
  }

  // On auto-rejoin (localStorage), still pre-flight in case someone else now
  // has this name (e.g. a different player took it during a disconnect).
  if (myName) {
    fetch("/api/rooms/" + CODE + "/check-name", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: myName }),
    }).then(r => {
      if (r.ok) connect(myName);
      else { localStorage.removeItem("quiz-name-" + CODE); renderJoin("Your previous name is in use. Pick a new one."); }
    }).catch(() => connect(myName)); // network blip — try the WS anyway
  } else {
    renderJoin();
  }

  function renderJoin(err) {
    const root = $("root");
    root.innerHTML = \`
      <div class="panel join">
        <h1>Join the game</h1>
        <p>Pick a display name. Everyone will see it.</p>
        <input type="text" id="name" placeholder="Your name" maxlength="32" autofocus value="\${escape(myName || "")}" />
        <div class="err" id="err">\${err || ""}</div>
        <button class="primary" id="join">Join →</button>
      </div>\`;
    $("name").addEventListener("keydown", e => { if (e.key === "Enter") $("join").click(); });
    $("join").addEventListener("click", async () => {
      const name = $("name").value.trim();
      if (!name) { $("err").textContent = "Pick a name."; return; }
      $("join").disabled = true;
      $("err").textContent = "";
      // Pre-flight: returns 409 if a different live player already has this name.
      // Allows reconnect of a player whose previous socket has closed.
      try {
        const res = await fetch("/api/rooms/" + CODE + "/check-name", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (res.status === 409) {
          $("err").textContent = "Name already taken in this room. Pick another.";
          $("join").disabled = false;
          return;
        }
        if (!res.ok) {
          $("err").textContent = "Couldn't join. Try again.";
          $("join").disabled = false;
          return;
        }
      } catch (e) {
        $("err").textContent = "Network error. Try again.";
        $("join").disabled = false;
        return;
      }
      myName = name;
      localStorage.setItem("quiz-name-" + CODE, name);
      connect(name);
    });
  }

  function connect(name) {
    const proto = location.protocol === "https:" ? "wss://" : "ws://";
    ws = new WebSocket(proto + location.host + "/ws/" + CODE + "?role=player&name=" + encodeURIComponent(name));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "state") {
        if (state && state.questionIndex !== msg.state.questionIndex) {
          lastSelectedThisQuestion = null;
        }
        state = msg.state;
        if (state.questionIndex !== lastQuestionIndex) {
          lastQuestionIndex = state.questionIndex;
          lastSelectedThisQuestion = null;
        }
        render();
      }
    };
    ws.onclose = () => {
      $("root").innerHTML = '<div class="panel"><h1>Disconnected</h1><p style="color:var(--muted)">Tap to reconnect.</p><button class="primary" onclick="location.reload()">Reconnect</button></div>';
    };
    ws.onerror = () => {
      // close handler will fire too
    };
  }

  function send(type, extra = {}) {
    ws.send(JSON.stringify({ type, ...extra }));
  }

  function render() {
    const root = $("root");
    const me = state.players.find(p => p.name === myName);
    if (state.phase === "lobby") {
      root.innerHTML = \`
        <div class="panel">
          <span class="pill">Joined</span>
          <h2 style="margin:8px 0 4px;font-size:22px;">Hi, \${escape(myName)} 👋</h2>
          <p style="color:var(--muted);margin:0;">Waiting for the host to start…</p>
          <div class="scoreline" style="margin-top:20px;">
            \${state.players.length} player\${state.players.length === 1 ? "" : "s"} in the room
          </div>
        </div>\`;
    } else if (state.phase === "question" || state.phase === "reveal") {
      const q = state.question;
      const cat = state.categories?.[q.cat];
      const catBadge = cat ? \`<span class="pill" style="background:\${cat.bg};color:\${cat.fg};">\${cat.icon || ""} \${cat.label || q.cat}</span>\` : "";
      const isReveal = state.phase === "reveal";
      const myAnswer = state.myAnswer;
      const locked = myAnswer !== null && myAnswer !== undefined;
      const opts = q.options.map((o, i) => {
        let cls = "opt";
        if (isReveal) {
          if (i === state.correctIndex) cls += " correct";
          else if (i === myAnswer) cls += " wrong-pick";
          else cls += " dim";
        } else if (locked && i === myAnswer) {
          cls += " selected locked";
        } else if (locked) {
          cls += " locked dim";
        }
        return \`<button class="\${cls}" \${locked ? "disabled" : ""} data-idx="\${i}">\${o}</button>\`;
      }).join("");
      const why = isReveal && state.why ? \`<div class="why">\${state.why}</div>\` : "";
      const status = isReveal
        ? (myAnswer === state.correctIndex ? '✅ Correct!' : (myAnswer == null ? "⏱ No answer" : '❌ Not quite.'))
        : (locked ? "Answer locked. Waiting for others…" : "Pick one.");
      root.innerHTML = \`
        <div class="panel">
          \${catBadge}
          <div style="color:var(--muted);font-size:12px;margin:8px 0;">Question \${state.questionIndex + 1} of \${state.totalQuestions}</div>
          <div class="question">\${q.q}</div>
          <div class="opts">\${opts}</div>
          \${why}
          <div class="scoreline">\${status} · Your score: <b>\${me?.score ?? 0}</b></div>
        </div>\`;
      if (!locked && !isReveal) {
        root.querySelectorAll(".opt").forEach(b => {
          b.addEventListener("click", () => {
            const idx = parseInt(b.getAttribute("data-idx"), 10);
            send("answer", { idx });
            lastSelectedThisQuestion = idx;
          });
        });
      }
    } else if (state.phase === "final") {
      const sorted = [...state.players].sort((a, b) => b.score - a.score);
      const myRank = sorted.findIndex(p => p.name === myName) + 1;
      const board = sorted.slice(0, 10).map((p, i) => {
        const me = p.name === myName ? " ← you" : "";
        return \`<li>\${escape(p.name)} — <b>\${p.score}</b>\${me}</li>\`;
      }).join("");
      root.innerHTML = \`
        <div class="panel final">
          <h2>🏆 Game over</h2>
          <p style="color:var(--muted);text-align:center;margin:0;">\${escape(myName)}, you finished #\${myRank} of \${sorted.length}</p>
          <div class="your-score">\${me?.score ?? 0}</div>
          <ol class="leaderboard">\${board}</ol>
        </div>\`;
    }
  }
</script>
</body>
</html>`;
}
