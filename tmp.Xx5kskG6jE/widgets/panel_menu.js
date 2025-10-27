import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import St from "gi://St";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as CONSTANTS from "../config/const.js";
import ColosseumClient from "../api/colosseum_client.js";
import { GameLink } from "./game_link.js";
import { TeamSelectorDialog } from "./team_selector.js";
import { logInfo, logErr } from "../utils/logging.js";
import { getAccentColor } from "../utils/accent_color.js";
import { addGamesToGrid } from "./scoreboard_view.js";
import { Repository } from "../data/repository.js";
const EXT_PATH = import.meta.url;
/**
 * Main panel menu class for the Colosseum extension.
 * Manages the top bar icon, menu display, and data updates.
 */
export const Colosseum = GObject.registerClass({ GTypeName: "Colosseum" }, class Colosseum extends PanelMenu.Button {
    _scores;
    _nextGames;
    _nextGamesMissingApiKey;
    _timeout;
    _settings;
    _constants;
    _scheduleCache;
    _panelBoxLayout;
    _icon;
    _menuText;
    _client;
    _repository;
    _init() {
        super._init(0.0, "colosseum", false);
        this._scores = [];
        this._nextGames = [];
        this._nextGamesMissingApiKey = false;
        this._timeout = null;
        this._settings = null;
        this._scheduleCache = new Map();
        this._panelBoxLayout = new St.BoxLayout({
            reactive: true,
            track_hover: false,
        });
        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(EXT_PATH.replace("widgets/panel_menu.ts", "icon/colosseum-symbolic.svg")),
            icon_size: 24,
        });
        this._menuText = new St.Label({
            text: "",
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._panelBoxLayout.add_child(this._icon);
        this._panelBoxLayout.add_child(this._menuText);
        this.add_child(this._panelBoxLayout);
        this.show();
    }
    /**
     * Sets up the extension settings and initializes the client and repository
     *
     * @param settings - GSettings instance for the extension
     * @param constants - Constants object containing preference keys
     */
    setSettings(settings, constants) {
        this._settings = settings;
        this._constants = constants;
        this._connectSettingsSignals();
        this._client = new ColosseumClient(this._constants, this._settings);
        this._repository = new Repository(this._client, this._settings);
    }
    /**
     * Connects settings change signals to trigger updates
     */
    _connectSettingsSignals() {
        if (!this._settings)
            return;
        const settingsToWatch = [
            CONSTANTS.PREF_FOLLOWED_ONLY,
            CONSTANTS.PREF_COMPACT_MODE,
            CONSTANTS.PREF_SHOW_NEXT_GAMES,
            "followed-teams",
        ];
        settingsToWatch.forEach((setting) => {
            this._settings.connect(`changed::${setting}`, () => {
                this._update();
            });
        });
    }
    /**
     * Adds games to a grid layout (delegates to ScoreboardView)
     */
    _addGamesToGrid(grid, games, offset = 0, league = null) {
        return addGamesToGrid(grid, games, offset, league, this._client);
    }
    /**
     * Creates the menu items for the popup
     *
     * @returns Array of menu items
     */
    _createMenu() {
        const menus = [];
        this._addConfigureTeamsMenuItem(menus);
        this._addSeparator(menus);
        const allGames = this._collectAllGames();
        if (this._isCompactMode()) {
            this._addCompactGames(menus);
        }
        if (allGames.length === 0) {
            this._addNextGamesPlaceholder(menus);
            return menus;
        }
        allGames.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        this._addGamesList(menus, allGames);
        return menus;
    }
    /**
     * Adds "Configure Teams" menu item
     */
    _addConfigureTeamsMenuItem(menus) {
        const configureTeamsItem = new PopupMenu.PopupMenuItem("Configure Teams");
        configureTeamsItem.connect("activate", () => {
            this._openTeamSelector();
        });
        menus.push(configureTeamsItem);
    }
    /**
     * Adds a separator to the menu
     */
    _addSeparator(menus) {
        menus.push(new PopupMenu.PopupSeparatorMenuItem());
    }
    /**
     * Collects all games from scores and next games
     *
     * @returns Array of extended games
     */
    _collectAllGames() {
        const allGames = [];
        const pushGames = (leagueName, games) => {
            const followedIds = this._getFollowedIdsForLeague(leagueName);
            for (const game of games) {
                const extendedGame = game;
                extendedGame._league = leagueName;
                extendedGame._homeFollowed = followedIds.includes(String(game.home.id));
                extendedGame._awayFollowed = followedIds.includes(String(game.away.id));
                allGames.push(extendedGame);
            }
        };
        for (const score of this._scores) {
            if (!this._isCompactMode() || score.games.length !== 1) {
                pushGames(score.league, score.games);
            }
        }
        if (this._client?.isShowNextGamesEnabled?.()) {
            for (const nextGame of this._nextGames) {
                pushGames(nextGame.league, nextGame.games);
            }
        }
        return allGames;
    }
    /**
     * Gets followed team IDs for a specific league
     *
     * @param leagueName - The league name
     * @returns Array of followed team IDs
     */
    _getFollowedIdsForLeague(leagueName) {
        try {
            if (this._client && typeof this._client.getFollowedTeams === "function") {
                const ids = this._client.getFollowedTeams(leagueName);
                if (ids && ids.length > 0)
                    return ids;
            }
        }
        catch (e) {
            logErr(e, `Error fetching followed teams for league ${leagueName}`);
        }
        if (this._settings) {
            try {
                return this._settings.get_strv("followed-teams") || [];
            }
            catch (e) {
                logErr(e, "Error fetching global followed teams from settings");
            }
        }
        return [];
    }
    /**
     * Adds compact mode games to the menu
     */
    _addCompactGames(menus) {
        const compactScores = this._scores.filter((s) => s.games.length === 1);
        if (compactScores.length === 0)
            return;
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
        for (const score of compactScores) {
            offset = this._addGamesToGrid(compactGrid, score.games, offset, score.league);
        }
        const baseMenuItem = this._createBaseMenuItem();
        const scrollView = new St.ScrollView({
            width: 295,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            enable_mouse_scrolling: true,
            y_expand: true,
        });
        const box = new St.BoxLayout({ width: 295, y_expand: true });
        box.add_child(compactWidget);
        scrollView.add_child(box);
        baseMenuItem.add_child(scrollView);
        menus.unshift(baseMenuItem);
    }
    /**
     * Adds placeholder for next games when none are available
     */
    _addNextGamesPlaceholder(menus) {
        if (!this._client?.isShowNextGamesEnabled?.())
            return;
        const submenu = new PopupMenu.PopupSubMenuMenuItem("Next Games");
        this._disableHoverTracking(submenu);
        submenu.add_style_class_name("scoreBoardPanel");
        submenu.connect("activate", () => {
            const isOpen = submenu.menu?.isOpen || false;
            submenu.setSubmenuShown(!isOpen);
            return true;
        });
        const baseMenuItem = this._createBaseMenuItem();
        const placeholderText = this._nextGamesMissingApiKey
            ? "No upcoming games — missing SPORT_RADAR_KEY (.env). Open extension prefs to add it."
            : "No upcoming games";
        const placeholder = new St.Label({
            text: placeholderText,
            y_align: Clutter.ActorAlign.CENTER,
        });
        baseMenuItem.add_child(placeholder);
        submenu.menu.addMenuItem(baseMenuItem);
        menus.push(submenu);
    }
    /**
     * Adds the flattened chronological games list to the menu
     */
    _addGamesList(menus, allGames) {
        const groupBox = new St.BoxLayout({
            style_class: "scoreboard",
            vertical: true,
            can_focus: false,
            track_hover: false,
            reactive: false,
        });
        const accentColor = getAccentColor();
        let currentDay = null;
        for (const game of allGames) {
            const day = new Date(game.timestamp).toDateString();
            if (currentDay !== day) {
                this._addDateHeader(groupBox, game.timestamp);
                currentDay = day;
            }
            this._addGameRows(groupBox, game, accentColor);
            this._addDivider(groupBox);
        }
        groupBox.set_width(295);
        const baseMenuItem = this._createBaseMenuItem();
        baseMenuItem.add_child(groupBox);
        menus.push(baseMenuItem);
    }
    /**
     * Adds a date header to the games list
     */
    _addDateHeader(container, timestamp) {
        const dateLabel = new St.Label({
            text: new Date(timestamp).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
            }),
            style_class: "date-header",
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        const dateBox = new St.BoxLayout({
            vertical: false,
            style_class: "date-box",
        });
        dateBox.set_width(295);
        dateBox.add_child(dateLabel);
        container.add_child(dateBox);
    }
    /**
     * Adds home and away rows for a game
     */
    _addGameRows(container, game, accentColor) {
        const homeRow = this._createTeamRow(game.home.team, game.home.score, game.meta, game._homeFollowed || false, game.home.isWinner, game.home.isLoser, accentColor);
        container.add_child(homeRow);
        const awayRow = this._createTeamRow(game.away.team, game.away.score, game.link, game._awayFollowed || false, game.away.isWinner, game.away.isLoser, accentColor, true);
        container.add_child(awayRow);
    }
    /**
     * Creates a team row with labels and optional link
     */
    _createTeamRow(teamName, score, metaOrLink, isFollowed, isWinner, isLoser, accentColor, isAwayRow = false) {
        const row = new St.BoxLayout({
            vertical: false,
            style_class: "score-row",
        });
        const suffix = isWinner ? "--winner" : isLoser ? "--loser" : "";
        const teamLabel = new St.Label({
            text: teamName,
            style_class: `team${suffix}${isFollowed ? " team--followed" : ""}`,
            y_align: Clutter.ActorAlign.CENTER,
        });
        if (isFollowed && accentColor) {
            try {
                teamLabel.set_style(`color: ${accentColor}; font-weight: 800;`);
            }
            catch (error) {
                logErr(error, "Failed to set style for team label");
            }
        }
        const scoreLabel = new St.Label({
            text: score,
            style_class: `score${suffix}`,
            y_align: Clutter.ActorAlign.CENTER,
        });
        row.add_child(teamLabel);
        row.add_child(scoreLabel);
        if (isAwayRow && metaOrLink) {
            row.add_child(new GameLink(metaOrLink));
        }
        else {
            row.add_child(new St.Label({
                text: metaOrLink || "",
                style_class: "meta",
                y_align: Clutter.ActorAlign.CENTER,
            }));
        }
        return row;
    }
    /**
     * Adds a divider between games
     */
    _addDivider(container) {
        const div = new St.Label({ text: "", style_class: "divider" });
        const divBox = new St.BoxLayout({
            vertical: false,
            style_class: "divider-box",
        });
        divBox.add_child(div);
        container.add_child(divBox);
    }
    /**
     * Creates a base menu item with hover disabled
     */
    _createBaseMenuItem() {
        const baseMenuItem = new PopupMenu.PopupBaseMenuItem({
            hover: false,
            activate: false,
        });
        this._disableHoverTracking(baseMenuItem);
        return baseMenuItem;
    }
    /**
     * Disables hover tracking for a menu item
     */
    _disableHoverTracking(item) {
        try {
            if (item?.actor) {
                item.actor.track_hover = false;
            }
        }
        catch (error) {
            logErr(error, "Failed to disable hover tracking");
        }
    }
    /**
     * Opens the team selector dialog
     */
    _openTeamSelector() {
        try {
            const dialog = new TeamSelectorDialog(this._settings);
            dialog.open();
        }
        catch (error) {
            logErr(error, "Failed to open team selector");
        }
    }
    /**
     * Gets the update interval in seconds
     */
    _getUpdateSec() {
        return (this._settings.get_int(CONSTANTS.PREF_UPDATE_FREQ) || 5) * 60;
    }
    /**
     * Checks if compact mode is enabled
     */
    _isCompactMode() {
        return this._settings.get_boolean(CONSTANTS.PREF_COMPACT_MODE);
    }
    /**
     * Updates the menu by loading data and recreating menu items
     */
    async _update() {
        await this._loadData();
        const menus = this._createMenu();
        this.menu.removeAll();
        for (const menu of menus) {
            this.menu.addMenuItem(menu);
        }
        this._setTopBarText();
    }
    /**
     * Loads scores and next games data from the repository
     */
    async _loadData() {
        this._scores = await this._repository.loadScores();
        if (this._client.isShowNextGamesEnabled()) {
            try {
                this._nextGames = await this._repository.loadNextGames();
            }
            catch (e) {
                logErr(e, "Failed to load next games from repository");
                this._nextGames = await this._client.getNextGames();
            }
        }
        else {
            this._nextGames = [];
        }
    }
    /**
     * Sets the text in the top bar based on current games
     */
    _setTopBarText() {
        const stats = this._calculateGameStats();
        let labelText = this._determineTopBarLabel(stats);
        if (labelText === "") {
            this._icon.show();
            this._panelBoxLayout.show();
            this.show();
        }
        else {
            this._icon.hide();
            this._panelBoxLayout.show();
            this.show();
        }
        this._menuText.set_text(labelText);
        this._logTopBarState(labelText, stats);
    }
    /**
     * Calculates statistics about current games
     */
    _calculateGameStats() {
        let remainingGames = 0;
        let liveGames = 0;
        let totalGames = 0;
        let following = 0;
        let followingText = "";
        for (const score of this._scores) {
            totalGames += score.games.length;
            remainingGames += score.games.filter((g) => !g.isComplete).length;
            liveGames += score.games.filter((g) => g.live).length;
            for (const followTeam of score.following || []) {
                if (following < 2) {
                    followingText += followTeam + " ";
                }
                following += 1;
            }
        }
        let totalNextGames = 0;
        for (const nextGame of this._nextGames) {
            totalNextGames += nextGame.games.length;
        }
        return {
            totalGames,
            remainingGames,
            liveGames,
            totalNextGames,
            following,
            followingText,
        };
    }
    /**
     * Determines the appropriate label text for the top bar
     */
    _determineTopBarLabel(stats) {
        let labelText = this._getLiveGameLabel();
        if (labelText !== "") {
            return labelText;
        }
        if (stats.totalGames === 0 && stats.totalNextGames === 0) {
            return "";
        }
        if (stats.remainingGames === 0 && stats.totalNextGames === 0) {
            return "";
        }
        if (stats.liveGames === 0 && stats.remainingGames > 0) {
            return String(stats.remainingGames);
        }
        if (stats.liveGames > 0) {
            return `${stats.liveGames} / ${stats.remainingGames}`;
        }
        return "";
    }
    /**
     * Gets label for live games without scores
     */
    _getLiveGameLabel() {
        for (const score of this._scores) {
            for (const game of score.games) {
                if (game.live && !game.home.score && !game.away.score) {
                    return `${game.home.team}-${game.away.team}`;
                }
            }
        }
        return "";
    }
    /**
     * Logs the current top bar state for debugging
     */
    _logTopBarState(labelText, stats) {
        logInfo(`_setTopBarText called. labelText: ${labelText}, totalGames: ${stats.totalGames}, totalNextGames: ${stats.totalNextGames}`, "panel_menu");
        logInfo(`Icon visibility: ${this._icon.visible}, PanelBox visibility: ${this._panelBoxLayout.visible}`, "panel_menu");
        logInfo(`MenuText content: '${this._menuText.text}'`, "panel_menu");
    }
    /**
     * Cleanup when the extension is disabled
     */
    destroy() {
        if (this._client && this._client.session && typeof this._client.session.abort === "function") {
            this._client.session.abort();
        }
        if (this._timeout) {
            GLib.source_remove(this._timeout);
            this._timeout = null;
            this.menu.removeAll();
        }
        super.destroy();
    }
});
