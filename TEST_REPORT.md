# Test Report

Run date: 2026-11-25 · Node v22.23.5 · command: `npm test` (browser checks are in QA_EVIDENCE.md)

| # | Test | Result |
|---|------|--------|
| 1 | GET /api/internships returns seeded list with pagination metadata | PASS |
| 2 | last page has hasMore=false | PASS |
| 3 | limit is clamped to 50 and page to at least 1 | PASS |
| 4 | search filters results and total reflects the filter | PASS |
| 5 | GET /api/internships/:id returns 404 for unknown id | PASS |
| 6 | valid application is created (201) | PASS |
| 7 | duplicate application is rejected (409) | PASS |
| 8 | invalid fields are rejected with per-field errors (422) | PASS |
| 9 | javascript: resume URL is rejected | PASS |
| 10 | unknown internshipId is rejected | PASS |
| 11 | string internshipId is rejected (type check) | PASS |
| 12 | malformed JSON returns 400 | PASS |
| 13 | wrong content type returns 415 | PASS |
| 14 | oversized body is refused | PASS |
| 15 | SQL injection in search is treated as plain text | PASS |
| 16 | SQL injection in application fields is stored literally, tables survive | PASS |
| 17 | secure headers are present | PASS |
| 18 | path traversal cannot read files outside public/ | PASS |
| 19 | application endpoint is rate limited (429 + Retry-After) | PASS |
| 20 | /healthz and /readyz report healthy | PASS |
| 21 | health checks are never rate limited | PASS |
| 22 | every response carries an X-Request-Id | PASS |
| 23 | logs are structured JSON and contain no personal data | PASS |
| 24 | static assets are gzip-compressed | PASS |
| 25 | ETag revalidation returns 304 | PASS |
| 26 | frontend HTML is served and revalidated | PASS |
| 27 | trustProxy=false ignores spoofed X-Forwarded-For (cannot dodge the limiter) | PASS |
| 28 | trustProxy=true rate limits per real client behind a proxy | PASS |

**Summary:** 28 tests, 28 passed, 0 failed.
