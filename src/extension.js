import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { getConstants, PREF_POSITION_TOPBAR } from "./config/const.js";
import { Colosseum } from "./widgets/panel_menu.js";
import DataLoader from "./data/data_loader.js";
import { logErr } from "./utils/logging.js";

export default class ColosseumExtension extends Extension {
  async enable() {
    const tEnableStart = Date.now();

    // Check if we should update data (only on Mondays if cache is stale)
    try {
      const tDataUpdateStart = Date.now();
      await this.checkForDataUpdates();
    } catch (error) {
      logErr(error, 'Colosseum extension: Failed to check data updates');
    }

    // Load dynamic constants first
    let constants;
    try {
      const tConstantsStart = Date.now();
      constants = await getConstants();
    } catch (error) {
      logErr(error, 'Colosseum extension: Failed to load dynamic constants');
      constants = {}; // fallback
    }

    this.scores = new Colosseum();
    this.scores.setSettings(
      this.getSettings("org.gnome.shell.extensions.colosseum"),
      constants,
    );
    const tUpdateStart = Date.now();
    this.scores._update().then(() => {
    }).catch(error => {
      logErr(error, 'Colosseum extension: Failed to update scores');
    });

    Main.panel.addToStatusArea(
      "colosseum",
      this.scores,
      1,
      "right",
    );
  }

  async checkForDataUpdates() {
    try {
      // This will trigger cache loading and potential API calls
      const result = await DataLoader.fetchCompetitions();
    } catch (error) {
      logErr(error, 'Colosseum extension: Failed to check for data updates');
      logErr(error, 'Colosseum extension: Error stack');
    }
  }

  disable() {
    this.scores.destroy();
    this.scores = null;
  }
}
