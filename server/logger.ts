import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

fs.mkdirSync(LOG_DIR, { recursive: true });

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

type LogLevel = 'info' | 'warn' | 'error';

function write(level: LogLevel, message: string, extra?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...extra,
  };
  const line = JSON.stringify(entry);

  logStream.write(line + '\n');

  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, extra?: Record<string, unknown>) => write('info', message, extra),
  warn: (message: string, extra?: Record<string, unknown>) => write('warn', message, extra),
  error: (message: string, extra?: Record<string, unknown>) => write('error', message, extra),
};
