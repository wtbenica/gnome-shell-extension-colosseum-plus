import DataLoader from "./data.js";
import { logErr } from "./logging/error_utils.js";

let constantsPromise = null;
let loadedConstants = null;

export async function getConstants() {
  if (!constantsPromise) {
    constantsPromise = DataLoader.getDynamicConstants();
  }
  loadedConstants = await constantsPromise;
  return loadedConstants;
}

// Export static versions for synchronous access
export const PREF_UPDATE_FREQ = "update-frequency";
export const PREF_FOLLOWED_ONLY = "followed-only";
export const PREF_COMPACT_MODE = "compact-mode";
export const PREF_POSITION_TOPBAR = "position-in-topbar";
export const PREF_SHOW_NEXT_GAMES = "show-next-games";

// Dynamic constants - will be populated after getConstants() is called
export let PREF_LEAGUES = {
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
export let DISPLAY_NAME = {
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
export let PREF_TOURNAMENTS = {
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
export let SPORTS = {};

// Initialize the dynamic constants
getConstants().then(constants => {
  PREF_LEAGUES = { ...PREF_LEAGUES, ...(constants.PREF_LEAGUES || {}) };
  DISPLAY_NAME = { ...DISPLAY_NAME, ...(constants.DISPLAY_NAME || {}) };
  SPORTS = { ...SPORTS, ...(constants.SPORTS || {}) };
}).catch(error => {
  logErr(error, 'Failed to load dynamic constants');
  // Keep static fallbacks
});
