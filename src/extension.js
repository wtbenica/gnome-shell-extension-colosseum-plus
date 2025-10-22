import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import * as CONSTANTS from "./const.js";
import { Colosseum } from "./widgets/colosseum.js";

export default class ColosseumExtension extends Extension {
  enable() {
    this.scores = new Colosseum();
    this.scores.setSettings(
      this.getSettings("org.gnome.shell.extensions.colosseum"),
    );
    this.scores._update().catch(error => {
      console.error('Colosseum extension: Failed to update scores:', error);
    });

    Main.panel.addToStatusArea(
      "colosseum",
      this.scores,
      1,
      this.scores._settings.get_int(CONSTANTS.PREF_POSITION_TOPBAR) == 0
        ? "left"
        : "right",
    );
  }

  disable() {
    this.scores.destroy();
    this.scores = null;
  }
}
