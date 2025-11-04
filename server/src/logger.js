import fs from 'fs';
import path from 'path';
import pino from 'pino';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const streams = [
  { stream: process.stdout },
  { stream: fs.createWriteStream(LOG_FILE, { flags: 'a' }) }
];

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    timestamp: () => `,"time":"${new Date().toISOString()}"`
  },
  pino.multistream(streams)
);

export function logUnhandledErrors() {
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.error({ err: error }, 'Uncaught exception');
  });
}
