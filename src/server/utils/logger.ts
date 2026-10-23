export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getMinLevel(): number {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  return LEVELS[raw] ?? LEVELS.info;
}

export function log(level: LogLevel, scope: string, msg: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < getMinLevel()) return;
  const ts = new Date().toISOString();
  const payload = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  const line = `${ts} [${level.toUpperCase()}] [${scope}] ${msg}${payload}`;
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (scope: string, msg: string, meta?: Record<string, unknown>) => log('debug', scope, msg, meta),
  info: (scope: string, msg: string, meta?: Record<string, unknown>) => log('info', scope, msg, meta),
  warn: (scope: string, msg: string, meta?: Record<string, unknown>) => log('warn', scope, msg, meta),
  error: (scope: string, msg: string, meta?: Record<string, unknown>) => log('error', scope, msg, meta),
};
