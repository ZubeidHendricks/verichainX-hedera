/**
 * Lightweight structured logger used across the Hedera service.
 *
 * Agents and services construct one with a context name, e.g.
 *   private logger = new Logger('SmartContractService');
 * and call logger.info/warn/error/debug with an optional metadata object.
 */
export class Logger {
  constructor(private readonly context: string) {}

  private write(level: string, message: string, meta?: unknown): void {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
    };
    if (meta !== undefined) {
      entry.meta = meta;
    }

    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  info(message: string, meta?: unknown): void {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.write('error', message, meta);
  }

  debug(message: string, meta?: unknown): void {
    if (process.env.LOG_LEVEL === 'debug') {
      this.write('debug', message, meta);
    }
  }
}

export default Logger;
