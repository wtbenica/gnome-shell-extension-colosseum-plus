import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";


import * as CONSTANTS from "../const.js";


import ColosseumClient from "../client.js";
import { GameLink } from "./game_link.js";
import { TeamSelectorDialog } from "./team_selector.js";
import { logInfo, logErr } from "../logging/error_utils.js";

const EXT_PATH = import.meta.url;

// GNOME accent color names mapped to hex values
const ACCENT_MAP_LIGHT = {
  blue: "#81D0FF",
  teal: "#7bdff4",
  green: "#8de698",
  yellow: "#ffc057",
  orange: "#ff9c5b",
  red: "#ff888c",
  pink: "#ffa0d8",
  purple: "#fba7ff",
  slate: "#bbd1e5",
};

const ACCENT_MAP = {
  blue: "#3584E4",
  teal: "#2190A4",
  green: "#3A944A",
  yellow: "#C88800",
  orange: "#ED5B00",
  red: "#E62D42",
  pink: "#D56199",
  purple: "#9141AC",
  slate: "#6F8396",
};

const ACCENT_MAP_DARK = {
  blue: "#0461be",
  teal: "#007184",
  green: "#15772e",
  yellow: "#905300",
  orange: "#b62200",
  red: "#c0023",
  pink: "#a2326c",
  purple: "#8939a4",
  slate: "#526678",
};

/**
 * Get the current GNOME accent color as a hex string.
 * Returns the accent color if set, otherwise falls back to blue.
 */
function getAccentColor() {
  try {
    const ifaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
    const accentName = ifaceSettings.get_string('accent-color');
    if (accentName) {
      const normalized = accentName.trim().toLowerCase();
      return ACCENT_MAP_LIGHT[normalized] || '#3584E4'; // fallback to blue
    }
  } catch (e) {
    // ignore and fall back
  }
  return '#3584E4'; // default blue
}

export const Colosseum = GObject.registerClass(
  { GTypeName: "Colosseum" },
  class Colosseum extends PanelMenu.Button {
    _init() {
      super._init(0.0, "colosseum", false);

      this._scores = [];
      this._nextGames = [];
      this._nextGamesMissingApiKey = false;
      this._timeout = null;
      this._settings = null;
      // In-memory cache for competitor schedules to avoid repeated API calls during a session
      // Map: teamId -> { ts: <Date.now()>, events: [...] }
      this._scheduleCache = new Map();

      // Make the panel box reactive so clicks are handled correctly by the parent PanelMenu.Button
      // Keep track_hover false to avoid hover highlighting; visual hover is suppressed in stylesheet.
      this._panelBoxLayout = new St.BoxLayout({ reactive: true, track_hover: false });

      this._icon = new St.Icon({
        gicon: Gio.icon_new_for_string(
          EXT_PATH.replace("widgets/colosseum.js", "icon/colosseum-symbolic.svg"),
        ),
        icon_size: 24,
      });

      this._menuText = new St.Label({
        text: "",
        y_align: Clutter.ActorAlign.CENTER,
      });

      // Make sure the box is reactive so clicks go to the parent PanelMenu.Button
      // instead of being absorbed by child actors.
      this._panelBoxLayout.add_child(this._icon);
      this._panelBoxLayout.add_child(this._menuText);

      this.add_child(this._panelBoxLayout);
      // Make the panel button visible by default so the extension icon/menu
      // is always present in the top bar even when there are no current games.
      // Show after adding children so event handling is set up correctly.
      this.show();
    }

    setSettings(settings, constants) {
      this._settings = settings;
      this._constants = constants;
      this._settings.connect(
        "changed::" + CONSTANTS.PREF_POSITION_TOPBAR,
        () => { this._updatePositionInPanel(); }
      );
      this._settings.connect(
        "changed::" + CONSTANTS.PREF_FOLLOWED_ONLY,
        () => { this._update(); }
      );
      this._settings.connect(
        "changed::" + CONSTANTS.PREF_COMPACT_MODE,
        () => { this._update(); }
      );
      this._settings.connect(
        "changed::" + CONSTANTS.PREF_SHOW_NEXT_GAMES,
        () => { this._update(); }
      );

      // Listen for changes to followed teams and reload data
      this._settings.connect(
        "changed::followed-teams",
        () => { this._update(); }
      );

      this._client = new ColosseumClient(this._constants, this._settings);
    }

    _addGamesToGrid(grid, games, offset = 0, league = null) {
      if (league != null) {
        grid.insert_row(offset);
        grid.insert_column(offset);
        grid.insert_column(offset);
        grid.insert_column(offset);

        let leagueName = new St.Label({
          text: league,
          y_expand: true,
          x_align: Clutter.ActorAlign.CENTER,
          y_align: Clutter.ActorAlign.CENTER,
        });

        grid.attach(leagueName, 0, offset, 3, 1);
        offset = offset + 1;
      }

      // Get accent color for followed teams
      const accentColor = getAccentColor();

      // get followed teams for this league (if provided) so we can style them
      let followedIds = [];
      try {
        if (league && this._client && typeof this._client.getFollowedTeams === 'function') {
          followedIds = this._client.getFollowedTeams(league) || [];
        }
      } catch (e) {
        followedIds = [];
      }

      let pos;
      for (let j = 0; j < games.length * 3 - 1; j++) {
        pos = j + offset;

        grid.insert_row(pos);
        grid.insert_column(pos);
        grid.insert_column(pos);
        grid.insert_column(pos);
      }

      for (let j = 0; j < games.length; j++) {
        let homeRow = offset + j * 3;
        let awayRow = homeRow + 1;
        let divider_row =
          games.length == 1 ? 0 : j == games.length - 1 ? 0 : homeRow + 2;

        let homeSuffix = games[j].home.isWinner
          ? "--winner"
          : games[j].home.isLoser
            ? "--loser"
            : "";
        let awaySuffix = games[j].away.isWinner
          ? "--winner"
          : games[j].away.isLoser
            ? "--loser"
            : "";

        const homeFollowed = followedIds.indexOf(String(games[j].home.id)) >= 0;

        let homeLabel = new St.Label({
          text: games[j].home.team,
          style_class: "team" + homeSuffix + (homeFollowed ? " team--followed" : ""),
          y_expand: true,
          y_align: Clutter.ActorAlign.CENTER,
        });

        if (homeFollowed) {
          try { homeLabel.add_style_class_name('team--followed'); } catch (e) { }
          try { if (accentColor) homeLabel.set_style(`color: ${accentColor}; font-weight: 800;`); } catch (e) { }
        }

        let homeScore = new St.Label({
          text: games[j].home.score,
          style_class: "score" + homeSuffix,
          y_expand: true,
          y_align: Clutter.ActorAlign.CENTER,
        });

        let gameMeta = new St.Label({
          text: games[j].meta,
          style_class: "meta",
          y_expand: true,
          y_align: Clutter.ActorAlign.CENTER,
        });

        grid.attach(homeLabel, 0, homeRow, 1, 1);
        grid.attach(homeScore, 1, homeRow, 1, 1);
        grid.attach(gameMeta, 2, homeRow, 1, 1);

        const awayFollowed = followedIds.indexOf(String(games[j].away.id)) >= 0;

        let awayLabel = new St.Label({
          text: games[j].away.team,
          style_class: "team" + awaySuffix + (awayFollowed ? " team--followed" : ""),
          y_expand: true,
          y_align: Clutter.ActorAlign.CENTER,
        });

        if (awayFollowed) {
          try { awayLabel.add_style_class_name('team--followed'); } catch (e) { }
          try { if (accentColor) awayLabel.set_style(`color: ${accentColor}; font-weight: 800;`); } catch (e) { }
        }

        let awayScore = new St.Label({
          text: games[j].away.score,
          style_class: "score" + awaySuffix,
          y_expand: true,
          y_align: Clutter.ActorAlign.CENTER,
        });

        let gameLink = new GameLink(games[j].link);

        grid.attach(awayLabel, 0, awayRow, 1, 1);
        grid.attach(awayScore, 1, awayRow, 1, 1);
        grid.attach(gameLink, 2, awayRow, 1, 1);

        let div = new St.Label({
          text: "",
          style_class: "divider",
          y_expand: true,
          y_align: Clutter.ActorAlign.CENTER,
        });

        if (divider_row) {
          grid.attach(div, 0, divider_row, 3, 1);
        }
      }

      if (league != null) {
        grid.insert_row(pos + 1);
        grid.insert_column(pos + 1);

        grid.attach(
          new St.Label({
            text: "",
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
          }),
          0,
          pos + 1,
          1,
          1,
        );
      }

      return pos + 2;
    }

    _createMenu() {
      let menus = [];

      // Add Configure Teams menu item at the top
      let configureTeamsItem = new PopupMenu.PopupMenuItem("Configure Teams");
      configureTeamsItem.connect('activate', () => {
        this._openTeamSelector();
      });
      menus.push(configureTeamsItem);

      // Add separator
      let separator = new PopupMenu.PopupSeparatorMenuItem();
      menus.push(separator);

      // We'll flatten all games into a single chronological list and then
      // render them grouped by date. This includes current games (this._scores)
      // and next games (this._nextGames) when enabled.

      const allGames = [];

      // Helper to push games with league and followed info
      const pushGames = (leagueName, games) => {
        let followedIds = [];
        try {
          if (this._client && typeof this._client.getFollowedTeams === 'function') {
            followedIds = this._client.getFollowedTeams(leagueName) || [];
          }
        } catch (e) {
          followedIds = [];
        }

        // If there are no league-scoped followed IDs (e.g., Next Games), fall back to global followed-teams setting
        if ((!followedIds || followedIds.length === 0) && this._settings) {
          try {
            const globalFollowed = this._settings.get_strv('followed-teams') || [];
            if (globalFollowed && globalFollowed.length > 0) {
              followedIds = globalFollowed;
            }
          } catch (e) {
            // ignore
          }
        }

        // intentionally silent for regular operation (no debug logging)

        for (let g of games) {
          // mark whether each team is followed
          g._league = leagueName;
          g._homeFollowed = followedIds.indexOf(String(g.home.id)) >= 0;
          g._awayFollowed = followedIds.indexOf(String(g.away.id)) >= 0;
          allGames.push(g);
        }
      };
      // Build compact grid for single-game leagues (kept from previous layout)
      const HAS_COMPACT =
        this._isCompactMode() &&
        this._scores.filter((s) => s.games.length === 1).length > 0;

      const compactGrid = new Clutter.GridLayout();
      compactGrid.set_row_homogeneous(false);
      compactGrid.set_orientation(Clutter.Orientation.VERTICAL);

      const compactWidget = new St.Widget({
        style_class: "scoreboard",
        can_focus: false,
        track_hover: false,
        reactive: false,
        layout_manager: compactGrid,
      });

      let offset = 0;

      // Respect compact mode by collecting single-game leagues into compactGrid
      for (let i = 0; i < this._scores.length; i++) {
        if (HAS_COMPACT && this._scores[i].games.length === 1) {
          offset = this._addGamesToGrid(
            compactGrid,
            this._scores[i].games,
            offset,
            this._scores[i].league,
          );
        } else {
          // For non-compact rendering, just collect games to be flattened
          pushGames(this._scores[i].league, this._scores[i].games);
        }
      }

      // Include upcoming games (flatten) if enabled
      if (this._client && this._client.isShowNextGamesEnabled && this._client.isShowNextGamesEnabled()) {
        for (let i = 0; i < this._nextGames.length; i++) {
          pushGames(this._nextGames[i].league, this._nextGames[i].games);
        }
      }

      // Debugging output removed for production

      // If compact content exists, add it first as before
      if (HAS_COMPACT) {
        const baseMenuItem = new PopupMenu.PopupBaseMenuItem({
          hover: false,
          activate: false,
        });
        const scrollView = new St.ScrollView({
          width: 295,
          hscrollbar_policy: St.PolicyType.NEVER,
          vscrollbar_policy: St.PolicyType.AUTOMATIC,
          enable_mouse_scrolling: true,
          y_expand: true,
        });
        const box = new St.BoxLayout({
          width: 295,
          y_expand: true,
        });

        box.add_child(compactWidget);
        scrollView.add_child(box);
        baseMenuItem.add_child(scrollView);
        menus.unshift(baseMenuItem);
      }

      // If no flattened games and no compact items, but Next Games preference is enabled,
      // ensure a placeholder "Next Games" submenu exists so the user can always access it.
      if (allGames.length === 0) {
        if (this._client && this._client.isShowNextGamesEnabled && this._client.isShowNextGamesEnabled()) {
          let submenu = new PopupMenu.PopupSubMenuMenuItem("Next Games");
          // Disable hover highlighting on the submenu header without graying out text
          try {
            if (submenu && submenu.actor) {
              submenu.actor.track_hover = false;
            }
          } catch (__) { }
          submenu.add_style_class_name("scoreBoardPanel");
          submenu.connect('activate', (submenu) => {
            submenu.setSubmenuShown(!submenu.submenuShown);
            return true;
          });

          let baseMenuItem = new PopupMenu.PopupBaseMenuItem({
            hover: false,
            activate: false,
          });
          // Disable hover without graying out text
          try {
            if (baseMenuItem && baseMenuItem.actor) {
              baseMenuItem.actor.track_hover = false;
            }
          } catch (__) { }

          let placeholderText = "No upcoming games";
          if (this._nextGamesMissingApiKey) {
            placeholderText = "No upcoming games — missing SPORT_RADAR_KEY (.env). Open extension prefs to add it.";
          }

          let placeholder = new St.Label({
            text: placeholderText,
            y_align: Clutter.ActorAlign.CENTER,
          });

          baseMenuItem.add_child(placeholder);
          submenu.menu.addMenuItem(baseMenuItem);
          menus.push(submenu);
        }

        return menus;
      }

      // Sort games by timestamp (chronological)
      allGames.sort((a, b) => a.timestamp - b.timestamp);

      // Render games grouped by date using vertical BoxLayout of horizontal rows
      let currentDay = null;
      // Get accent color for followed teams
      const accentColor = getAccentColor();

      let groupBox = new St.BoxLayout({
        style_class: "scoreboard",
        vertical: true,
        can_focus: false,
        track_hover: false,
        reactive: false,
      });

      for (let idx = 0; idx < allGames.length; idx++) {
        const g = allGames[idx];
        const day = new Date(g.timestamp).toDateString();

        if (currentDay !== day) {
          let dateLabel = new St.Label({
            text: new Date(g.timestamp).toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            }),
            style_class: "date-header",
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
          });
          let dateBox = new St.BoxLayout({ vertical: false, style_class: "date-box" });
          // ensure the date header spans the full menu width so it's truly centered
          dateBox.set_width(295);
          dateBox.add_child(dateLabel);
          groupBox.add_child(dateBox);
          currentDay = day;
        }

        // Home row (horizontal)
        let homeRow = new St.BoxLayout({ vertical: false, style_class: "score-row" });

        let homeSuffix = g.home.isWinner ? "--winner" : g.home.isLoser ? "--loser" : "";
        let awaySuffix = g.away.isWinner ? "--winner" : g.away.isLoser ? "--loser" : "";

        let homeLabel = new St.Label({
          text: g.home.team,
          style_class: "team" + homeSuffix + (g._homeFollowed ? " team--followed" : ""),
          y_align: Clutter.ActorAlign.CENTER,
        });

        if (g._homeFollowed) {
          try { homeLabel.add_style_class_name('team--followed'); } catch (e) { }
          try { if (accentColor) homeLabel.set_style(`color: ${accentColor}; font-weight: 800;`); } catch (e) { }
        }

        let homeScore = new St.Label({
          text: g.home.score,
          style_class: "score" + homeSuffix,
          y_align: Clutter.ActorAlign.CENTER,
        });

        let gameMeta = new St.Label({
          text: g.meta,
          style_class: "meta",
          y_align: Clutter.ActorAlign.CENTER,
        });

        homeRow.add_child(homeLabel);
        homeRow.add_child(homeScore);
        homeRow.add_child(gameMeta);
        groupBox.add_child(homeRow);

        // Away row
        let awayRow = new St.BoxLayout({ vertical: false, style_class: "score-row" });

        let awayLabel = new St.Label({
          text: g.away.team,
          style_class: "team" + awaySuffix + (g._awayFollowed ? " team--followed" : ""),
          y_align: Clutter.ActorAlign.CENTER,
        });

        if (g._awayFollowed) {
          try { awayLabel.add_style_class_name('team--followed'); } catch (e) { }
          try { if (accentColor) awayLabel.set_style(`color: ${accentColor}; font-weight: 800;`); } catch (e) { }
        }

        let awayScore = new St.Label({
          text: g.away.score,
          style_class: "score" + awaySuffix,
          y_align: Clutter.ActorAlign.CENTER,
        });

        let gameLink = new GameLink(g.link);

        awayRow.add_child(awayLabel);
        awayRow.add_child(awayScore);
        awayRow.add_child(gameLink);
        groupBox.add_child(awayRow);

        // Divider
        let div = new St.Label({ text: "", style_class: "divider" });
        let divBox = new St.BoxLayout({ vertical: false, style_class: "divider-box" });
        divBox.add_child(div);
        groupBox.add_child(divBox);
      }
      // force the group to the same width as other panels so columns align
      groupBox.set_width(295);

      const baseMenuItem = new PopupMenu.PopupBaseMenuItem({ hover: false, activate: false });
      // Don't set reactive:false as it causes gray text. Instead just disable hover.
      try {
        if (baseMenuItem && baseMenuItem.actor) {
          baseMenuItem.actor.track_hover = false;
        }
      } catch (__) { }
      baseMenuItem.add_child(groupBox);
      menus.push(baseMenuItem);

      return menus;
    }

    _openTeamSelector() {
      try {
        const dialog = new TeamSelectorDialog(this._settings, this._constants);
        dialog.open();
      } catch (error) {
        try { logErr(error, 'Failed to open team selector'); } catch (e) { }
      }
    }

    _getUpdateSec() {
      return (this._settings.get_int(CONSTANTS.PREF_UPDATE_FREQ) || 5) * 60;
    }

    _isCompactMode() {
      return this._settings.get_boolean(CONSTANTS.PREF_COMPACT_MODE);
    }

    async _update() {
      await this._loadData();
      let menus = this._createMenu();
      this.menu.removeAll();

      for (let i = 0; i < menus.length; i++) {
        this.menu.addMenuItem(menus[i]);
      }

      this._setTopBarText();

      // Removed periodic updates to disable live monitoring
    }

    async _loadData() {
      const tLoadStart = Date.now();
      this._scores = await this._client.getScores();
      if (this._client.isShowNextGamesEnabled()) {
        const tNextGamesStart = Date.now();
        // Build next games from followed teams using DataLoader + Sportradar competitor schedules
        try {
          const DataLoader = (await import('../data.js')).default;
          // Track whether the Sportradar API key is present so we can show a helpful hint
          try {
            this._nextGamesMissingApiKey = !DataLoader.sportradarClient || !DataLoader.sportradarClient.apiKey;
            if (this._nextGamesMissingApiKey) {
              try { logInfo('SPORT_RADAR_KEY is missing; Next Games will be disabled until you add it to .env', 'Colosseum'); } catch (__) { }
            }
          } catch (e) {
            this._nextGamesMissingApiKey = false;
          }
          const followed = this._settings.get_strv('followed-teams') || [];
          const eventsByLeague = new Map();
          const seenEvents = new Set();

          for (const teamId of followed) {
            const tTeamStart = Date.now();
            // Try to use cached schedules when available to reduce API calls
            const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
            let teamEvents = [];
            try {
              const cached = this._scheduleCache.get(teamId);
              if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
                teamEvents = cached.events;
                // cache hit (silent)
              } else {
                // cache miss (silent)
                teamEvents = await DataLoader.fetchCompetitorSchedules(teamId, 7);
                // store in cache
                try { this._scheduleCache.set(teamId, { ts: Date.now(), events: teamEvents }); } catch (__) { }
              }
            } catch (e) {
              // On any cache or fetch error, fall back to direct fetch
              try { teamEvents = await DataLoader.fetchCompetitorSchedules(teamId, 7); } catch (__) { teamEvents = []; }
            }

            // received events for this team (silent)
            for (const ev of teamEvents) {
              // use timestamp + team names to dedupe
              const key = `${ev.timestamp}-${ev.home.team}-${ev.away.team}`;
              if (seenEvents.has(key)) continue;
              seenEvents.add(key);

              const leagueName = ev.league || ev.competition || ev.home.league || 'Next Games';
              if (!eventsByLeague.has(leagueName)) eventsByLeague.set(leagueName, { league: leagueName, games: [], following: [] });
              eventsByLeague.get(leagueName).games.push(ev);
            }
          }

          // convert map to array
          this._nextGames = Array.from(eventsByLeague.values());
        } catch (e) {
          try { logErr(e, 'Failed to load next games from DataLoader, falling back to league-based'); } catch (__) { }
          this._nextGames = await this._client.getNextGames();
        }
      } else {
        this._nextGames = [];
      }
    }

    _setTopBarText() {
      let remainingGames = 0;
      let liveGames = 0;
      let totalGames = 0;
      let following = 0;
      let labelText = "";

      // Count current games
      for (let i = 0; i < this._scores.length; i++) {
        totalGames += this._scores[i].games.length;
        remainingGames += this._scores[i].games.filter(
          (g) => !g.isComplete,
        ).length;
        liveGames += this._scores[i].games.filter((g) => g.live).length;

        for (let j = 0; j < this._scores[i].following.length; j++) {
          if (following < 2) {
            labelText += this._scores[i].following[j] + " ";
          }

          following += 1;
        }
      }

      // Count next games if enabled
      let totalNextGames = 0;
      if (this._nextGames.length > 0) {
        for (let i = 0; i < this._nextGames.length; i++) {
          totalNextGames += this._nextGames[i].games.length;
        }
      }

      if (labelText === "") {
        this._icon.show();

        if (totalGames === 0 && totalNextGames === 0) {
          // Always show the extension, even when no games are available
          this._panelBoxLayout.show();
          this.show();
        } else if (remainingGames === 0 && totalNextGames === 0) {
          this._panelBoxLayout.show();
          this.show();
        } else if (liveGames === 0) {
          if (remainingGames > 0) {
            labelText = "" + remainingGames;
          }
          this._panelBoxLayout.show();
          this.show();
        } else {
          labelText = `${liveGames} / ${remainingGames}`;
          this._panelBoxLayout.show();
          this.show();
        }
      } else {
        this._icon.hide();
        this._panelBoxLayout.show();
        this.show();
      }

      this._menuText.set_text(labelText);
    }

    _updatePositionInPanel() {
      this.container.get_parent().remove_actor(this.container);

      let boxes = {
        left: Main.panel._leftBox,
        center: Main.panel._centerBox,
        right: Main.panel._rightBox,
      };

      let position =
        this._settings.get_int(CONSTANTS.PREF_POSITION_TOPBAR) == 0
          ? "left"
          : "right";
      boxes[position].insert_child_at_index(this.container, 1);
    }

    destroy() {
      // Guard the abort call so destroy is safe for any client implementation.
      try {
        if (this._client && this._client.session && typeof this._client.session.abort === 'function') {
          this._client.session.abort();
        }
      } catch (e) {
        // ignore
      }

      if (this._timeout) {
        GLib.source_remove(this._timeout);
        this._timeout = undefined;

        this.menu.removeAll();
      }

      super.destroy();
    }
  },
);
