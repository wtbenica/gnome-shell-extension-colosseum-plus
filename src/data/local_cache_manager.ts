import GLib from "@girs/glib-2.0";
import Gio from "@girs/gio-2.0";

import { logErr, logWarn } from "../utils/logging.js";
import type { CacheData, Competitor } from "../api/schemas.js";
import { cacheDataSchema } from "../api/schemas.js";

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

      if (cacheFile.query_exists(null)) {
        const [success, contents] = cacheFile.load_contents(null);

        if (success) {
          const text = this._decoder.decode(contents);
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch (e) {
            logErr(e, 'CacheManager: Failed to parse cache JSON');
            try { cacheFile.delete(null); } catch (err) { logWarn(`CacheManager: failed to delete invalid cache file: ${err}`); }
            return this._emptyCache();
          }

          // Handle legacy cache shape: some older saves stored competitions in `teams` by mistake.
          // If rawCompetitions is empty but teams is an array of competition-like objects,
          // migrate them into rawCompetitions and make teams an object map.
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

          // Validate the parsed cache data against the schema
          try {
            const validated = cacheDataSchema.safeParse(parsed);
            if (!validated.success) {
              logWarn('CacheManager: cache file failed validation, invalidating', 'CacheManager');
              try { cacheFile.delete(null); } catch (err) { logWarn(`CacheManager: failed to delete invalid cache file: ${err}`); }
              return this._emptyCache();
            }

            return validated.data;
          } catch (e) {
            logErr(e, 'CacheManager: Error validating cache file');
            try { cacheFile.delete(null); } catch (err) { logWarn(`CacheManager: failed to delete cache file after validation error: ${err}`); }
            return this._emptyCache();
          }
        }
      }
    } catch (error) {
      logErr(error, 'CacheManager: Failed to load cache');
    }

    return this._emptyCache();
  }

  private _emptyCache(): CacheData {
    return {
      lastUpdate: 0,
      leagues: [],
      teams: {},
      rawCompetitions: [],
    };
  }

  /**
   * Save cache to disk
   */
  save(leagues: CacheData['leagues'], teams: CacheData['teams'], rawCompetitions: CacheData['rawCompetitions']): void {
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

      cacheFile.replace_contents(
        data,
        null,
        false,
        Gio.FileCreateFlags.NONE,
        null
      );
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
}
