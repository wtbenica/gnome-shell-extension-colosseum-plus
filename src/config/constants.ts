/**
 * Centralized configuration constants for the Colosseum extension.
 * All magic numbers and configuration values should be defined here.
 */

/**
 * Timing-related constants (all intervals in milliseconds)
 */
export const TIMING = {
  MIN_UPDATE_INTERVAL_SECONDS: 60,
  DEFAULT_UPDATE_INTERVAL_SECONDS: 300,
  UPDATE_INTERVAL: 300 * 1000, // 5 minutes
  DAYS_AHEAD: 7, // Number of days ahead to fetch schedules
  RETRY_DELAY_MS: 2000,
  MAX_RETRIES: 3
} as const;

/**
 * Cache configuration constants (all durations in milliseconds)
 */
export const CACHE = {
  // Max age in milliseconds for different cache types
  METADATA_MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days
  SCHEDULES_MAX_AGE: 24 * 60 * 60 * 1000, // 1 day
  API_MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days for general API cache
  CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
  DIRECTORY: 'colosseum-extension',
  VERSION: 1,
  MAX_MEMORY_CACHE_SIZE: 100
} as const;

/**
 * UI-related constants
 */
export const UI = {
  MAX_NEXT_GAMES: 5,
  PANEL_POSITION: 1,
  PANEL_SIDE: 'right',
  EXTENSION_NAME: 'colosseum',
  BATCH_SIZE: 20,
  BATCH_DELAY_MS: 10
} as const;

/**
 * Logging constants
 */
export const LOGGING = {
  LOG_DIR: 'logs',
  MAX_LOG_SIZE_MB: 10,
  MAX_LOG_FILES: 5
} as const;

/**
 * Settings preference keys
 */
export const PREFS = {
  UPDATE_FREQ: 'update-frequency',
  FOLLOWED_ONLY: 'followed-only',
  COMPACT_MODE: 'compact-mode',
  POSITION_TOPBAR: 'position-in-topbar',
  SHOW_NEXT_GAMES: 'show-next-games'
} as const;

export {};
