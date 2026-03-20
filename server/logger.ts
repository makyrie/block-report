import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isVercel } from './env.js';

let logStream: fs.WriteStream | null = null;

if (!isVercel) {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const LOG_DIR = path.join(__dirname, 'logs');
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const LOG_FILE = path.join(LOG_DIR, 'server.log');
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  } catch {
    // File logging is best-effort — fall back to console-only if filesystem is unavailable
    console.warn('Failed to initialize file logger, falling back to console-only');
  }
}

type LogLevel = 'info' | 'warn' | 'error';

function write(level: LogLevel, message: string, extra?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...extra,
  };
  const line = JSON.stringify(entry);

  if (logStream) {
    logStream.write(line + '\n');
  }

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
