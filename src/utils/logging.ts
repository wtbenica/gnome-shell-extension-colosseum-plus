/*
 * SPDX-FileCopyrightText: 2024 Wesley Benica <wesley@benica.dev>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Centralized logging and error handling utilities for the Arena extension.
 *
 * This module provides a unified logging system that works across different
 * environments (GNOME Shell runtime, test environment, preferences UI).
 * It handles logger injection for testing, provides consistent message
 * formatting, and includes validation utilities.
 *
 * The logging functions automatically prefix messages with '[Arena]'
 * for easy identification in GNOME Shell logs and support different log
 * levels (error, warn, info, debug) with appropriate formatting.
 *
 * @example
 * ```typescript
 * import { logErr, logWarn, logInfo, validateDate } from './logging.js';
 *
 * // Simple error logging
 * logErr('Failed to load settings');
 *
 * // Error with context
 * logWarn(error, 'Settings validation');
 *
 * // Different log levels
 * logInfo('Extension initialized');
 *
 * // Validation with automatic error throwing
 * validateDate(new Date('invalid'), 'Clock update');
 * ```
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * Logger interface for consistent logging implementations.
 */
interface Logger {
  log(...args: unknown[]): void;
  logError(error: Error, message: string): void;
}

/**
 * Logger implementation for GJS/GNOME Shell environment.
 */
const gjsLogger: Logger = {
  log(...args: unknown[]): void {
    const globalLog = (globalThis as { log?: (...args: unknown[]) => void }).log;
    if (globalLog) {
      globalLog(...args);
    }
  },
  logError(error: Error, message?: string): void {
    const globalLogError = (globalThis as { logError?: (error: Error, message?: string) => void }).logError;
    if (globalLogError) {
      globalLogError(error, message);
    }
  },
};

// Current logger instance (can be overridden for tests)
let currentLogger: Logger = gjsLogger;

// Log file directory
const LOG_DIR = GLib.build_filenamev([GLib.get_user_cache_dir(), 'arena-extension', 'logs']);

/**
 * Set the logger instance for testing or alternative environments.
 *
 * Allows injection of custom loggers for unit testing or different
 * runtime environments. The default logger works with GNOME Shell's
 * logging system.
 *
 * @param logger - Logger implementation to use for all logging functions
 *
 * @example
 * ```typescript
 * // In tests
 * const mockLogger = { log: jest.fn(), logError: jest.fn() };
 * setLogger(mockLogger);
 *
 * logErr('test error');
 * expect(mockLogger.logError).toHaveBeenCalled();
 * ```
 */
export function setLogger(logger: Logger) {
  currentLogger = logger;
}

/**
 * Internal function for logging messages with consistent formatting.
 *
 * Handles message formatting, level-specific output, and error object
 * processing. Automatically prefixes all messages with '[Arena]'
 * for easy identification in logs.
 *
 * @param message - Error object, string, or other value to log
 * @param context - Optional context description for better debugging
 * @param level - Log level determining output format and destination
 *
 * @internal This function is used internally by the public logging functions
 */
function logMessage(
  message: unknown,
  context?: string,
  level: string = "error",
) {
  const prefix = '[Arena]';
  let formattedMessage;

  if (message instanceof Error) {
    formattedMessage = `${prefix} ${context ? context + ': ' : ''}${message.message}`;
    if (level === 'error') {
      currentLogger.logError(message, formattedMessage);
    } else {
      currentLogger.log(formattedMessage);
      if (message.stack) {
        currentLogger.log(message.stack);
      }
    }
  } else {
    formattedMessage = `${prefix} ${context ? context + ': ' : ''}${message}`;
    currentLogger.log(formattedMessage);
  }

  // Also log to file if enabled
  logToFile(formattedMessage, level);
}

/**
 * Log an error message with optional context.
 *
 * For Error objects, logs both the message and stack trace. For other
 * types, converts to string and logs as an error. Includes full error
 * details for debugging.
 *
 * @param error - Error object, string, or other value to log as error
 * @param context - Optional context description for better debugging
 *
 * @example
 * ```typescript
 * try {
 *   parseColorString(invalidColor);
 * } catch (error) {
 *   logErr(error, 'Color parsing');
 * }
 *
 * // Output: [Arena] Color parsing: Invalid color format '#gggggg'
 * ```
 */
export function logErr(error: unknown, context?: string) {
  logMessage(error, context, 'error');
}

// Note: do NOT export a `logError` alias here to avoid colliding with the
// GNOME/Javascript `logError` global; consumers should call `logErr`.
/**
 * Log a warning message with optional context.
 *
 * Logs messages at warning level with consistent formatting and file logging.
 *
 * @param message - Message to log as warning
 * @param context - Optional context description for better debugging
 *
 * @example
 * ```typescript
 * logWarn('Settings file not found, using defaults', 'Settings');
 * ```
 */
export function logWarn(message: unknown, context?: string) {
  logMessage(message, context, 'warn');
}

/**
 * Log an info message with optional context.
 *
 * Logs informational messages with consistent formatting and file logging.
 *
 * @param message - Message to log as info
 * @param context - Optional context description for better debugging
 *
 * @example
 * ```typescript
 * logInfo('Extension initialized successfully');
 * ```
 */
export function logInfo(message: unknown, context?: string) {
  logMessage(message, context, 'info');
}

/**
 * Log a debug message with optional context.
 *
 * Logs debug messages with consistent formatting and file logging.
 * Debug messages are only logged in development or verbose modes.
 *
 * @param message - Message to log as debug
 * @param context - Optional context description for better debugging
 *
 * @example
 * ```typescript
 * logDebug('Processing team data', 'DataLoader');
 * ```
 */
export function logDebug(message: unknown, context?: string) {
  // Always log debug in GJS
  logMessage(message, context, 'debug');
}

/**
 * Log API calls to file for tracking and debugging.
 *
 * Writes API call details to a log file for monitoring usage and debugging.
 * Only logs in development or when API logging is enabled.
 *
 * @param message - Message to log
 * @param filename - Log filename, defaults to 'api_calls.log'
 *
 * @example
 * ```typescript
 * logFile('/competitions.json', { locale: 'en' });
 * ```
 */
export function logFile(message: string, filename: string = 'api_calls.log') {
  // Always log API calls in GJS
  try {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${message}\n`;
    
    // Ensure log directory exists
    const logDir = Gio.File.new_for_path(LOG_DIR);
    if (!logDir.query_exists(null)) {
      try {
        logDir.make_directory_with_parents(null);
      } catch {
        // Directory might already exist due to race condition
        try {
          GLib.spawn_command_line_sync(`mkdir -p "${LOG_DIR}"`);
        } catch {
          // If all else fails, silently skip logging to file
          return;
        }
      }
    }

    const apiLogFile = Gio.File.new_for_path(GLib.build_filenamev([LOG_DIR, filename]));
    
    // Check if file exists before trying to load it
    let existingContent = '';
    if (apiLogFile.query_exists(null)) {
      try {
        const [success, contents] = apiLogFile.load_contents(null);
        existingContent = success ? new TextDecoder().decode(contents) : '';
      } catch {
        // File exists but can't be read, start fresh
        existingContent = '';
      }
    }
    
    const newContent = existingContent + logEntry;
    apiLogFile.replace_contents(
      newContent,
      null,
      false,
      Gio.FileCreateFlags.NONE,
      null
    );
  } catch (e) {
    // Avoid calling logInfo here to prevent recursion (logInfo -> logToFile -> error)
    try {
      currentLogger.log(`[Arena] logFile: Failed to log message ${message} - ${e}`);
    } catch {
      // Swallow to avoid recursive logging
    }
  }
}

/**
 * Log to file with rotation and size limits.
 *
 * Internal function for writing log messages to files with automatic
 * rotation when files exceed size limits.
 *
 * @param message - Message to write to log file
 * @param level - Log level for file naming
 *
 * @internal
 */
function logToFile(message: string, level: string) {
  // Always log to file in GJS
  try {
    // Ensure log directory exists
    const logDir = Gio.File.new_for_path(LOG_DIR);
    if (!logDir.query_exists(null)) {
      try {
        logDir.make_directory_with_parents(null);
      } catch {
        // Directory might already exist due to race condition, or parent dirs don't exist
        // Try to create with shell command as fallback
        try {
          GLib.spawn_command_line_sync(`mkdir -p "${LOG_DIR}"`);
        } catch {
          // If all else fails, silently skip logging to file
          return;
        }
      }
    }

    const logFileName = `${level}.log`;
    const levelLogFile = Gio.File.new_for_path(GLib.build_filenamev([LOG_DIR, logFileName]));
    
    // Check if file exists before trying to load it
    let existingContent = '';
    if (levelLogFile.query_exists(null)) {
      try {
        const [success, contents] = levelLogFile.load_contents(null);
        existingContent = success ? new TextDecoder().decode(contents) : '';
      } catch {
        // File exists but can't be read, start fresh
        existingContent = '';
      }
    }
    
    if (existingContent.length > 1024 * 1024) {
      const backupFile = Gio.File.new_for_path(GLib.build_filenamev([LOG_DIR, `${logFileName}.1`]));
      backupFile.replace_contents(
        existingContent,
        null,
        false,
        Gio.FileCreateFlags.NONE,
        null
      );
      levelLogFile.replace_contents(
        message + '\n',
        null,
        false,
        Gio.FileCreateFlags.NONE,
        null
      );
    } else {
      const newContent = existingContent + message + '\n';
      levelLogFile.replace_contents(
        newContent,
        null,
        false,
        Gio.FileCreateFlags.NONE,
        null
      );
    }
  } catch (e) {
    // Avoid calling logInfo here to prevent recursion (logInfo -> logToFile -> error)
    try {
      currentLogger.log(`[Arena] logToFile: Failed to log message at level ${level}. ${e}`);
    } catch {
      // Swallow to avoid recursive logging
    }
  }
}

/**
 * Validate a date object and throw if invalid.
 *
 * Utility function for validating Date objects and throwing descriptive
 * errors if the date is invalid. Useful for API parameter validation.
 *
 * @param date - Date object to validate
 * @param context - Context description for error messages
 * @throws {Error} If date is invalid
 *
 * @example
 * ```typescript
 * validateDate(new Date('invalid'), 'API request');
 * // Throws: Invalid date provided for API request
 * ```
 */
export function validateDate(date: Date, context: string = 'Date validation') {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error(`Invalid date provided for ${context}`);
  }
}

/**
 * Validate a string is not empty and throw if invalid.
 *
 * Utility function for validating non-empty strings and throwing
 * descriptive errors if the string is empty or not a string.
 *
 * @param str - String to validate
 * @param context - Context description for error messages
 * @throws {Error} If string is empty or not a string
 *
 * @example
 * ```typescript
 * validateString('', 'Team name');
 * // Throws: Empty or invalid string provided for Team name
 * ```
 */
export function validateString(str: string, context: string = 'String validation') {
  if (typeof str !== 'string' || str.trim().length === 0) {
    throw new Error(`Empty or invalid string provided for ${context}`);
  }
}

/**
 * Validate an array is not empty and throw if invalid.
 *
 * Utility function for validating non-empty arrays and throwing
 * descriptive errors if the array is empty or not an array.
 *
 * @param arr - Array to validate
 * @param context - Context description for error messages
 * @throws {Error} If array is empty or not an array
 *
 * @example
 * ```typescript
 * validateArray([], 'Teams list');
 * // Throws: Empty or invalid array provided for Teams list
 * ```
 */
export function validateArray(arr: unknown[], context: string = 'Array validation') {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(`Empty or invalid array provided for ${context}`);
  }
}