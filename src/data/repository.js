// Data repository for scores and schedules
// Handles API calls, caching, and data transformation

export class Repository {
  constructor(client, settings) {
    this._client = client;
    this._settings = settings;
    this._scheduleCache = new Map();
  }

  async loadScores() {
    return await this._client.getScores();
  }

  async loadNextGames() {
    if (!this._client.isShowNextGamesEnabled()) return [];
    const followed = this._settings.get_strv('followed-teams') || [];
    const eventsByLeague = new Map();
    const seenEvents = new Set();
    const CACHE_TTL_MS = 10 * 60 * 1000;
    // Fetch schedules in parallel to avoid awaiting inside the loop
    const teamPromises = followed.map(async (teamId) => {
      try {
        const cached = this._scheduleCache.get(teamId);
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
          return cached.events;
        }
        const teamEvents = await this._client.getTeamSchedule(teamId);
        this._scheduleCache.set(teamId, { ts: Date.now(), events: teamEvents });
        return teamEvents;
      } catch (err) {
        console.warn('Error fetching schedule (first attempt):', teamId, err);
        // fallback: try once more, otherwise return empty
        try {
          return await this._client.getTeamSchedule(teamId);
        } catch (err2) {
          console.warn('Failed to fetch schedule for', teamId, err2);
          return [];
        }
      }
    });

    const teamResults = await Promise.all(teamPromises);
    for (const teamEvents of teamResults) {
      for (const ev of teamEvents) {
        const key = `${ev.timestamp}-${ev.home.team}-${ev.away.team}`;
        if (seenEvents.has(key)) continue;
        seenEvents.add(key);
        const leagueName = ev.league || ev.competition || ev.home.league || 'Next Games';
        if (!eventsByLeague.has(leagueName)) eventsByLeague.set(leagueName, { league: leagueName, games: [] });
        eventsByLeague.get(leagueName).games.push(ev);
      }
    }
    return Array.from(eventsByLeague.values());
  }
}
