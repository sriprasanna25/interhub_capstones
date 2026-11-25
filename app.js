import http from 'node:http';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { validateApplication } from './validate.js';
import { applySecurityHeaders, createRateLimiter } from './security.js';
import { createLogger } from './logger.js';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const MAX_BODY = 10 * 1024; // 10 KB
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
const startedAt = Date.now();

function send(res, status, data, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = (req.headers['content-type'] || '').split(';')[0].trim();
    if (type !== 'application/json') return reject({ status: 415, message: 'Use application/json' });
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) return reject({ status: 413, message: 'Request body too large' });
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject({ status: 400, message: 'Invalid JSON' });
      }
    });
    req.on('error', () => reject({ status: 400, message: 'Bad request' }));
  });
}

// Static files are read once, gzip-compressed once, and served from memory with an ETag.
const staticCache = new Map();
async function loadStatic(file) {
  if (!staticCache.has(file)) {
    const raw = await readFile(file);
    staticCache.set(file, {
      raw,
      gz: zlib.gzipSync(raw, { level: 9 }),
      etag: `"${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16)}"`,
    });
  }
  return staticCache.get(file);
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(PUBLIC_DIR, rel);
  // Block path traversal: the resolved path must stay inside PUBLIC_DIR
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !MIME[path.extname(file)]) {
    return send(res, 404, { error: 'Not found' });
  }
  let entry;
  try {
    entry = await loadStatic(file);
  } catch {
    return send(res, 404, { error: 'Not found' });
  }
  const headers = {
    'Content-Type': MIME[path.extname(file)],
    ETag: entry.etag,
    Vary: 'Accept-Encoding',
    // HTML always revalidates; assets may be cached for an hour (ETag keeps them fresh)
    'Cache-Control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
  };
  if (req.headers['if-none-match'] === entry.etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (gzip) headers['Content-Encoding'] = 'gzip';
  const body = gzip ? entry.gz : entry.raw;
  res.writeHead(200, { ...headers, 'Content-Length': body.length });
  res.end(body);
}

export function createApp({
  dbPath = ':memory:',
  generalLimit = { windowMs: 60_000, max: 100 },
  applyLimit = { windowMs: 60_000, max: 5 },
  logger = createLogger({ level: process.env.LOG_LEVEL || 'info' }),
  trustProxy = false, // set true ONLY behind a reverse proxy you control (Render, Fly, nginx)
} = {}) {
  const db = openDb(dbPath);
  const general = createRateLimiter(generalLimit);
  const applyLimiter = createRateLimiter(applyLimit);

  // All SQL uses placeholders (?) so user input is never concatenated into queries.
  const WHERE = `title LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\'`;
  const listStmt = db.prepare(
    `SELECT id, title, company, location, description FROM internships WHERE ${WHERE} ORDER BY id LIMIT ? OFFSET ?`
  );
  const countStmt = db.prepare(`SELECT COUNT(*) AS n FROM internships WHERE ${WHERE}`);
  const oneStmt = db.prepare('SELECT id, title, company, location, description FROM internships WHERE id = ?');
  const insertApp = db.prepare(
    `INSERT INTO applications (internship_id, name, email, phone, resume_url, cover_letter)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const clientIp = (req) => {
    if (trustProxy) {
      const fwd = req.headers['x-forwarded-for'];
      if (fwd) return String(fwd).split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  };

  const server = http.createServer(async (req, res) => {
    const id = crypto.randomUUID().slice(0, 8);
    const t0 = process.hrtime.bigint();
    res.setHeader('X-Request-Id', id);
    applySecurityHeaders(res);

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const lvl = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      // Path only (no query string, no body): avoids logging search terms or personal data
      logger[lvl]('request', {
        id, method: req.method, path: (req.url || '').split('?')[0],
        status: res.statusCode, ms: Math.round(ms * 10) / 10,
      });
    });

    try {
      const url = new URL(req.url, 'http://localhost');
      const ip = clientIp(req);

      // Health checks come first so monitors are never rate limited.
      if (url.pathname === '/healthz' && req.method === 'GET') {
        return send(res, 200, { status: 'ok', uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) });
      }
      if (url.pathname === '/readyz' && req.method === 'GET') {
        try {
          db.prepare('SELECT 1').get();
          return send(res, 200, { status: 'ready' });
        } catch {
          return send(res, 503, { status: 'database unavailable' });
        }
      }

      const g = general(ip);
      if (!g.allowed) return send(res, 429, { error: 'Too many requests' }, { 'Retry-After': g.retryAfter });

      if (url.pathname === '/api/internships' && req.method === 'GET') {
        const q = (url.searchParams.get('search') || '').slice(0, 50).replace(/[\\%_]/g, '\\$&');
        const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 10));
        const like = `%${q}%`;
        const rows = listStmt.all(like, like, like, limit, (page - 1) * limit);
        const { n: total } = countStmt.get(like, like, like);
        return send(res, 200, { data: rows, page, limit, total, hasMore: page * limit < total });
      }

      const match = url.pathname.match(/^\/api\/internships\/(\d+)$/);
      if (match && req.method === 'GET') {
        const row = oneStmt.get(Number(match[1]));
        return row ? send(res, 200, { data: row }) : send(res, 404, { error: 'Internship not found' });
      }

      if (url.pathname === '/api/applications' && req.method === 'POST') {
        const a = applyLimiter(ip);
        if (!a.allowed) {
          return send(res, 429, { error: 'Too many applications. Try again later.' }, { 'Retry-After': a.retryAfter });
        }
        const body = await readJson(req);
        const { errors, value } = validateApplication(body);
        if (Object.keys(errors).length) return send(res, 422, { error: 'Validation failed', fields: errors });
        if (!oneStmt.get(value.internshipId)) {
          return send(res, 422, { error: 'Validation failed', fields: { internshipId: 'Internship does not exist' } });
        }
        try {
          const info = insertApp.run(
            value.internshipId, value.name, value.email,
            value.phone || null, value.resumeUrl || null, value.coverLetter
          );
          logger.info('application_created', { id, applicationId: Number(info.lastInsertRowid), internshipId: value.internshipId });
          return send(res, 201, { data: { id: Number(info.lastInsertRowid) } });
        } catch (e) {
          if (String(e.message).includes('UNIQUE')) {
            return send(res, 409, { error: 'You have already applied to this internship' });
          }
          throw e;
        }
      }

      if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
      return await serveStatic(req, res, decodeURIComponent(url.pathname));
    } catch (err) {
      if (err && err.status) return send(res, err.status, { error: err.message });
      logger.error('unhandled_error', { id, error: err?.message, stack: err?.stack }); // details stay in logs
      send(res, 500, { error: 'Something went wrong', requestId: id }); // client gets an id to quote in support
    }
  });

  server.on('close', () => db.close());
  return server;
}
