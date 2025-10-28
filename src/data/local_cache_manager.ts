import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { logErr, logWarn } from "../utils/logging.js";
import type { CacheData, Competitor } from "../api/types.js";
import { isCacheData, isCompetitionArray } from "../api/typeguards.js";

const CACHE_FILE = GLib.get_user_cache_dir() + '/colosseum-data.json';
const CACHE_DURATION_DAYS = 30;

/**
 * Manages local file cache for competitions and teams data
 */
export class CacheManager {
  private _decoder: TextDecoder;
  data: CacheData;

  constructor() {
    this._decoder = new TextDecoder();
    this.data = this.load();
  }

  /**
   * Load cache from disk
   */
  load(): CacheData {
    try {
      const cacheFile = Gio.File.new_for_path(CACHE_FILE);
      if (!cacheFile.query_exists(null)) return this._emptyCache();

      const [success, contents] = cacheFile.load_contents(null);
      if (!success) return this._emptyCache();

      const text = this._decoder.decode(contents);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        logErr(e, 'CacheManager: Failed to parse cache JSON');
        try { cacheFile.delete(null); } catch (err) { logWarn(`CacheManager: failed to delete invalid cache file: ${err}`); }
        return this._emptyCache();
      }

      // Attempt migration for legacy shapes
      try {
        const parsedRec = parsed as Record<string, unknown>;
        const maybeTeams = parsedRec.teams;
        const rawComps = parsedRec.rawCompetitions;

        if ((!rawComps || (Array.isArray(rawComps) && rawComps.length === 0)) && Array.isArray(maybeTeams) && (maybeTeams as unknown[]).length > 0) {
          const first = (maybeTeams as unknown[])[0] as Record<string, unknown>;
          if (first && typeof first.id === 'string' && typeof first.category === 'string') {
            (parsedRec as Record<string, unknown>)['rawCompetitions'] = maybeTeams;
            (parsedRec as Record<string, unknown>)['teams'] = {};
          }
        }
      } catch (e) {
        logErr(e, 'CacheManager: Error during cache migration');
      }

      // Validate shape with guard
      if (isCacheData(parsed)) {
        return parsed as CacheData;
      }

      // Try to migrate to CacheData if possible
      const migrated = this._migrateLegacyCache(parsed as Record<string, unknown>);
      if (migrated && isCacheData(migrated)) return migrated;

  try { cacheFile.delete(null); } catch { /* ignore */ }
      return this._emptyCache();
    } catch (error) {
      logErr(error, 'CacheManager: Failed to load cache');
      return this._emptyCache();
    }
  }

  private _emptyCache(): CacheData {
    return {
      lastUpdate: 0,
      leagues: [],
      teams: {},
      rawCompetitions: [],
    };

  }

  save(data: CacheData): void {
    try {
      const cacheFile = Gio.File.new_for_path(CACHE_FILE);
      const contents = JSON.stringify(data);
      cacheFile.replace_contents(contents, null, false, Gio.FileCreateFlags.NONE, null);
    } catch (error) {
      logErr(error, 'CacheManager: Failed to save cache');
    }
  }
  /**
   * Check if cache needs updating
   */
  shouldUpdate(): boolean {
    const now = new Date();
    const lastUpdate = new Date(this.data.lastUpdate);
    const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate >= CACHE_DURATION_DAYS;
  }

  /**
   * Get cached competitions
   */
  getRawCompetitions(): CacheData['rawCompetitions'] {
    return this.data.rawCompetitions || [];
  }

  /**
   * Get cached leagues
   */
  getLeagues(): CacheData['leagues'] {
    return this.data.leagues || [];
  }

  /**
   * Get cached teams for a league
   */
  getTeams(leagueId: string): Competitor[] {
    return (this.data.teams?.[leagueId] as Competitor[]) || [];
  }

  private _migrateLegacyCache(obj: Record<string, unknown>): CacheData | null {
    try {
      // Example migration: if `teams` was stored as array of competitions
      const teams = obj.teams;
      const rawCompetitions = obj.rawCompetitions || [];
      if (Array.isArray(teams) && teams.length > 0) {
        // Validate that rawCompetitions is actually an array of competitions
        const validatedCompetitions = Array.isArray(rawCompetitions) && isCompetitionArray(rawCompetitions) 
          ? rawCompetitions 
          : [];
        // Convert to empty teams map and preserve rawCompetitions
        return {
          lastUpdate: typeof obj.lastUpdate === 'number' ? obj.lastUpdate : 0,
          leagues: validatedCompetitions,
          teams: {},
          rawCompetitions: validatedCompetitions,
        };
      }
    } catch (e) {
      logErr(e, 'CacheManager: migration failed');
    }
    return null;
  }
}
