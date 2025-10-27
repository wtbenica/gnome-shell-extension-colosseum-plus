import Gio from '@girs/gio-2.0';

import { Game } from "../widgets/scoreboard_view.js";
import { logWarn } from '../utils/logging';

/**
 * Represents a league with its games
 */
export interface League {
  league: string;
  games: Game[];
  following?: string[];
}

/**
 * Client interface for fetching scores and schedules
 */
export interface ScoresClient {
  getScores(): Promise<League[]>;
  getTeamSchedule(_teamId: string): Promise<Game[]>;
  isShowNextGamesEnabled(): boolean;
}

/**
 * Cache entry for team schedules
 */
interface ScheduleCacheEntry {
  ts: number;
  events: Game[];
}

/**
 * Data repository for scores and schedules.
 * Handles API calls, caching, and data transformation.
 */
export class Repository {
  private _client: ScoresClient;
  private _settings: Gio.Settings;
  private _scheduleCache: Map<string, ScheduleCacheEntry>;
  private static readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Creates a new Repository instance
   * 
   * @param client - The client for fetching scores and schedules
   * @param settings - GSettings instance for reading configuration
   */
  constructor(client: ScoresClient, settings: Gio.Settings) {
    this._client = client;
    this._settings = settings;
    this._scheduleCache = new Map();
  }

  /**
   * Loads current scores from the client
   * 
   * @returns Promise resolving to array of leagues with games
   */
  async loadScores(): Promise<League[]> {
    return await this._client.getScores();
  }

  /**
   * Loads upcoming games for followed teams with deduplication and caching
   * 
   * @returns Promise resolving to array of leagues with upcoming games
   */
  async loadNextGames(): Promise<League[]> {
    if (!this._client.isShowNextGamesEnabled()) {
      return [];
    }

    const followed = this._settings.get_strv("followed-teams") || [];
    const eventsByLeague = new Map<string, League>();
    const seenEvents = new Set<string>();

    const teamSchedules = await this._fetchTeamSchedules(followed);

    for (const events of teamSchedules) {
      for (const event of events) {
        const eventKey = this._createEventKey(event);

        if (seenEvents.has(eventKey)) {
          continue;
        }

        seenEvents.add(eventKey);
        const leagueName = this._extractLeagueName(event);

        if (!eventsByLeague.has(leagueName)) {
          eventsByLeague.set(leagueName, { league: leagueName, games: [] });
        }

        eventsByLeague.get(leagueName)!.games.push(event);
      }
    }

    return Array.from(eventsByLeague.values());
  }

  /**
   * Fetches schedules for multiple teams in parallel with caching and retry logic
   * 
   * @param teamIds - Array of team IDs to fetch schedules for
   * @returns Promise resolving to array of game arrays
   */
  private async _fetchTeamSchedules(teamIds: string[]): Promise<Game[][]> {
    const teamPromises = teamIds.map(async (teamId) => {
      try {
        return await this._fetchSingleTeamSchedule(teamId);
      } catch (err) {
        logWarn(`Error fetching schedule for team ${teamId}: ${err}`);
        return await this._retryFetchSchedule(teamId);
      }
    });

    return await Promise.all(teamPromises);
  }

  /**
   * Fetches schedule for a single team, using cache if available
   * 
   * @param _teamId - The team ID to fetch schedule for
   * @returns Promise resolving to array of games
   */
  private async _fetchSingleTeamSchedule(_teamId: string): Promise<Game[]> {
    const cached = this._scheduleCache.get(_teamId);
    if (cached && this._isCacheValid(cached)) {
      return cached.events;
    }

    const events = await this._client.getTeamSchedule(_teamId);
    this._scheduleCache.set(_teamId, { ts: Date.now(), events });

    return events;
  }

  /**
   * Retries fetching a team's schedule once on failure
   * 
   * @param _teamId - The team ID to retry fetching for
   * @returns Promise resolving to array of games, or empty array on failure
   */
  private async _retryFetchSchedule(_teamId: string): Promise<Game[]> {
    try {
      return await this._client.getTeamSchedule(_teamId);
    } catch (err) {
      logWarn(`Failed to fetch schedule for team ${_teamId} after retry: ${err}`);
      return [];
    }
  }

  /**
   * Checks if a cache entry is still valid
   * 
   * @param entry - The cache entry to check
   * @returns True if the cache is still valid
   */
  private _isCacheValid(entry: ScheduleCacheEntry): boolean {
    return Date.now() - entry.ts < Repository.CACHE_TTL_MS;
  }

  /**
   * Creates a unique key for event deduplication
   * 
   * @param event - The event to create a key for
   * @returns A unique string key for the event
   */
  private _createEventKey(event: Game): string {
    return `${event.timestamp}-${event.home.team}-${event.away.team}`;
  }

  /**
   * Extracts the league name from an event
   * 
   * @param event - The event to extract league name from
   * @returns The league name or a default value
   */
  private _extractLeagueName(event: Game): string {
    return (
      event.league ||
      event.competition ||
      event.home?.league ||
      "Next Games"
    );
  }

  /**
   * Clears the schedule cache
   */
  clearCache(): void {
    this._scheduleCache.clear();
  }
}
