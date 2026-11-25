# Walkthrough Video Script (about 4 minutes)

Record your screen with Loom, OBS, or Zoom, and upload as unlisted on YouTube or Loom. Paste the link into the README.

| Time | Show | Say |
|---|---|---|
| 0:00 | Live app on your phone (or browser device mode at 375px) | "InternHub is a full-stack internship portal I built across five milestones. This is the live, deployed version." |
| 0:25 | Search, then Load more | "Data comes from my REST API with search and pagination. While it loads you see skeletons, and stale searches are cancelled." |
| 0:50 | Click Apply, submit empty | "The form validates on the client for fast feedback. Focus jumps to the first error for keyboard and screen-reader users." |
| 1:20 | Submit a valid application, then try the same email again | "The server re-validates everything and returns 201, then 409 on a duplicate." |
| 1:45 | DevTools > Network: block the API, reload | "If the network or API fails, users get a clear message and a retry button instead of a blank page." |
| 2:10 | Terminal: `npm test`, then `npm run qa` | "28 API tests and 59 browser checks cover the user journey, mobile layout, accessibility, performance, and security." |
| 2:50 | Open docs/QA_EVIDENCE.md and a screenshot | "Evidence is committed in the repo: contrast ratios, page weight about 6 KB, API p95 latency, and screenshots." |
| 3:15 | Open `/healthz`, a log line, `docs/ARCHITECTURE.md` | "Operations: structured logs with request IDs and no personal data, health and readiness endpoints, graceful shutdown. Key decisions and trade-offs are documented." |
| 3:40 | README limitations section | "Known limits: in-memory rate limiting and SQLite. Next I would add Postgres, Redis, and an admin dashboard." |
