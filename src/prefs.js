import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import Gio from "gi://Gio";
import Gtk from "gi://Gtk";

import { PREF_UPDATE_FREQ, PREF_FOLLOWED_ONLY, PREF_COMPACT_MODE, PREF_SHOW_NEXT_GAMES, PREF_POSITION_TOPBAR } from "./config/const.js";

const EXT_PATH = import.meta.url;

class Preferences {
  constructor(window, settings) {
    this._builder = new Gtk.Builder();
    this._settings = settings;

    this._builder.add_from_file(
      EXT_PATH.replace("prefs.js", "ui/prefs.ui").replace("file://", ""),
    );

    this._prefsPage = this._builder.get_object("preferences_page");
    window.add(this._prefsPage);

    this._bootstrap();
  }

  _bootstrap() {
    // Bind basic settings
    this._settings.bind(
      PREF_UPDATE_FREQ,
      this._builder.get_object("prefs_frequency"),
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );
    this._settings.bind(
      PREF_FOLLOWED_ONLY,
      this._builder.get_object("prefs_followed_only"),
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    this._settings.bind(
      PREF_COMPACT_MODE,
      this._builder.get_object("prefs_compact_mode"),
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    this._settings.bind(
      PREF_SHOW_NEXT_GAMES,
      this._builder.get_object("prefs_show_next_games"),
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    this._settings.bind(
      PREF_POSITION_TOPBAR,
      this._builder.get_object("prefs_position_topbar"),
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
  }
}

export default class ColosseumPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    new Preferences(
      window,
      this.getSettings("org.gnome.shell.extensions.colosseum"),
    );
  }
}
