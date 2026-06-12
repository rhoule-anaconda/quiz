# Security Team Quizzes

Single-page web quizzes for security team trivia nights. Each quiz is a standalone HTML file generated from a JSON question set, deployed to Cloudflare Pages, and gated behind Cloudflare Access (Anaconda SSO).

## Layout

```
questions/         # one .json per quiz — filename is the slug AND the title
src/
  template.html    # the quiz UI (categories auto-detected, colors customizable)
  build.mjs        # node script: questions/*.json → dist/*.html + dist/index.html
  _headers         # Cloudflare Pages security headers (copied to dist/ on build)
dist/              # built output, ready to deploy
cloudflare/
  wrangler.toml    # Pages project config
package.json       # `npm run build`, `npm run deploy`, `npm run preview`
```

## Authoring a new quiz

> **Answers and explanations are visible in the page source.** The questions JSON is embedded verbatim in the rendered HTML. This format is for trivia, learning, and post-quiz discussion — **not** for graded assessments, certifications, or anything where someone could benefit from cheating. If you need real answer-hiding, you need a server-side grading endpoint, not this template.

1. Create `questions/<slug>.json`. The filename becomes the URL path AND the page title (kebab-case → Title Case).
2. Each question needs `cat`, `q`, `options[]`, `answer` (0-based index), `why` (HTML allowed).
3. Optional `categories` block customizes label/icon/colors per category key.

```json
{
  "categories": {
    "linux":  { "label": "Linux", "icon": "🐧", "bg": "#1a4d22", "fg": "#8aff9a" }
  },
  "questions": [
    { "cat": "linux", "q": "...", "options": ["a", "b"], "answer": 1, "why": "..." }
  ]
}
```

## Build & preview locally

```sh
npm run build      # generates dist/
npm run preview    # opens dist/index.html in the browser
```

## Deploy

One-time setup:

```sh
wrangler login     # OAuth into the Anaconda Cloudflare account
```

Every deploy:

```sh
npm run deploy
```

That builds `dist/`, then `wrangler pages deploy` ships it. First deploy creates the `anaconda-security-quiz` Pages project; subsequent deploys publish a new version. Cloudflare gives each deploy its own preview URL plus the production alias.

## Custom domain

Production URL: **`https://secquiz.anacondaconnect.com`**

After the first deploy, add the custom domain in the Cloudflare dashboard:

1. **Pages → anaconda-security-quiz → Custom domains → Set up a custom domain**
2. Enter `secquiz.anacondaconnect.com`
3. Cloudflare auto-creates the CNAME inside the `anacondaconnect.com` zone (the zone already lives in our Cloudflare account; see `~/git/infra/terraform/cloudflare/anacondaconnect.com.tf`).
4. Cert is provisioned automatically.

## Access (auth)

The Pages site is gated by Cloudflare Access. Anyone hitting it must complete Anaconda SSO before any HTML is served. The Access app + identity provider are configured in the Cloudflare Zero Trust dashboard, not in this repo.

Setup steps (one-time):
1. **Zero Trust → Access → Applications → Add an application → Self-hosted**
2. Application domain: `secquiz.anacondaconnect.com`
3. Identity provider: the existing Anaconda SSO IdP (Okta, etc.)
4. Policy: Allow `emails ending in @anaconda.com` (or whichever Access group fits)
5. Save

URL pattern:
- `/` — entry page where you type the quiz name
- `/<slug>` — the quiz itself (e.g. `/linux-sysadmin-security`)
- `/<token>` — full listing of all quizzes; the token is in `.list-token` (gitignored)

To rotate the listing token (e.g. someone left): `rm .list-token && npm run build && npm run deploy`.

## Why Cloudflare Pages instead of EC2?

The site is 100% static HTML. Hosting it on a VM meant fighting xcaddy compile times, AL2023 tmpfs limits, S3 user_data workarounds, weekly sandbox teardowns, and Caddy ACME plumbing — all to serve 5 files. Pages takes care of all of that for free, and Access provides real SSO identity instead of treating "is this IP a Warp egress" as a proxy for identity.
