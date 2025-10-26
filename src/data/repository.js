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
    for (const teamId of followed) {
      const CACHE_TTL_MS = 10 * 60 * 1000;
      let teamEvents = [];
      try {
        const cached = this._scheduleCache.get(teamId);
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
          teamEvents = cached.events;
        } else {
          teamEvents = await this._client.getTeamSchedule(teamId);
          this._scheduleCache.set(teamId, { ts: Date.now(), events: teamEvents });
        }
      } catch (e) {
        teamEvents = await this._client.getTeamSchedule(teamId);
      }
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
