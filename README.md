# Security Team Quizzes

Single-page web quizzes for security team trivia nights. Each quiz is a standalone HTML file generated from a JSON question set.

## Layout

```
questions/         # one .json per quiz — filename is the slug AND the title
  security-team-trivia-night.json
  linux-sysadmin-security.json
src/
  template.html    # the quiz UI (categories auto-detected, colors customizable per quiz)
  build.mjs        # node script: questions/*.json → dist/*.html + dist/index.html
dist/              # built output, ready to host
terraform/         # tiny EC2 in the sandbox account, nginx, Warp-IP-only
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

## Build

```sh
node src/build.mjs
```

Outputs:
- `dist/<slug>.html` for each quiz
- `dist/index.html` listing all quizzes

## Deploy (sandbox)

The sandbox account is torn down weekly, so we just reapply. State is local — losing it doesn't matter.

```sh
cd terraform
cp terraform.tfvars.example terraform.tfvars  # first time only

# Auth via SSO
aws sso login --profile <your-sandbox-profile>
export AWS_PROFILE=<your-sandbox-profile>

terraform init    # first time only
terraform apply
```

Output gives you `quiz_url`: `https://quiz.anaconda-sandbox.com/`. The host is locked to Warp egress IPs only at the network layer; TLS is provisioned by Caddy via Let's Encrypt using Route53 DNS-01 (so port 80 stays closed to the internet).

URL pattern: `https://quiz.anaconda-sandbox.com/<slug>` — e.g. `https://quiz.anaconda-sandbox.com/linux-sysadmin-security`.

First boot takes ~2-3 minutes: Caddy is built from source with `xcaddy` (we need the Route53 DNS plugin), then it requests the cert. If the URL doesn't load, SSM in and `journalctl -u caddy -f`.

`user_data_replace_on_change = true` means the instance gets recreated whenever the dist contents change, so `terraform apply` is your redeploy.
