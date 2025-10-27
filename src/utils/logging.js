/*
 * SPDX-FileCopyrightText: 2024 Wesley Benica <wesley@benica.dev>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Centralized logging and error handling utilities for the Colosseum extension.
 *
 * This module provides a unified logging system that works across different
 * environments (GNOME Shell runtime, test environment, preferences UI).
 * It handles logger injection for testing, provides consistent message
 * formatting, and includes validation utilities.
 *
 * The logging functions automatically prefix messages with '[Colosseum]'
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
 * Logger implementation for GJS/GNOME Shell environment.
 */
const gjsLogger = {
  log(...args) {
    if (typeof (globalThis).log === "function") {
      (globalThis).log(...args);
    }
  },
  logError(error, message) {
    if (typeof (globalThis).logError === "function") {
      (globalThis).logError(error, message);
    }
  },
};

// Current logger instance (can be overridden for tests)
let currentLogger = gjsLogger;

// Log file directory
const LOG_DIR = GLib.build_filenamev([GLib.get_user_cache_dir(), 'colosseum-extension', 'logs']);

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
export function setLogger(logger) {
  currentLogger = logger;
}

/**
 * Internal function for logging messages with consistent formatting.
 *
 * Handles message formatting, level-specific output, and error object
 * processing. Automatically prefixes all messages with '[Colosseum]'
 * for easy identification in logs.
 *
 * @param message - Error object, string, or other value to log
 * @param context - Optional context description for better debugging
 * @param level - Log level determining output format and destination
 *
 * @internal This function is used internally by the public logging functions
 */
function logMessage(
  message,
  context,
  level = "error",
) {
  const prefix = '[Colosseum]';
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
 * // Output: [Colosseum] Color parsing: Invalid color format '#gggggg'
 * ```
 */
export function logErr(error, context) {
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
export function logWarn(message, context) {
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
export function logInfo(message, context) {
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
export function logDebug(message, context) {
  // Always log debug in GJS
  logMessage(message, context, 'debug');
}

/**
 * Log API calls to file for tracking and debugging.
 *
 * Writes API call details to a log file for monitoring usage and debugging.
 * Only logs in development or when API logging is enabled.
 *
 * @param endpoint - API endpoint that was called
 * @param params - Parameters sent with the API call
 *
 * @example
 * ```typescript
 * logFile('/competitions.json', { locale: 'en' });
 * ```
 */
export function logFile(endpoint, params = {}) {
  // Always log API calls in GJS
  try {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${endpoint} - ${JSON.stringify(params)}\n`;
    GLib.mkdir_with_parents(LOG_DIR, 0o755);
    const apiLogFile = Gio.File.new_for_path(GLib.build_filenamev([LOG_DIR, 'api_calls.log']));
    const [success, contents] = apiLogFile.load_contents(null);
    const existingContent = success ? new TextDecoder().decode(contents) : '';
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
      currentLogger.log(`[Colosseum] logFile: Failed to log API call ${endpoint} ${JSON.stringify(params)} - ${e}`);
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
function logToFile(message, level) {
  // Always log to file in GJS
  try {
    GLib.mkdir_with_parents(LOG_DIR, 0o755);
    const logFileName = `${level}.log`;
    const levelLogFile = Gio.File.new_for_path(GLib.build_filenamev([LOG_DIR, logFileName]));
    const [success, contents] = levelLogFile.load_contents(null);
    const existingContent = success ? new TextDecoder().decode(contents) : '';
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
      currentLogger.log(`[Colosseum] logToFile: Failed to log message at level ${level}. ${e}`);
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
export function validateDate(date, context = 'Date validation') {
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
export function validateString(str, context = 'String validation') {
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
export function validateArray(arr, context = 'Array validation') {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(`Empty or invalid array provided for ${context}`);
  }
}