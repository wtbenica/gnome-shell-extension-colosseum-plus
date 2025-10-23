import GLib from "gi://GLib";
import Gio from "gi://Gio";

import { gjsLogger } from "./logger_gjs.js";

const CACHE_FILE = GLib.get_user_cache_dir() + '/colosseum-data.json';
const CACHE_DURATION_DAYS = 7;

/**
 * Manages local file cache for competitions and teams data
 */
export class CacheManager {
  constructor() {
    this._decoder = new TextDecoder();
    this.data = this.load();
  }

  /**
   * Load cache from disk
   */
  load() {
    gjsLogger.log('CacheManager: Loading cache from', CACHE_FILE);
    
    try {
      const cacheFile = Gio.File.new_for_path(CACHE_FILE);
      
      if (cacheFile.query_exists(null)) {
        gjsLogger.log('CacheManager: Cache file exists, loading...');
        const [success, contents] = cacheFile.load_contents(null);
        
        if (success) {
          const text = this._decoder.decode(contents);
          const parsed = JSON.parse(text);
          
          gjsLogger.log('CacheManager: Cache loaded -',
            'leagues:', parsed.leagues?.length || 0,
            'rawCompetitions:', parsed.rawCompetitions?.length || 0,
            'teams:', Object.keys(parsed.teams || {}).length);
          
          return parsed;
        } else {
          gjsLogger.log('CacheManager: Failed to load cache file contents');
        }
      } else {
        gjsLogger.log('CacheManager: Cache file does not exist');
      }
    } catch (error) {
      gjsLogger.logError(error, 'CacheManager: Failed to load cache');
    }
    
    gjsLogger.log('CacheManager: Returning empty cache');
    return {
      lastUpdate: 0,
      leagues: [],
      teams: {},
      rawCompetitions: []
    };
  }

  /**
   * Save cache to disk
   */
  save(leagues, teams, rawCompetitions) {
    try {
      const cacheDir = Gio.File.new_for_path(GLib.get_user_cache_dir());
      if (!cacheDir.query_exists(null)) {
        cacheDir.make_directory_with_parents(null);
      }
      
      const cacheFile = Gio.File.new_for_path(CACHE_FILE);
      const data = JSON.stringify({
        lastUpdate: Date.now(),
        leagues: leagues || [],
        teams: teams || {},
        rawCompetitions: rawCompetitions || []
      });
      
      const [success] = cacheFile.replace_contents(
        data,
        null,
        false,
        Gio.FileCreateFlags.NONE,
        null
      );
      
      if (!success) {
        gjsLogger.log('CacheManager: Failed to save cache');
      } else {
        gjsLogger.log('CacheManager: Cache saved successfully');
      }
    } catch (error) {
      gjsLogger.logError(error, 'CacheManager: Failed to save cache');
    }
  }

  /**
   * Check if cache needs updating
   */
  shouldUpdate() {
    const now = new Date();
    const lastUpdate = new Date(this.data.lastUpdate);
    const daysSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate >= CACHE_DURATION_DAYS;
  }

  /**
   * Get cached competitions
   */
  getRawCompetitions() {
    return this.data.rawCompetitions || [];
  }

  /**
   * Get cached leagues
   */
  getLeagues() {
    return this.data.leagues || [];
  }

  /**
   * Get cached teams for a league
   */
  getTeams(leagueId) {
    return this.data.teams?.[leagueId] || [];
  }
}
