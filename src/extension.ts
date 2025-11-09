import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { getConstants } from "./config/const.js";
import DataLoader from "./data/data_loader.js";
import { logErr } from "./utils/logging.js";
import { ArenaPanelMenu } from "./widgets/panel_menu.js";

import type { ArenaConstants } from "./config/types.js";

export default class ArenaExtension extends Extension {
  panelMenu: InstanceType<typeof ArenaPanelMenu> | null = null;

  async enable(): Promise<void> {
    // Check if we should update data (only on Mondays if cache is stale)
    try {
      await this.checkForDataUpdates();
    } catch (error) {
      logErr(error, 'Arena extension: Failed to check data updates');
    }

    // Load dynamic constants first
    let constants: ArenaConstants;
    try {
      constants = await getConstants();
    } catch (error) {
      logErr(error, 'Arena extension: Failed to load dynamic constants');
      // Create fallback with minimal required fields
      constants = {
        PREF_UPDATE_FREQ: "update-frequency",
        PREF_FOLLOWED_ONLY: "followed-only",
        PREF_COMPACT_MODE: "compact-mode",
        PREF_POSITION_TOPBAR: "position-in-topbar",
        PREF_SHOW_NEXT_GAMES: "show-next-games",
        PREF_LEAGUES: {},
        PREF_TOURNAMENTS: {},
        DISPLAY_NAME: {},
        SPORTS: {}
      };
    }

    // PanelMenu.Button-derived class expects constructor args for alignment and label
    this.panelMenu = new ArenaPanelMenu(0.0, "arena", false);
    this.panelMenu.setSettings(
      this.getSettings("org.gnome.shell.extensions.arena"),
      constants
    );
    this.panelMenu._update().then(() => {
    }).catch((error: unknown) => {
      logErr(error, 'Arena extension: Failed to update panel menu');
    });

    Main.panel.addToStatusArea(
      "arena",
      this.panelMenu,
      1,
      "right",
    );
  }

  async checkForDataUpdates(): Promise<void> {
    try {
      // This will trigger cache loading and potential API calls
      await DataLoader.fetchCompetitions();
    } catch (error) {
      logErr(error, 'Colosseum extension: Failed to check for data updates');
      logErr(error, 'Colosseum extension: Error stack');
    }
  }

  disable(): void {
    if (this.panelMenu) {
      this.panelMenu.destroy();
      this.panelMenu = null;
    }
  }
}
