/**
 * src/utils/logger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured logger. All src/ modules use this instead of console.log.
 * No external dependencies.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function formatEntry(level: LogLevel, context: string, payload: Record<string, unknown>): string {
  return JSON.stringify({
    level,
    context,
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export const logger: {
  info:  (context: string, data?: unknown) => void;
  warn:  (context: string, data?: unknown) => void;
  error: (context: string, err: unknown)   => void;
  debug: (context: string, data?: unknown) => void;
} = {
  info(context: string, data?: unknown): void {
    console.log(formatEntry('INFO', context, { data }));
  },

  warn(context: string, data?: unknown): void {
    console.warn(formatEntry('WARN', context, { data }));
  },

  error(context: string, err: unknown): void {
    console.error(formatEntry('ERROR', context, { error: extractErrorMessage(err) }));
  },

  debug(context: string, data?: unknown): void {
    console.log(formatEntry('DEBUG', context, { data }));
  },
};
