/**
 * Data repository for scores and schedules.
 * Handles API calls, caching, and data transformation.
 */
export class Repository {
    _client;
    _settings; // Gio.Settings
    _scheduleCache;
    static CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
    /**
     * Creates a new Repository instance
     *
     * @param client - The client for fetching scores and schedules
     * @param settings - GSettings instance for reading configuration
     */
    constructor(client, settings) {
        this._client = client;
        this._settings = settings;
        this._scheduleCache = new Map();
    }
    /**
     * Loads current scores from the client
     *
     * @returns Promise resolving to array of leagues with games
     */
    async loadScores() {
        return await this._client.getScores();
    }
    /**
     * Loads upcoming games for followed teams with deduplication and caching
     *
     * @returns Promise resolving to array of leagues with upcoming games
     */
    async loadNextGames() {
        if (!this._client.isShowNextGamesEnabled()) {
            return [];
        }
        const followed = this._settings.get_strv("followed-teams") || [];
        const eventsByLeague = new Map();
        const seenEvents = new Set();
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
                eventsByLeague.get(leagueName).games.push(event);
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
    async _fetchTeamSchedules(teamIds) {
        const teamPromises = teamIds.map(async (teamId) => {
            try {
                return await this._fetchSingleTeamSchedule(teamId);
            }
            catch (err) {
                console.warn(`Error fetching schedule for team ${teamId}:`, err);
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
    async _fetchSingleTeamSchedule(_teamId) {
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
    async _retryFetchSchedule(_teamId) {
        try {
            return await this._client.getTeamSchedule(_teamId);
        }
        catch (err) {
            console.warn(`Failed to fetch schedule for team ${_teamId} after retry:`, err);
            return [];
        }
    }
    /**
     * Checks if a cache entry is still valid
     *
     * @param entry - The cache entry to check
     * @returns True if the cache is still valid
     */
    _isCacheValid(entry) {
        return Date.now() - entry.ts < Repository.CACHE_TTL_MS;
    }
    /**
     * Creates a unique key for event deduplication
     *
     * @param event - The event to create a key for
     * @returns A unique string key for the event
     */
    _createEventKey(event) {
        return `${event.timestamp}-${event.home.team}-${event.away.team}`;
    }
    /**
     * Extracts the league name from an event
     *
     * @param event - The event to extract league name from
     * @returns The league name or a default value
     */
    _extractLeagueName(event) {
        return (event.league ||
            event.competition ||
            event.home?.league ||
            "Next Games");
    }
    /**
     * Clears the schedule cache
     */
    clearCache() {
        this._scheduleCache.clear();
    }
}
