import DataLoader from "./data.js";

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
export let PREF_LEAGUES = {};
export let DISPLAY_NAME = {};
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
  PREF_LEAGUES = constants.PREF_LEAGUES || {};
  DISPLAY_NAME = constants.DISPLAY_NAME || {};
  SPORTS = constants.SPORTS || {};
}).catch(error => {
  console.error('Failed to load dynamic constants:', error);
  // Keep static fallbacks
});
