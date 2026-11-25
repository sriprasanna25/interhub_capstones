# Engineering Decisions

Short decision records: what I chose, why, and what I gave up.

**1. Zero runtime dependencies (Node built-ins only).**
*Why:* nothing to install, no supply-chain risk, tiny Docker image, and every line is understandable.
*Trade-off:* I wrote a small router, rate limiter, and header helper that Express, helmet, and express-rate-limit provide ready-made. At larger scale I would switch to those and maintained libraries.

**2. SQLite with parameterized queries.**
*Why:* zero setup, transactional, and perfect for a single-instance portal. Every query uses `?` placeholders, so SQL injection is structurally impossible.
*Trade-off:* single writer and a local file. Move to Postgres for multiple instances.

**3. The server is the validation authority.**
*Why:* client checks can be bypassed, so they exist only for instant feedback. The QA suite proves a bypassed client still gets a 422.
*Trade-off:* the rules are duplicated in two places. I accepted that over a build step to share code.

**4. Vanilla JavaScript, mobile-first CSS, native `<dialog>`.**
*Why:* the form is the product, and `<dialog>` gives focus trapping, Escape-to-close, and focus restore for free. The whole page is about 6 KB gzipped.
*Trade-off:* manual DOM code. A framework would pay off once the UI grows.

**5. Retry only what is safe.**
*Why:* GET requests retry with exponential backoff on 5xx and network errors. POST never auto-retries, because a retry could double-submit. The user decides. Stale searches are cancelled with `AbortController`.

**6. Rate limiting keyed by IP, with an explicit `TRUST_PROXY` switch.**
*Why:* behind a proxy every request appears to come from the proxy, so the limiter would block everyone at once. With the switch off, spoofed `X-Forwarded-For` headers are ignored. Both behaviours have tests.
*Trade-off:* in-memory counters (see README limitations).

**7. Logs without personal data.**
*Why:* applications contain names, emails, and cover letters. Logs record method, path, status, duration, and request id only, and a test fails if a body or search term leaks.

**8. Compression and caching inside the app.**
*Why:* assets are gzipped once at first request and served with ETags, giving about 6 KB first loads and 304 revalidation without a CDN.
*Trade-off:* a CDN would still be better for global users.

**9. Health checks split into liveness and readiness.**
*Why:* `/healthz` says the process is alive, and `/readyz` also checks the database. Platforms restart on the first and stop routing traffic on the second.

## What I would do next
Admin login and review dashboard, Postgres, Redis-backed rate limiting, email confirmation, a CAPTCHA, metrics (Prometheus), and error tracking.
