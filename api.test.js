import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import http from 'node:http';
import { createApp } from '../server/app.js';
import { createLogger } from '../server/logger.js';

const silent = createLogger({ level: 'silent' });
const listen = async (opts = {}) => {
  const s = createApp({ logger: silent, ...opts });
  await new Promise((r) => s.listen(0, r));
  return { s, base: `http://localhost:${s.address().port}` };
};

let server, base;
const valid = {
  name: 'Asha Kumar', email: 'asha@example.com', phone: '+91 98765 43210',
  resumeUrl: 'https://example.com/resume.pdf',
  coverLetter: 'I love building full stack apps and want to learn from your team.',
  internshipId: 1,
};
const post = (body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(`${base}/api/applications`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

before(async () => {
  // High limits so ordinary tests are not throttled; limiters are tested separately below
  ({ s: server, base } = await listen({
    generalLimit: { windowMs: 60_000, max: 10_000 },
    applyLimit: { windowMs: 60_000, max: 10_000 },
  }));
});
after(() => server.close());

// ---------- Data loading and pagination ----------
test('GET /api/internships returns seeded list with pagination metadata', async () => {
  const res = await fetch(`${base}/api/internships?limit=5`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.length, 5);
  assert.equal(body.total, 12);
  assert.equal(body.hasMore, true);
});

test('last page has hasMore=false', async () => {
  const body = await (await fetch(`${base}/api/internships?limit=5&page=3`)).json();
  assert.equal(body.data.length, 2);
  assert.equal(body.hasMore, false);
});

test('limit is clamped to 50 and page to at least 1', async () => {
  const body = await (await fetch(`${base}/api/internships?limit=9999&page=-4`)).json();
  assert.equal(body.limit, 50);
  assert.equal(body.page, 1);
});

test('search filters results and total reflects the filter', async () => {
  const body = await (await fetch(`${base}/api/internships?search=cyber`)).json();
  assert.equal(body.data.length, 1);
  assert.equal(body.total, 1);
  assert.match(body.data[0].title, /Cybersecurity/);
});

test('GET /api/internships/:id returns 404 for unknown id', async () => {
  assert.equal((await fetch(`${base}/api/internships/9999`)).status, 404);
});

// ---------- Server-side validation ----------
test('valid application is created (201)', async () => {
  const res = await post(valid);
  assert.equal(res.status, 201);
  assert.ok((await res.json()).data.id);
});

test('duplicate application is rejected (409)', async () => {
  assert.equal((await post(valid)).status, 409);
});

test('invalid fields are rejected with per-field errors (422)', async () => {
  const res = await post({ ...valid, name: 'A', email: 'nope', coverLetter: 'short', resumeUrl: 'http://x.com' });
  const { fields } = await res.json();
  assert.equal(res.status, 422);
  for (const k of ['name', 'email', 'coverLetter', 'resumeUrl']) assert.ok(fields[k], `${k} should have an error`);
});

test('javascript: resume URL is rejected', async () => {
  assert.equal((await post({ ...valid, email: 'x@example.com', resumeUrl: 'javascript:alert(1)' })).status, 422);
});

test('unknown internshipId is rejected', async () => {
  assert.equal((await post({ ...valid, email: 'y@example.com', internshipId: 9999 })).status, 422);
});

test('string internshipId is rejected (type check)', async () => {
  assert.equal((await post({ ...valid, email: 'z@example.com', internshipId: '1' })).status, 422);
});

test('malformed JSON returns 400', async () => {
  assert.equal((await post('{bad json')).status, 400);
});

test('wrong content type returns 415', async () => {
  assert.equal((await post(JSON.stringify(valid), { 'Content-Type': 'text/plain' })).status, 415);
});

test('oversized body is refused', async () => {
  const res = await post({ ...valid, email: 'big@example.com', coverLetter: 'a'.repeat(20_000) }).catch(() => null);
  assert.ok(res === null || res.status === 413); // server may close the socket after refusing
});

// ---------- Security ----------
test('SQL injection in search is treated as plain text', async () => {
  const res = await fetch(`${base}/api/internships?search=${encodeURIComponent("' OR 1=1 --")}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.length, 0);
});

test('SQL injection in application fields is stored literally, tables survive', async () => {
  const res = await post({ ...valid, email: 'sql@example.com', name: "Robert'); DROP TABLE internships;--" });
  assert.equal(res.status, 201);
  assert.equal((await (await fetch(`${base}/api/internships`)).json()).total, 12);
});

test('secure headers are present', async () => {
  const res = await fetch(`${base}/api/internships`);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('path traversal cannot read files outside public/', async () => {
  assert.equal((await fetch(`${base}/..%2fserver%2fdb.js`)).status, 404);
});

test('application endpoint is rate limited (429 + Retry-After)', async () => {
  const { s, base: b } = await listen({ applyLimit: { windowMs: 60_000, max: 2 } });
  const send = () => fetch(`${b}/api/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await send()).status, 422);
  assert.equal((await send()).status, 422);
  const third = await send();
  assert.equal(third.status, 429);
  assert.ok(third.headers.get('retry-after'));
  s.close();
});

// ---------- Production readiness: health, logging, performance ----------
test('/healthz and /readyz report healthy', async () => {
  const h = await fetch(`${base}/healthz`);
  assert.equal(h.status, 200);
  assert.equal((await h.json()).status, 'ok');
  const r = await fetch(`${base}/readyz`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'ready');
});

test('health checks are never rate limited', async () => {
  const { s, base: b } = await listen({ generalLimit: { windowMs: 60_000, max: 1 } });
  for (let i = 0; i < 5; i++) assert.equal((await fetch(`${b}/healthz`)).status, 200);
  s.close();
});

test('every response carries an X-Request-Id', async () => {
  const res = await fetch(`${base}/api/internships`);
  assert.match(res.headers.get('x-request-id'), /^[0-9a-f-]{8}$/);
});

test('logs are structured JSON and contain no personal data', async () => {
  const lines = [];
  const { s, base: b } = await listen({ logger: createLogger({ level: 'info', write: (l) => lines.push(l) }) });
  await fetch(`${b}/api/applications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...valid, email: 'private.person@example.com', coverLetter: 'SECRET-COVER-LETTER-TEXT-12345' }),
  });
  await fetch(`${b}/api/internships?search=confidential-term`);
  s.close();
  const parsed = lines.map((l) => JSON.parse(l)); // throws if any line is not valid JSON
  assert.ok(parsed.some((l) => l.msg === 'request' && l.status === 201 && l.path === '/api/applications'));
  assert.ok(parsed.every((l) => l.time && l.level));
  const all = lines.join('\n');
  for (const secret of ['private.person@example.com', 'SECRET-COVER-LETTER', 'confidential-term']) {
    assert.ok(!all.includes(secret), `logs must not contain ${secret}`);
  }
});

test('static assets are gzip-compressed', async () => {
  // Use raw http: fetch() silently decompresses, which would hide the Content-Encoding behaviour
  const { headers, body } = await new Promise((resolve, reject) => {
    http.get(`${base}/app.js`, { headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
  assert.equal(headers['content-encoding'], 'gzip');
  assert.match(zlib.gunzipSync(body).toString(), /showModal/);
});

test('ETag revalidation returns 304', async () => {
  const first = await fetch(`${base}/styles.css`);
  const etag = first.headers.get('etag');
  assert.ok(etag);
  assert.equal((await fetch(`${base}/styles.css`, { headers: { 'If-None-Match': etag } })).status, 304);
});

test('frontend HTML is served and revalidated', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  assert.match(await res.text(), /<html lang="en">/);
});

test('trustProxy=false ignores spoofed X-Forwarded-For (cannot dodge the limiter)', async () => {
  const { s, base: b } = await listen({ generalLimit: { windowMs: 60_000, max: 2 } });
  const hit = (ip) => fetch(`${b}/api/internships`, { headers: { 'X-Forwarded-For': ip } });
  await hit('1.1.1.1'); await hit('2.2.2.2');
  assert.equal((await hit('3.3.3.3')).status, 429);
  s.close();
});

test('trustProxy=true rate limits per real client behind a proxy', async () => {
  const { s, base: b } = await listen({ trustProxy: true, generalLimit: { windowMs: 60_000, max: 1 } });
  const hit = (ip) => fetch(`${b}/api/internships`, { headers: { 'X-Forwarded-For': ip } });
  assert.equal((await hit('1.1.1.1')).status, 200);
  assert.equal((await hit('2.2.2.2')).status, 200); // different client, own bucket
  assert.equal((await hit('1.1.1.1')).status, 429);
  s.close();
});
