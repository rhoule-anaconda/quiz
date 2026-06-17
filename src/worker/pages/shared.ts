export const SHARED_CSS = `
:root {
  --green-1: #43b02a;
  --green-2: #2d7d1f;
  --green-3: #0f4c1a;
  --bg: #0a1410;
  --panel: #11261b;
  --panel-2: #173524;
  --text: #e8f5ec;
  --muted: #8fbf95;
  --gold: #f1c40f;
  --red: #e74c3c;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: radial-gradient(ellipse at top, #1a3325 0%, var(--bg) 60%);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  min-height: 100vh;
}
button, input, select { font-family: inherit; }
button.primary {
  background: linear-gradient(135deg, var(--green-1), var(--green-2));
  border: none; color: white; font-weight: 600;
  padding: 12px 22px; border-radius: 10px; cursor: pointer;
  font-size: 14px; letter-spacing: 0.4px;
  transition: transform .08s, box-shadow .15s;
}
button.primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(67,176,42,0.35);
}
button.primary:disabled { opacity: 0.4; cursor: not-allowed; }
code { background: rgba(255,255,255,0.08); padding: 1px 6px; border-radius: 4px; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 0.92em; }
`;
