import GLib from "gi://GLib";
import Soup from "gi://Soup";
import Gio from "gi://Gio";

function loadEnv() {
  // Try to load from extension directory first
  const extensionPath = GLib.get_home_dir() + '/.local/share/gnome-shell/extensions/colosseum@sereneblue';
  let envFile = Gio.File.new_for_path(extensionPath + '/.env');
  
  // If not found, try current directory (for development)
  if (!envFile.query_exists(null)) {
    envFile = Gio.File.new_for_path('.env');
  }
  
  if (!envFile.query_exists(null)) {
    console.warn('Colosseum: No .env file found. API key will not be available.');
    return {};
  }
  
  try {
    const [success, contents] = envFile.load_contents(null);
    if (!success) {
      return {};
    }
    const text = new TextDecoder().decode(contents);
    const env = {};
    text.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length) {
        let value = valueParts.join('=').trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        env[key.trim()] = value;
      }
    });
    return env;
  } catch (error) {
    console.error('Colosseum: Failed to load .env file:', error);
    return {};
  }
}

const env = loadEnv();
const API_KEY = env.API_FOOTBALL_KEY;
const BASE_API_URL = "https://v3.football.api-sports.io/";
const CACHE_FILE = GLib.get_user_cache_dir() + '/colosseum-data.json';
const CACHE_DURATION_DAYS = 7; // Update weekly

class DataLoaderClass {
  // Helper for Sportradar GET requests with correct headers
  async _sportradarRequest(endpoint) {
    const apiKey = env.SPORT_RADAR_KEY;
    if (!apiKey) {
      console.error("Sportradar API key missing in .env");
      return null;
    }
    const url = `https://api.sportradar.com/soccer/trial/v4/${endpoint}`;
    const message = Soup.Message.new("GET", url);
    message.request_headers.append("x-api-key", apiKey);
    message.request_headers.append("accept", "application/json");
    return new Promise((resolve, reject) => {
      this.session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, res) => {
          const data = session.send_and_read_finish(res);
          if (data) {
            const text = this._decoder.decode(data.toArray());
            console.log("Sportradar raw response:", text);
            try {
              const json = JSON.parse(text);
              resolve(json);
            } catch (e) {
              console.error("Failed to parse Sportradar response:", e);
              resolve(null);
            }
          } else {
            console.error("No response from Sportradar endpoint");
            resolve(null);
          }
        }
      );
    });
  }
  async fetchSportradarCompetitionInfo(competitionId, locale = "en") {
    const apiKey = env.SPORT_RADAR_KEY;
    if (!apiKey) {
      console.error("Sportradar API key missing in .env");
      return null;
    }
    const url = `https://api.sportradar.com/soccer/trial/v4/${locale}/competitions/${competitionId}/info.json?api_key=${apiKey}`;
    const message = Soup.Message.new("GET", url);
    return new Promise((resolve, reject) => {
      this.session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, res) => {
          const data = session.send_and_read_finish(res);
          if (data) {
            try {
              const text = this._decoder.decode(data.toArray());
              console.log("Sportradar raw competition info response:", text);
              const json = JSON.parse(text);
              console.log("Sportradar competition info response:", json);
              resolve(json);
            } catch (e) {
              console.error("Failed to parse Sportradar competition info response:", e);
              resolve(null);
            }
          } else {
            console.error("No response from Sportradar competition info endpoint");
            resolve(null);
          }
        }
      );
    });
  }
  constructor() {
    console.log('DataLoader: Constructor called');
    this.session = new Soup.Session();
    this._decoder = new TextDecoder();
    this.leagues = null;
    this.teams = {};
    this.cache = this.loadCache();
    console.log('DataLoader: Constructor complete, cache loaded');
      // Test Sportradar competitions fetch on startup
      this.fetchSportradarCompetitions("en").then(comps => {
        if (comps.length > 0) {
          console.log(`Sportradar: Loaded ${comps.length} competitions.`);
          comps.slice(0, 5).forEach(c => {
            console.log(`Sportradar: Competition: ${c.name} (${c.id})`);
          });
        } else {
          console.warn("Sportradar: No competitions loaded or API error.");
        }
      });
    // Test Sportradar competition info fetch on startup
    this.fetchSportradarCompetitionInfo("sr:competition:17", "en").then(info => {
      if (info) {
        console.log("Sportradar: Competition info loaded for sr:competition:17.");
      } else {
        console.warn("Sportradar: Competition info not loaded or API error.");
      }
    });
  }
    async fetchSportradarCompetitions(locale = "en") {
      const json = await this._sportradarRequest(`${locale}/competitions.json`);
      if (json && Array.isArray(json.competitions)) {
        console.log("Sportradar competitions response:", json);
        return json.competitions;
      } else {
        console.warn("Sportradar: No competitions loaded or API error.");
        return [];
      }
    }

  loadCache() {
    console.log('DataLoader: ===== loadCache called =====');
    try {
      console.log('DataLoader: Cache file path:', CACHE_FILE);
      const cacheFile = Gio.File.new_for_path(CACHE_FILE);
      if (cacheFile.query_exists(null)) {
        console.log('DataLoader: Cache file exists, loading...');
        const [success, contents] = cacheFile.load_contents(null);
        if (success) {
          const text = this._decoder.decode(contents);
          const parsed = JSON.parse(text);
          console.log('DataLoader: Cache loaded successfully, leagues:', parsed.leagues ? parsed.leagues.length : 0);
          return parsed;
        } else {
          console.warn('DataLoader: Failed to load cache file contents');
        }
      } else {
        console.log('DataLoader: Cache file does not exist');
      }
    } catch (error) {
      console.error('DataLoader: Failed to load cache:', error);
    }
    console.log('DataLoader: Returning empty cache');
    return { lastUpdate: 0, leagues: [], teams: {} };
  }

  saveCache() {
    try {
      const cacheDir = Gio.File.new_for_path(GLib.get_user_cache_dir());
      if (!cacheDir.query_exists(null)) {
        cacheDir.make_directory_with_parents(null);
      }
      const cacheFile = Gio.File.new_for_path(CACHE_FILE);
      const data = JSON.stringify({
        lastUpdate: Date.now(),
        leagues: this.leagues,
        teams: this.teams
      });
      const [success] = cacheFile.replace_contents(
        data,
        null,
        false,
        Gio.FileCreateFlags.NONE,
        null
      );
      if (!success) {
        console.error('Failed to save cache');
      }
    } catch (error) {
      console.error('Failed to save cache:', error);
    }
  }

  shouldUpdateData() {
    const now = new Date();
    const lastUpdate = new Date(this.cache.lastUpdate);
    const daysSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60 * 24);

    // Update if cache is older than CACHE_DURATION_DAYS and it's Monday (low activity day)
    return daysSinceUpdate >= CACHE_DURATION_DAYS && now.getDay() === 1; // Monday
  }

  _getAPIKey() {
    return API_KEY;
  }

  async fetchLeagues() {
    console.log('DataLoader: ===== fetchLeagues called =====');
    if (this.leagues && this.leagues.length > 0) {
      console.log('DataLoader: Returning cached leagues:', this.leagues.length);
      return this.leagues;
    }

    console.log('DataLoader: About to load cache...');
    await this.loadCache();
    console.log('DataLoader: Cache loaded');

    // Check if API key is available
    console.log('DataLoader: Getting API key...');
    const API_KEY = this._getAPIKey();
    console.log('DataLoader: API key loaded, exists:', !!API_KEY, 'length:', API_KEY ? API_KEY.length : 0);

    if (!API_KEY) {
      console.warn('DataLoader: No API key available, using cached data only');
      if (this.cache && this.cache.leagues) {
        console.log('DataLoader: Using cached leagues:', this.cache.leagues.length);
        this.leagues = this.cache.leagues;
        return this.leagues;
      }
      console.warn('DataLoader: No cached leagues available either');
      return [];
    }

    console.log('DataLoader: Fetching leagues from API...');
    const url = `${BASE_API_URL}leagues?season=2024`;
    const message = Soup.Message.new("GET", url);
    message.request_headers.append("x-rapidapi-key", API_KEY);
    message.request_headers.append("x-rapidapi-host", "v3.football.api-sports.io");

    return new Promise((resolve, reject) => {
      this.session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, res) => {
          const data = session.send_and_read_finish(res);
          if (data) {
            try {
              const text = this._decoder.decode(data.toArray());
              const json = JSON.parse(text);
              this.leagues = json.response || [];
              this.saveCache();
              resolve(this.leagues);
            } catch (e) {
              console.error('Failed to parse leagues response:', e);
              // Fall back to cache if available
              if (this.cache.leagues) {
                this.leagues = this.cache.leagues;
                resolve(this.leagues);
              } else {
                resolve([]);
              }
            }
          } else {
            // Fall back to cache if available
            if (this.cache.leagues) {
              this.leagues = this.cache.leagues;
              resolve(this.leagues);
            } else {
              resolve([]);
            }
          }
        }
      );
    });
  }

  async fetchTeams(leagueId) {
    if (this.teams[leagueId]) return this.teams[leagueId];

    // Check cache first
    if (this.cache.teams && this.cache.teams[leagueId] && !this.shouldUpdateData()) {
      this.teams[leagueId] = this.cache.teams[leagueId];
      return this.teams[leagueId];
    }

    const url = `${BASE_API_URL}teams?league=${leagueId}&season=2024`;
    const message = Soup.Message.new("GET", url);
    message.request_headers.append("x-rapidapi-key", API_KEY);
    message.request_headers.append("x-rapidapi-host", "v3.football.api-sports.io");

    return new Promise((resolve, reject) => {
      this.session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, res) => {
          const data = session.send_and_read_finish(res);
          if (data) {
            try {
              const text = this._decoder.decode(data.toArray());
              const json = JSON.parse(text);
              this.teams[leagueId] = json.response || [];
              this.saveCache();
              resolve(this.teams[leagueId]);
            } catch (e) {
              console.error('Failed to parse teams response:', e);
              // Fall back to cache if available
              if (this.cache.teams && this.cache.teams[leagueId]) {
                this.teams[leagueId] = this.cache.teams[leagueId];
                resolve(this.teams[leagueId]);
              } else {
                resolve([]);
              }
            }
          } else {
            // Fall back to cache if available
            if (this.cache.teams && this.cache.teams[leagueId]) {
              this.teams[leagueId] = this.cache.teams[leagueId];
              resolve(this.teams[leagueId]);
            } else {
              resolve([]);
            }
          }
        }
      );
    });
  }

  async fetchTeams(leagueId) {
    if (this.teams[leagueId]) return this.teams[leagueId];

    // Check cache first
    if (this.cache.teams && this.cache.teams[leagueId] && !this.shouldUpdateData()) {
      this.teams[leagueId] = this.cache.teams[leagueId];
      return this.teams[leagueId];
    }

    const url = `${BASE_API_URL}teams?league=${leagueId}&season=2024`;
    const message = Soup.Message.new("GET", url);
    message.request_headers.append("x-rapidapi-key", API_KEY);
    message.request_headers.append("x-rapidapi-host", "v3.football.api-sports.io");

    return new Promise((resolve, reject) => {
      this.session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, res) => {
          const data = session.send_and_read_finish(res);
          if (data) {
            try {
              const text = this._decoder.decode(data.toArray());
              const json = JSON.parse(text);
              this.teams[leagueId] = json.response || [];
              this.saveCache();
              resolve(this.teams[leagueId]);
            } catch (e) {
              console.error('Failed to parse teams response:', e);
              // Fall back to cache if available
              if (this.cache.teams && this.cache.teams[leagueId]) {
                this.teams[leagueId] = this.cache.teams[leagueId];
                resolve(this.teams[leagueId]);
              } else {
                resolve([]);
              }
            }
          } else {
            // Fall back to cache if available
            if (this.cache.teams && this.cache.teams[leagueId]) {
              this.teams[leagueId] = this.cache.teams[leagueId];
              resolve(this.teams[leagueId]);
            } else {
              resolve([]);
            }
          }
        }
      );
    });
  }

  async fetchLeagues() {
    if (this.leagues) return this.leagues;

    if (!API_KEY || API_KEY === 'your_api_key_here') {
      console.warn('API key not configured. Please set API_FOOTBALL_KEY in .env file');
      return [];
    }

    const url = `${BASE_API_URL}leagues?season=2024`;
    const message = Soup.Message.new("GET", url);
    message.request_headers.append("x-rapidapi-key", API_KEY);
    message.request_headers.append("x-rapidapi-host", "v3.football.api-sports.io");

    return new Promise((resolve, reject) => {
      this.session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, res) => {
          const data = session.send_and_read_finish(res);
          if (data) {
            try {
              const text = this._decoder.decode(data.toArray());
              const json = JSON.parse(text);
              this.leagues = json.response || [];
              resolve(this.leagues);
            } catch (e) {
              resolve([]);
            }
          } else {
            resolve([]);
          }
        }
      );
    });
  }

  async fetchTeams(leagueId) {
    if (this.teams[leagueId]) return this.teams[leagueId];

    const url = `${BASE_API_URL}teams?league=${leagueId}&season=2024`;
    const message = Soup.Message.new("GET", url);
    message.request_headers.append("x-rapidapi-key", API_KEY);
    message.request_headers.append("x-rapidapi-host", "v3.football.api-sports.io");

    return new Promise((resolve, reject) => {
      this.session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, res) => {
          const data = session.send_and_read_finish(res);
          if (data) {
            try {
              const text = this._decoder.decode(data.toArray());
              const json = JSON.parse(text);
              this.teams[leagueId] = json.response || [];
              resolve(this.teams[leagueId]);
            } catch (e) {
              resolve([]);
            }
          } else {
            resolve([]);
          }
        }
      );
    });
  }

  async getDynamicConstants() {
    const leagues = await this.fetchLeagues();
    
    const PREF_LEAGUES = {};
    const DISPLAY_NAME = {};
    const SPORTS = {};

    // Map leagues to our format
    const leagueMapping = {
      78: 'Bund', // Bundesliga
      79: 'Bund2', // 2. Bundesliga
      2: 'UCL', // UEFA Champions League
      40: 'English League Championship',
      41: 'English League One',
      39: 'EPL', // Premier League
      233: 'ISR', // Ligat ha'Al
      140: 'LaLiga',
      262: 'LaLigaMX',
      61: 'Ligue 1',
      253: 'MLS',
      135: 'Serie A',
    };

    for (const league of leagues) {
      const key = leagueMapping[league.league.id];
      if (key) {
        PREF_LEAGUES[key] = `${key.toLowerCase()}-enabled`;
        DISPLAY_NAME[key] = league.league.name;
        
        // Fetch teams for this league
        const teams = await this.fetchTeams(league.league.id);
        SPORTS[key] = teams.map(team => ({
          id: team.team.id,
          name: team.team.name,
          pref: `${key.toLowerCase()}-${team.team.name.toLowerCase().replace(/\s+/g, '')}`,
        }));
      }
    }

    // For tournaments, keep static for now
    const PREF_TOURNAMENTS = {
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

    return {
      PREF_UPDATE_FREQ: "update-frequency",
      PREF_FOLLOWED_ONLY: "followed-only",
      PREF_COMPACT_MODE: "compact-mode",
      PREF_POSITION_TOPBAR: "position-in-topbar",
      PREF_SHOW_NEXT_GAMES: "show-next-games",
      PREF_LEAGUES,
      DISPLAY_NAME,
      PREF_TOURNAMENTS,
      SPORTS,
    };
  }
}

// Export singleton instance
const DataLoader = new DataLoaderClass();
export default DataLoader;