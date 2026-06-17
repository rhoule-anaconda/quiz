import { SHARED_CSS } from "./shared.ts";

export function newGamePage(quizzes: { slug: string; title: string; count: number }[]): string {
  const options = quizzes
    .map(q => `<option value="${q.slug}">${escapeHtml(q.title)} (${q.count})</option>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex,nofollow" />
<title>New Game · Anaconda Security Quiz</title>
<style>${SHARED_CSS}
  body { display:flex; align-items:center; justify-content:center; padding:24px; }
  .wrap { max-width: 520px; width:100%; background: var(--panel); border:1px solid #1f4a30; border-radius:18px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); padding: 36px 32px; }
  h1 { margin: 0 0 6px; font-size: 24px; background: linear-gradient(90deg, var(--green-1), var(--gold)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  p.sub { color: var(--muted); margin: 0 0 28px; font-size: 14px; }
  label { display: block; color: var(--muted); font-size: 13px; margin-bottom: 8px; }
  select { width: 100%; background: var(--panel-2); color: var(--text); border: 1px solid #1f4a30; border-radius: 10px; padding: 12px 14px; font-size: 15px; margin-bottom: 18px; }
  .actions { display: flex; gap: 12px; }
  .links { display: none; flex-direction: column; gap: 12px; margin-top: 20px; }
  .links.shown { display: flex; }
  .link-row { background: var(--panel-2); border: 1px solid #1f4a30; border-radius: 10px; padding: 14px 16px; }
  .link-row h3 { margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--muted); }
  .link-row a { color: var(--gold); word-break: break-all; font-size: 14px; }
  .copy-btn { float: right; background: transparent; border: 1px solid #1f4a30; color: var(--text); padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; }
  .copy-btn:hover { border-color: var(--green-1); }
</style>
</head>
<body>
<div class="wrap">
  <h1>🐍 Start a Game</h1>
  <p class="sub">Pick a quiz. You'll get a host dashboard URL (for screen-share) and a player join URL (for the team).</p>
  <label for="quiz">Quiz</label>
  <select id="quiz">
    ${options}
  </select>
  <div class="actions">
    <button class="primary" id="create">Create room →</button>
  </div>
  <div class="links" id="links">
    <div class="link-row">
      <button class="copy-btn" data-copy="host">Copy</button>
      <h3>Host dashboard (you, screen-share this)</h3>
      <a id="host-link" href="#" target="_blank"></a>
    </div>
    <div class="link-row">
      <button class="copy-btn" data-copy="player">Copy</button>
      <h3>Player join URL (share with everyone)</h3>
      <a id="player-link" href="#" target="_blank"></a>
    </div>
  </div>
</div>
<script>
  const $ = id => document.getElementById(id);
  $("create").addEventListener("click", async () => {
    const slug = $("quiz").value;
    $("create").disabled = true;
    $("create").textContent = "Creating...";
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quizSlug: slug })
    });
    if (!res.ok) {
      $("create").textContent = "Failed — try again";
      $("create").disabled = false;
      return;
    }
    const { code } = await res.json();
    const origin = window.location.origin;
    $("host-link").href = origin + "/host/" + code;
    $("host-link").textContent = origin + "/host/" + code;
    $("player-link").href = origin + "/play/" + code;
    $("player-link").textContent = origin + "/play/" + code;
    $("links").classList.add("shown");
    $("create").textContent = "Created — share the links above";
  });
  document.addEventListener("click", e => {
    const t = e.target;
    if (t instanceof HTMLElement && t.classList.contains("copy-btn")) {
      const which = t.getAttribute("data-copy");
      const link = document.getElementById(which + "-link");
      if (link) {
        navigator.clipboard.writeText(link.textContent || "");
        const old = t.textContent;
        t.textContent = "Copied!";
        setTimeout(() => { t.textContent = old; }, 1200);
      }
    }
  });
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
