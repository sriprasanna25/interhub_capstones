# Security Checklist

- [x] **Server-side validation** for every field (type, length, format); client checks are UX only (QA proves a bypassed client gets 422)
- [x] **Parameterized queries** everywhere (`?` placeholders); LIKE wildcards in search are escaped
- [x] **Rate limiting**: 100/min/IP overall and 5/min/IP on `POST /api/applications`, with `Retry-After`; health checks exempt
- [x] **Proxy-safe limiter**: `X-Forwarded-For` is trusted only when `TRUST_PROXY=true` (both modes tested)
- [x] **Secure headers**: CSP (no inline scripts), nosniff, frame deny, referrer policy, CORP, permissions policy, HSTS
- [x] **XSS prevention**: UI renders API data with `textContent`, never `innerHTML`
- [x] **Input limits**: 10 KB body cap, `application/json` only, resume links must be `https://`
- [x] **Safe errors**: clients get a generic 500 plus a request id; stack traces stay in server logs
- [x] **No personal data in logs**: a test fails if an email, cover letter, or search term appears
- [x] **Path traversal blocked** on static files; only `.html/.js/.css` served
- [x] **Duplicate protection**: UNIQUE(internship_id, email) returns 409
- [x] **Retry safety**: GET retries with backoff; POST is never auto-retried
- [x] **Container hardening**: runs as non-root `node` user, health check configured, no secrets in the image
- [ ] Before real production traffic: shared rate-limit store (Redis), CAPTCHA, admin authentication, database backups, dependency audit and automated updates
