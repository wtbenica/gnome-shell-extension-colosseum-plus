import { logErr, logWarn } from '../utils/logging.js';

export enum ErrorSeverity {
  WARNING,
  ERROR,
  CRITICAL
}

export class ExtensionError extends Error {
  constructor(
    message: string,
    public severity: ErrorSeverity = ErrorSeverity.ERROR,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}

/**
 * Centralized error handler with consistent logging.
 * Provides standard error handling patterns across the extension.
 */
export class ErrorHandler {
  /**
   * Handle an error with appropriate logging based on severity
   */
  static handle(
    error: unknown,
    context: string,
    severity: ErrorSeverity = ErrorSeverity.ERROR
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    const fullMessage = `[${context}] ${message}`;

    switch (severity) {
      case ErrorSeverity.WARNING:
        logWarn(fullMessage, context);
        break;
      case ErrorSeverity.ERROR:
        logErr(error, fullMessage);
        break;
      case ErrorSeverity.CRITICAL:
        logErr(error, `CRITICAL: ${fullMessage}`);
        break;
    }
  }

  /**
   * Wrap an async function with error handling and return fallback on error
   */
  static async handleAsync<T>(
    fn: () => Promise<T>,
    context: string,
    fallback?: T,
    severity: ErrorSeverity = ErrorSeverity.ERROR
  ): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      this.handle(error, context, severity);
      return fallback;
    }
  }

  /**
   * Wrap a sync function with error handling and return fallback on error
   */
  static handleSync<T>(
    fn: () => T,
    context: string,
    fallback?: T,
    severity: ErrorSeverity = ErrorSeverity.ERROR
  ): T | undefined {
    try {
      return fn();
    } catch (error) {
      this.handle(error, context, severity);
      return fallback;
    }
  }
}

export {};
