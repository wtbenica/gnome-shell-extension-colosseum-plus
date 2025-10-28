import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import GLib from 'gi://GLib';

import { getConstants } from "./config/const.js";
import type { ColosseumConstants } from "./api/colosseum_client.js";
import { Colosseum } from "./widgets/panel_menu.js";
import DataLoader from "./data/data_loader.js";
import { logErr } from "./utils/logging.js";

// Ensure log directory exists
const LOG_DIR = GLib.build_filenamev([GLib.get_user_cache_dir(), 'colosseum-extension', 'logs']);
GLib.mkdir_with_parents(LOG_DIR, 0o755);

export default class ColosseumExtension extends Extension {
  scores: InstanceType<typeof Colosseum> | null = null;

  async enable(): Promise<void> {
    // Check if we should update data (only on Mondays if cache is stale)
    try {
      await this.checkForDataUpdates();
    } catch (error) {
      logErr(error, 'Colosseum extension: Failed to check data updates');
    }

    // Load dynamic constants first
    let constants: Record<string, unknown> | {};
    try {
      constants = await getConstants();
    } catch (error) {
      logErr(error, 'Colosseum extension: Failed to load dynamic constants');
      constants = {}; // fallback
    }

  // PanelMenu.Button-derived class expects constructor args for alignment and label
  this.scores = new Colosseum(0.0, "colosseum", false);
    this.scores.setSettings(
      this.getSettings("org.gnome.shell.extensions.colosseum"),
      constants as unknown as ColosseumConstants,
    );
    this.scores._update().then(() => {
    }).catch((error: unknown) => {
      logErr(error, 'Colosseum extension: Failed to update scores');
    });

    Main.panel.addToStatusArea(
      "colosseum",
      this.scores,
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
    if (this.scores) {
      this.scores.destroy();
      this.scores = null;
    }
  }
}
