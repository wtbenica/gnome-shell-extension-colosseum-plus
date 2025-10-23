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

const EXT_PATH = import.meta.url;

export const Colosseum = GObject.registerClass(
  { GTypeName: "Colosseum" },
  class Colosseum extends PanelMenu.Button {
    _init() {
      super._init(0.0, "colosseum", false);

      this._scores = [];
      this._nextGames = [];
      this._timeout = null;
      this._settings = null;

      // Make the panel box non-reactive so the top-bar doesn't light up on hover
      this._panelBoxLayout = new St.BoxLayout({ reactive: false, track_hover: false });

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

    setSettings(settings) {
      this._settings = settings;
      this._settings.connect(
        "changed::" + CONSTANTS.PREF_POSITION_TOPBAR,
        this._updatePositionInPanel.bind(this),
      );
      this._settings.connect(
        "changed::" + CONSTANTS.PREF_FOLLOWED_ONLY,
        this._update.bind(this),
      );
      this._settings.connect(
        "changed::" + CONSTANTS.PREF_COMPACT_MODE,
        this._update.bind(this),
      );
      this._settings.connect(
        "changed::" + CONSTANTS.PREF_SHOW_NEXT_GAMES,
        this._update.bind(this),
      );

      this._client = new ColosseumClient(CONSTANTS, this._settings);
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

        let homeLabel = new St.Label({
          text: games[j].home.team,
          style_class: "team" + homeSuffix,
          y_expand: true,
          y_align: Clutter.ActorAlign.CENTER,
        });

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

        let awayLabel = new St.Label({
          text: games[j].away.team,
          style_class: "team" + awaySuffix,
          y_expand: true,
          y_align: Clutter.ActorAlign.CENTER,
        });

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
        console.log('Colosseum: Opening team selector dialog...');
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
        const followedIds = this._client.getFollowedTeams(leagueName);
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
          submenu.add_style_class_name("scoreBoardPanel");
          submenu.connect('activate', (submenu) => {
            submenu.setSubmenuShown(!submenu.submenuShown);
            return true;
          });

          let baseMenuItem = new PopupMenu.PopupBaseMenuItem({
            hover: false,
            activate: false,
          });

          let placeholder = new St.Label({
            text: "No upcoming games",
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
      baseMenuItem.add_child(groupBox);
      menus.push(baseMenuItem);

      return menus;
    }

    _openTeamSelector() {
      try {
        console.log('Colosseum: Creating team selector dialog...');
        const dialog = new TeamSelectorDialog(this._settings, CONSTANTS);
        dialog.open();
        console.log('Colosseum: Team selector dialog opened');
      } catch (error) {
        console.error('Colosseum: Failed to open team selector:', error);
      }
    }

    _getUpdateSec() {
      return (this._settings.get_int(CONSTANTS.PREF_UPDATE_FREQ) || 5) * 60;
    }

    _isCompactMode() {
      return this._settings.get_boolean(CONSTANTS.PREF_COMPACT_MODE);
    }

    async _update() {
      console.log('Colosseum: Starting _update...');
      await this._loadData();
      console.log('Colosseum: Data loaded, creating menu...');
      let menus = this._createMenu();
      console.log('Colosseum: Menu created with', menus.length, 'items');
      this.menu.removeAll();

      for (let i = 0; i < menus.length; i++) {
        this.menu.addMenuItem(menus[i]);
      }

      console.log('Colosseum: Setting top bar text...');
      this._setTopBarText();
      console.log('Colosseum: Top bar text set');

      if (this._timeout) {
        GLib.source_remove(this._timeout);
        this._timeout = null;
      }

      this._timeout = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        this._getUpdateSec(),
        this._update.bind(this),
      );
      console.log('Colosseum: Update complete, next update in', this._getUpdateSec(), 'seconds');
    }

    async _loadData() {
      console.log('Colosseum: Loading scores...');
      this._scores = await this._client.getScores();
      console.log('Colosseum: Scores loaded:', this._scores.length, 'leagues');
      if (this._client.isShowNextGamesEnabled()) {
        console.log('Colosseum: Loading next games...');
        this._nextGames = await this._client.getNextGames();
        console.log('Colosseum: Next games loaded:', this._nextGames.length, 'leagues');
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
      this._client.session.abort();

      if (this._timeout) {
        GLib.source_remove(this._timeout);
        this._timeout = undefined;

        this.menu.removeAll();
      }

      super.destroy();
    }
  },
);
