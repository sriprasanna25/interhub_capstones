import { createApp } from './app.js';
import { createLogger } from './logger.js';

const port = Number(process.env.PORT) || 3000;
const logger = createLogger({ level: process.env.LOG_LEVEL || 'info' });
const server = createApp({
  dbPath: process.env.DB_PATH || 'internhub.db',
  trustProxy: process.env.TRUST_PROXY === 'true',
  logger,
});

server.listen(port, '0.0.0.0', () => logger.info('server_started', { port, node: process.version }));

// Graceful shutdown: stop accepting connections, finish in-flight requests, then exit.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    logger.info('shutdown_started', { signal });
    server.close(() => { logger.info('shutdown_complete'); process.exit(0); });
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
process.on('unhandledRejection', (e) => logger.error('unhandled_rejection', { error: String(e) }));
