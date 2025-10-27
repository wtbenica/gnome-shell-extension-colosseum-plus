import DataLoader from "../data/data_loader.js";
import { logErr } from "../utils/logging.js";

interface DynamicConstants {
  PREF_LEAGUES?: Record<string, string>;
  DISPLAY_NAME?: Record<string, string>;
  SPORTS?: Record<string, any>;
}

let constantsPromise: Promise<DynamicConstants> | null = null;
let loadedConstants: DynamicConstants | null = null;

export async function getConstants(): Promise<DynamicConstants> {
  if (!constantsPromise) {
    constantsPromise = DataLoader.getDynamicConstants();
  }
  loadedConstants = await constantsPromise;
  return loadedConstants;
}

// Export static versions for synchronous access
export const PREF_UPDATE_FREQ: string = "update-frequency";
export const PREF_FOLLOWED_ONLY: string = "followed-only";
export const PREF_COMPACT_MODE: string = "compact-mode";
export const PREF_POSITION_TOPBAR: string = "position-in-topbar";
export const PREF_SHOW_NEXT_GAMES: string = "show-next-games";

// Dynamic constants - will be populated after getConstants() is called
export let PREF_LEAGUES: Record<string, string> = {
  "Bund": "bund-enabled",
  "Bund2": "bund2-enabled",
  "UCL": "ucl-enabled",
  "English League Championship": "elc-enabled",
  "EPL": "epl-enabled",
  "ISR": "isr-enabled",
  "L1": "l1-enabled",
  "LaLiga": "laliga-enabled",
  "LaLigaMX": "laligamx-enabled",
  "Ligue 1": "ligue1-enabled",
  "MLS": "mls-enabled",
  "Serie A": "seriea-enabled",
  "WNBA": "wnba-enabled",
};
export let DISPLAY_NAME: Record<string, string> = {
  "Bund": "Bundesliga",
  "Bund2": "2. Bundesliga",
  "UCL": "UEFA Champions League",
  "English League Championship": "English League Championship",
  "EPL": "Premier League",
  "ISR": "Ligat ha'Al",
  "L1": "English League One",
  "LaLiga": "La Liga",
  "LaLigaMX": "Liga MX",
  "Ligue 1": "Ligue 1",
  "MLS": "Major League Soccer",
  "Serie A": "Serie A",
  "WNBA": "WNBA",
};
export let PREF_TOURNAMENTS: Record<string, string> = {
  "CONCACAF Gold Cup": "concacafgold-enabled",
  "Copa America": "conmebol-enabled",
  "FA Cup": "facup-enabled",
  "FIFA World Cup": "fifawc-enabled",
  "Leagues Cup": "leagues-enabled",
  "UEFA Europa Conference League": "uefaeuroconf-enabled",
  "UEFA European Championship": "uefaeuro-enabled",
  "UEFA Europa League": "uefaeuropa-enabled",
  "UEFA Women's Champions League": "uefawomenchampions-enabled",
};
export let SPORTS: Record<string, any> = {};

// Initialize the dynamic constants
getConstants().then(constants => {
  PREF_LEAGUES = { ...PREF_LEAGUES, ...(constants.PREF_LEAGUES || {}) };
  DISPLAY_NAME = { ...DISPLAY_NAME, ...(constants.DISPLAY_NAME || {}) };
  SPORTS = { ...SPORTS, ...(constants.SPORTS || {}) };
}).catch(error => {
  logErr(error, 'Failed to load dynamic constants');
  // Keep static fallbacks
});
