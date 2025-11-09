/**
 * Configuration constants for the Arena extension.
 * These can be static (compile-time) or dynamic (loaded from API).
 */
export interface ArenaConstants {
  // Static preference keys
  PREF_UPDATE_FREQ: string;
  PREF_FOLLOWED_ONLY: string;
  PREF_COMPACT_MODE: string;
  PREF_POSITION_TOPBAR: string;
  PREF_SHOW_NEXT_GAMES: string;
  
  // Dynamic preference mappings (loaded from API)
  PREF_LEAGUES: Record<string, string>;
  PREF_TOURNAMENTS: Record<string, string>;
  DISPLAY_NAME: Record<string, string>;
  SPORTS: Record<string, Array<{ id: string; name: string; pref: string }>>;
}

// Keep old name for backwards compatibility
export type ColosseumConstants = ArenaConstants;

/**
 * GSettings interface for GNOME Shell extensions
 */
export interface Settings {
  get_boolean(key: string): boolean;
  get_strv(key: string): string[];
  get_int?(key: string): number;
}

/**
 * Environment variables interface
 */
export interface Env {
  SPORT_RADAR_KEY?: string;
  [key: string]: string | undefined;
}

export {};
