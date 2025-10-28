import GLib from 'gi://GLib';
import { logInfo } from '../utils/logging.js';
import { TIMING } from '../config/constants.js';
import { ErrorHandler, ErrorSeverity } from '../utils/error_handler.js';

/**
 * Manages scheduled updates with configurable intervals and automatic cleanup.
 * Provides methods to start, stop, and adjust update timing.
 */
export class UpdateScheduler {
  private timeoutId: number | null = null;
  private isRunning = false;
  private currentInterval: number;
  private updateCallback: () => Promise<void> | void;

  constructor(
    updateCallback: () => Promise<void> | void,
    initialInterval: number = TIMING.UPDATE_INTERVAL
  ) {
    this.updateCallback = updateCallback;
    this.currentInterval = initialInterval;
  }

  /**
   * Start the update scheduler
   */
  start(): void {
    if (this.isRunning) {
      logInfo('Update scheduler already running', 'UpdateScheduler');
      return;
    }

    this.isRunning = true;
    this.scheduleNextUpdate();
    logInfo(`Update scheduler started (interval: ${this.currentInterval}ms)`, 'UpdateScheduler');
  }

  /**
   * Stop the update scheduler and cleanup timeout
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.timeoutId !== null) {
      GLib.Source.remove(this.timeoutId);
      this.timeoutId = null;
    }

    logInfo('Update scheduler stopped', 'UpdateScheduler');
  }

  /**
   * Change the update interval and restart if running
   */
  setInterval(newInterval: number): void {
    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      this.stop();
    }

    this.currentInterval = newInterval;
    logInfo(`Update interval changed to ${newInterval}ms`, 'UpdateScheduler');

    if (wasRunning) {
      this.start();
    }
  }

  /**
   * Trigger an immediate update without affecting the schedule
   */
  async triggerUpdate(): Promise<void> {
    await ErrorHandler.handleAsync(
      async () => {
        await this.updateCallback();
        logInfo('Manual update triggered', 'UpdateScheduler');
      },
      'UpdateScheduler.triggerUpdate',
      undefined,
      ErrorSeverity.WARNING
    );
  }

  /**
   * Get current interval
   */
  getInterval(): number {
    return this.currentInterval;
  }

  /**
   * Check if scheduler is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Schedule the next update
   */
  private scheduleNextUpdate(): void {
    if (!this.isRunning) {
      return;
    }

    // Clear any existing timeout
    if (this.timeoutId !== null) {
      GLib.Source.remove(this.timeoutId);
    }

    this.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.currentInterval, () => {
      ErrorHandler.handleSync(
        () => {
          // Execute update callback
          const result = this.updateCallback();
          
          // Handle async callbacks
          if (result instanceof Promise) {
            result.catch((error: unknown) => {
              ErrorHandler.handle(error, 'UpdateScheduler.callback', ErrorSeverity.WARNING);
            });
          }

          // Schedule next update if still running
          if (this.isRunning) {
            this.scheduleNextUpdate();
          }
        },
        'UpdateScheduler.scheduleNextUpdate',
        undefined,
        ErrorSeverity.WARNING
      );

      // Return false to not repeat (we handle rescheduling manually)
      return GLib.SOURCE_REMOVE;
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop();
  }
}

export {};
