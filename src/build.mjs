#!/usr/bin/env node
// Build standalone quiz HTML files from questions/*.json
// Usage: node src/build.mjs

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const QUESTIONS_DIR = path.join(ROOT, "questions");
const DIST_DIR = path.join(ROOT, "dist");
const TEMPLATE = fs.readFileSync(path.join(__dirname, "template.html"), "utf8");

// Stable per-deployment listing-page token. Gitignored. Generated once on
// first build and reused thereafter so the URL we share doesn't change every
// apply. To rotate it (e.g. a teammate left), delete the file and rebuild.
const TOKEN_FILE = path.join(ROOT, ".list-token");
function loadOrCreateToken() {
  if (fs.existsSync(TOKEN_FILE)) {
    const t = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (/^[a-z0-9]{16,}$/.test(t)) return t;
  }
  const t = crypto.randomBytes(12).toString("hex"); // 24 hex chars
  fs.writeFileSync(TOKEN_FILE, t + "\n");
  return t;
}

function titleFromSlug(slug) {
  return slug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function validate(quiz, slug) {
  if (!Array.isArray(quiz.questions)) throw new Error(`${slug}: missing questions[]`);
  quiz.questions.forEach((q, i) => {
    if (!q.q || !Array.isArray(q.options) || typeof q.answer !== "number" || !q.cat) {
      throw new Error(`${slug}: question ${i} is malformed`);
    }
    if (q.answer < 0 || q.answer >= q.options.length) {
      throw new Error(`${slug}: question ${i} answer index out of range`);
    }
  });
}

fs.mkdirSync(DIST_DIR, { recursive: true });

const files = fs.readdirSync(QUESTIONS_DIR).filter(f => f.endsWith(".json")).sort();
if (!files.length) {
  console.error("No questions found in questions/");
  process.exit(1);
}

const built = [];
for (const file of files) {
  const slug = path.basename(file, ".json");
  const title = titleFromSlug(slug);
  const raw = fs.readFileSync(path.join(QUESTIONS_DIR, file), "utf8");
  const quiz = JSON.parse(raw);
  validate(quiz, slug);

  const html = TEMPLATE
    .replaceAll("{{TITLE}}", title)
    .replaceAll("{{TITLE_JSON}}", JSON.stringify(title))
    .replace("{{QUESTIONS_JSON}}", JSON.stringify(quiz));

  const outPath = path.join(DIST_DIR, `${slug}.html`);
  fs.writeFileSync(outPath, html);
  built.push({ slug, title, count: quiz.questions.length, file: `${slug}.html` });
  console.log(`✓ ${slug}.html (${quiz.questions.length} questions)`);
}

const token = loadOrCreateToken();

// === default page: entry field ===
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Anaconda Security Quiz</title>
<style>
  :root { --bg:#0a1410; --panel:#11261b; --panel-2:#173524; --text:#e8f5ec; --muted:#8fbf95; --green:#43b02a; --gold:#f1c40f; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background: radial-gradient(ellipse at top, #1a3325 0%, var(--bg) 60%); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; min-height:100vh; }
  body { display:flex; align-items:center; justify-content:center; padding:24px; }
  .wrap { max-width: 520px; width:100%; background: var(--panel); border:1px solid #1f4a30; border-radius:18px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); padding: 40px 32px; text-align: center; }
  .snake { font-size: 56px; margin-bottom: 12px; filter: drop-shadow(0 4px 8px rgba(67,176,42,0.4)); }
  h1 { margin: 0 0 8px; font-size: 22px; background: linear-gradient(90deg, var(--green), var(--gold)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  p.sub { color: var(--muted); margin: 0 0 28px; font-size: 14px; line-height: 1.5; }
  form { display:flex; gap:8px; }
  input[type=text] { flex:1; background: var(--panel-2); border:1px solid #1f4a30; border-radius: 10px; color: var(--text); padding: 12px 14px; font-size: 15px; font-family: inherit; outline: none; transition: border-color .15s; }
  input[type=text]:focus { border-color: var(--green); }
  input[type=text]::placeholder { color: #5d8a64; }
  button { background: linear-gradient(135deg, var(--green), #2d7d1f); border: none; color: white; font-weight: 600; padding: 12px 22px; border-radius: 10px; cursor: pointer; font-size: 14px; font-family: inherit; transition: transform .08s, box-shadow .15s; }
  button:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(67,176,42,0.35); }
  .footer { margin-top: 24px; color: #5d8a64; font-size: 11px; }
  .err { color: #ff8a8a; margin-top: 12px; font-size: 13px; min-height: 18px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="snake">🐍</div>
  <h1>Anaconda Security Quiz</h1>
  <p class="sub">Type the quiz name you were sent.</p>
  <form id="f" autocomplete="off">
    <input type="text" id="q" placeholder="quiz name" autofocus spellcheck="false" />
    <button type="submit">Go →</button>
  </form>
  <div class="err" id="err"></div>
  <div class="footer">If you don't know the name, ask whoever sent you here.</div>
</div>
<script>
  const slugify = s => s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  document.getElementById('f').addEventListener('submit', e => {
    e.preventDefault();
    const raw = document.getElementById('q').value;
    const slug = slugify(raw);
    if (!slug) {
      document.getElementById('err').textContent = "Type something first.";
      return;
    }
    window.location.href = '/' + slug;
  });
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(DIST_DIR, "index.html"), indexHtml);

// === listing page at /<token> ===
const listingHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex,nofollow" />
<title>Anaconda Security — All Quizzes</title>
<style>
  :root { --bg:#0a1410; --panel:#11261b; --text:#e8f5ec; --muted:#8fbf95; --green:#43b02a; --gold:#f1c40f; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background: radial-gradient(ellipse at top, #1a3325 0%, var(--bg) 60%); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; min-height:100vh; }
  body { display:flex; align-items:center; justify-content:center; padding:24px; }
  .wrap { max-width: 640px; width:100%; background: var(--panel); border:1px solid #1f4a30; border-radius:18px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); padding: 32px; }
  h1 { margin: 0 0 6px; font-size: 24px; background: linear-gradient(90deg, var(--green), var(--gold)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  p.sub { color: var(--muted); margin: 0 0 24px; font-size: 14px; }
  ul { list-style: none; padding: 0; margin: 0; display:grid; gap:10px; }
  a.quiz { display:flex; justify-content: space-between; align-items: center; padding:14px 16px; background:#173524; border:1px solid #1f4a30; border-radius:10px; text-decoration:none; color: var(--text); transition: border-color .15s, transform .08s; }
  a.quiz:hover { border-color: var(--green); transform: translateY(-1px); }
  .meta { color: var(--muted); font-size:12px; }
  .footer { margin-top: 24px; color: var(--muted); font-size:12px; text-align:center; }
</style>
</head>
<body>
<div class="wrap">
  <h1>🐍 All Quizzes</h1>
  <p class="sub">Pick your poison.</p>
  <ul>
    ${built.map(b => `<li><a class="quiz" href="/${b.slug}"><span>${b.title}</span><span class="meta">${b.count} questions</span></a></li>`).join("\n    ")}
  </ul>
  <div class="footer">Restricted to Warp users · sandbox deployment</div>
</div>
</body>
</html>
`;
fs.writeFileSync(path.join(DIST_DIR, `${token}.html`), listingHtml);

// Copy Cloudflare Pages headers file
const HEADERS_SRC = path.join(__dirname, "_headers");
if (fs.existsSync(HEADERS_SRC)) {
  fs.copyFileSync(HEADERS_SRC, path.join(DIST_DIR, "_headers"));
}

// Pretty URLs: /linux-sysadmin-security -> /linux-sysadmin-security.html
// Cloudflare Pages auto-resolves .html for clean paths, but emit explicit
// _redirects so the behavior is documented and deterministic.
const redirects = built.map(b => `/${b.slug} /${b.slug}.html 200`).join("\n") +
  `\n/${token} /${token}.html 200\n`;
fs.writeFileSync(path.join(DIST_DIR, "_redirects"), redirects);

console.log(`✓ index.html (entry field)`);
console.log(`✓ ${token}.html (private listing page, ${built.length} quizzes)`);
console.log(`✓ _headers, _redirects`);
console.log(`\nDone. Output in dist/`);
console.log(`\n  Entry page:   /`);
console.log(`  All quizzes:  /${token}`);
