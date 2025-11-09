import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import Adw from "gi://Adw";

import { PREF_UPDATE_FREQ, PREF_FOLLOWED_ONLY, PREF_COMPACT_MODE, PREF_SHOW_NEXT_GAMES, PREF_POSITION_TOPBAR, PREF_SELECTED_COUNTRY } from "./config/const.js";
import DataLoader from "./data/data_loader.js";
import { logErr } from "./utils/logging.js";

const EXT_PATH = import.meta.url;

interface PreferencesWindow {
  add(widget: Gtk.Widget): void;
}

class Preferences {
  private _builder: Gtk.Builder;
  private _settings: Gio.Settings;
  private _prefsPage: Gtk.Widget;

  constructor(window: PreferencesWindow, settings: Gio.Settings) {
    this._builder = new Gtk.Builder();
    this._settings = settings;

    this._builder.add_from_file(
      EXT_PATH.replace("prefs.js", "ui/prefs.ui").replace("file://", ""),
    );

    this._prefsPage = this._builder.get_object("preferences_page") as Gtk.Widget;
    window.add(this._prefsPage);

    this._bootstrap();
  }

  _bootstrap(): void {
    // Populate country selector
    this._populateCountrySelector();

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

  async _populateCountrySelector(): Promise<void> {
    const countryRow = this._builder.get_object("prefs_country_selector") as Adw.ComboRow;
    
    try {
      // Create string list model for countries
      const stringList = new Gtk.StringList();
      
      // Add "All Countries" option
      stringList.append("All Countries");
      
      // Fetch countries from backend
      const countries = await DataLoader.fetchCountries();
      
      // Add each country
      for (const country of countries) {
        stringList.append(`${country.name} (${country.competitionCount || 0})`);
      }
      
      countryRow.set_model(stringList);
      
      // Get current selected country from settings
      const selectedCountry = this._settings.get_string(PREF_SELECTED_COUNTRY);
      
      // Find and set the selected index
      if (selectedCountry) {
        const selectedCountryObj = countries.find(c => c.id === selectedCountry);
        if (selectedCountryObj) {
          const index = countries.indexOf(selectedCountryObj) + 1; // +1 for "All Countries"
          countryRow.set_selected(index);
        } else {
          countryRow.set_selected(0); // "All Countries"
        }
      } else {
        countryRow.set_selected(0); // "All Countries"
      }
      
      // Handle country selection changes
      countryRow.connect('notify::selected', () => {
        const selected = countryRow.get_selected();
        if (selected === 0) {
          // "All Countries" selected
          this._settings.set_string(PREF_SELECTED_COUNTRY, '');
        } else {
          // Specific country selected (subtract 1 for "All Countries" offset)
          const country = countries[selected - 1];
          if (country) {
            this._settings.set_string(PREF_SELECTED_COUNTRY, country.id);
          }
        }
      });
      
    } catch (error) {
      logErr(error, 'Failed to populate country selector');
      // Show error in UI
      const stringList = new Gtk.StringList();
      stringList.append("Error loading countries");
      countryRow.set_model(stringList);
      countryRow.set_selected(0);
    }
  }
}

export default class ArenaPreferences extends ExtensionPreferences {
  async fillPreferencesWindow(window: PreferencesWindow): Promise<void> {
    // Preferences constructor performs synchronous UI setup
    new Preferences(
      window,
      this.getSettings("org.gnome.shell.extensions.arena"),
    );
  }
}
