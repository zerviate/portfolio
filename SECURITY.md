# Security

Please report suspected vulnerabilities privately to **devzerviate@proton.me**, with the affected URL/file, reproduction steps and expected impact. Do not include live credentials or personal data in public issues. The current `main` branch is maintained.

This is a static site with no application backend, user accounts or third-party runtime dependencies. Public HTML, source code, contact details and images are intentionally readable; browser code is not a place to store secrets.

Before publishing changes, run `npm test`, `npm audit --audit-level=low` and `python -m pip_audit -r requirements-dev.txt`. Repository checks use Git's tracked and non-ignored file inventory; they require a Git checkout. Review the staged diff and scan it with a dedicated secret scanner as well. Pattern checks and dependency audits do not prove the absence of vulnerabilities.

Identifying details that must never be published (legal name, phone number, private email) go in a local, gitignored `.private-terms` file, one per line. `npm run test:security` fails if any of them appears in `dist/`, and skips that check when the file is absent.

`_headers` holds exactly one strict Content-Security-Policy on `/*`, so every route, including nested 404s and new pages, is covered; the security check rejects a second policy, a detached header or an `unsafe-*` source. The `portfolio-page` Cloudflare Worker (Workers Builds, see `wrangler.jsonc`) must publish only `dist/` after `npm run build:site`. Verify HTTPS and response headers on the deployed domain after hosting changes. GitHub and Cloudflare account access, tokens and deployment settings are separate security boundaries from this source tree.
