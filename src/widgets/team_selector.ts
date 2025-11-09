import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import St from "gi://St";
import Gio from "gi://Gio";
import * as ModalDialog from "resource:///org/gnome/shell/ui/modalDialog.js";

import { logErr } from "../utils/logging.js";
import DataLoader from "../data/data_loader.js";
import type { Competition, Competitor } from "../api/types.js";
import type { Country } from "../api/firebase_backend_client.js";

type CompetitorWithLeague = Competitor & { leagueName?: string };

/**
 * Selection view state
 */
enum ViewState {
  COUNTRIES,
  COMPETITIONS,
  TEAMS
}

export const TeamSelectorDialog = GObject.registerClass(
  class TeamSelectorDialog extends ModalDialog.ModalDialog {
    private _settings: Gio.Settings;
    private _contentBox: St.BoxLayout;
    private _titleLabel: St.Label;
    private _backButton: St.Button | null = null;
    private _viewState: ViewState = ViewState.COUNTRIES;
    private _selectedCountry: Country | null = null;
    private _selectedCompetition: Competition | null = null;
    private _batchIndex!: number;
    private _allTeams!: CompetitorWithLeague[];
    private _followedCache!: Set<string>;

    constructor(settings: Gio.Settings) {
      super({ styleClass: 'team-selector-dialog' });

      this._settings = settings;

      // Title bar with back button
      const titleBox = new St.BoxLayout({ 
        style_class: 'team-selector-title-box',
        x_expand: true 
      });

      this._backButton = new St.Button({
        label: '← Back',
        style_class: 'team-selector-back-button',
        visible: false,
        x_align: Clutter.ActorAlign.START,
      });
      this._backButton.connect('clicked', () => this._goBack());
      titleBox.add_child(this._backButton);

      this._titleLabel = new St.Label({
        text: 'Select Country',
        style_class: 'team-selector-title',
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
      });
      titleBox.add_child(this._titleLabel);

      // Empty spacer to balance the back button
      const spacer = new St.Label({ text: '', x_align: Clutter.ActorAlign.END });
      titleBox.add_child(spacer);

      this.contentLayout.add_child(titleBox);

      // Scrollable content area
      let scrollView = new St.ScrollView({
        style_class: 'team-selector-scroll',
        x_expand: true,
        y_expand: true,
        overlay_scrollbars: true,
      });

      this._contentBox = new St.BoxLayout({
        style_class: 'team-selector-content',
        vertical: true,
      });

      scrollView.add_child(this._contentBox);
      this.contentLayout.add_child(scrollView);

      // Close button
      this.setButtons([
        {
          label: 'Close',
          action: () => {
            this.close();
          },
          key: Clutter.KEY_Escape,
        },
      ]);

      // Start with country selection
      this._showCountries();
    }

    private _goBack(): void {
      if (this._viewState === ViewState.TEAMS) {
        this._showCompetitions(this._selectedCountry!);
      } else if (this._viewState === ViewState.COMPETITIONS) {
        this._showCountries();
      }
    }

    private async _showCountries(): Promise<void> {
      this._viewState = ViewState.COUNTRIES;
      this._titleLabel.set_text('Select Country');
      if (this._backButton) {
        this._backButton.visible = false;
      }
      this._contentBox.destroy_all_children();

      try {
        const countries = await DataLoader.fetchCountries();
        
        if (!countries || countries.length === 0) {
          const noCountriesLabel = new St.Label({
            text: 'No countries available. Please check your connection.',
            style_class: 'no-teams-label',
          });
          this._contentBox.add_child(noCountriesLabel);
          return;
        }

        // Sort countries by name
        countries.sort((a, b) => a.name.localeCompare(b.name));

        for (const country of countries) {
          const countryBox = new St.BoxLayout({ 
            style_class: 'team-selector-country-row',
            reactive: true,
            track_hover: true,
          });

          const countryLabel = new St.Label({ 
            text: `${country.name}${country.competitionCount ? ` (${country.competitionCount})` : ''}`,
            style_class: 'team-selector-country-label',
            x_expand: true,
          });

          const arrowLabel = new St.Label({
            text: '→',
            style_class: 'team-selector-arrow',
          });

          countryBox.add_child(countryLabel);
          countryBox.add_child(arrowLabel);

          const button = new St.Button({ 
            child: countryBox,
            style_class: 'team-selector-item-button',
            x_expand: true,
          });

          button.connect('clicked', () => {
            this._selectedCountry = country;
            this._showCompetitions(country);
          });

          this._contentBox.add_child(button);
        }
      } catch (error) {
        logErr(error, 'TeamSelector: Failed to load countries');
        const errorLabel = new St.Label({
          text: 'Error loading countries: ' + (error as Error).message,
          style_class: 'no-teams-label',
        });
        this._contentBox.add_child(errorLabel);
      }
    }

    private async _showCompetitions(country: Country): Promise<void> {
      this._viewState = ViewState.COMPETITIONS;
      this._titleLabel.set_text(`${country.name} - Select Competition`);
      if (this._backButton) {
        this._backButton.visible = true;
      }
      this._contentBox.destroy_all_children();

      try {
        const competitions = await DataLoader.fetchCompetitions(country.id);
        
        if (!competitions || competitions.length === 0) {
          const noCompetitionsLabel = new St.Label({
            text: 'No competitions available for this country.',
            style_class: 'no-teams-label',
          });
          this._contentBox.add_child(noCompetitionsLabel);
          return;
        }

        // Sort competitions by name
        competitions.sort((a, b) => a.name.localeCompare(b.name));

        for (const competition of competitions) {
          const competitionBox = new St.BoxLayout({ 
            style_class: 'team-selector-competition-row',
            reactive: true,
            track_hover: true,
          });

          const competitionLabel = new St.Label({ 
            text: competition.name,
            style_class: 'team-selector-competition-label',
            x_expand: true,
          });

          const arrowLabel = new St.Label({
            text: '→',
            style_class: 'team-selector-arrow',
          });

          competitionBox.add_child(competitionLabel);
          competitionBox.add_child(arrowLabel);

          const button = new St.Button({ 
            child: competitionBox,
            style_class: 'team-selector-item-button',
            x_expand: true,
          });

          button.connect('clicked', () => {
            this._selectedCompetition = competition;
            this._showTeams(competition);
          });

          this._contentBox.add_child(button);
        }
      } catch (error) {
        logErr(error, 'TeamSelector: Failed to load competitions');
        const errorLabel = new St.Label({
          text: 'Error loading competitions: ' + (error as Error).message,
          style_class: 'no-teams-label',
        });
        this._contentBox.add_child(errorLabel);
      }
    }

  async _showTeams(competition: Competition): Promise<void> {
      this._viewState = ViewState.TEAMS;
      this._titleLabel.set_text(`${competition.name} - Select Teams`);
      if (this._backButton) {
        this._backButton.visible = true;
      }
      this._contentBox.destroy_all_children();

      try {
        const loadingLabel = new St.Label({
          text: 'Loading teams...',
          style_class: 'team-selector-loading',
        });
        this._contentBox.add_child(loadingLabel);

        const teams = await DataLoader.fetchCompetitionInfo(competition.id);
        
        this._contentBox.remove_child(loadingLabel);

        if (!teams || teams.length === 0) {
          const noTeamsLabel = new St.Label({
            text: 'No teams available for this competition.',
            style_class: 'no-teams-label',
          });
          this._contentBox.add_child(noTeamsLabel);
          return;
        }

        // Sort teams by name
        teams.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        // Get followed teams
        const followed = this._settings.get_strv('followed-teams');
        this._followedCache = new Set(followed);

        // Get accent color
        let accentColor = '#ffd966';
        try {
          const ifaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
          const ac = ifaceSettings.get_string('accent-color');
          if (ac) accentColor = ac;
        } catch (e) {
          logErr(e, 'TeamSelector: Failed to get accent color from system settings');
        }

        // Render teams with batching for performance
        this._renderTeamsBatched(teams, accentColor);

      } catch (error) {
        logErr(error, 'TeamSelector: Failed to load teams');
        this._contentBox.destroy_all_children();
        const errorLabel = new St.Label({
          text: 'Error loading teams: ' + (error as Error).message,
          style_class: 'no-teams-label',
        });
        this._contentBox.add_child(errorLabel);
      }
    }

    private _renderTeamsBatched(teams: Competitor[], accentColor: string): void {
      this._allTeams = teams as CompetitorWithLeague[];
      this._batchIndex = 0;
      const batchSize = 20;

      const processBatch = () => {
        let processed = 0;
        while (this._batchIndex < this._allTeams.length && processed < batchSize) {
          const team = this._allTeams[this._batchIndex];
          const teamId = String(team.id);
          const isFollowed = this._followedCache.has(teamId);

          const teamBox = new St.BoxLayout({ 
            style_class: 'team-selector-team-row',
            vertical: false,
          });

          const teamLabel = new St.Label({ 
            text: team.name,
            style_class: 'team-selector-team-label',
            x_expand: true,
          });

          if (isFollowed) {
            teamLabel.add_style_class_name('team--followed');
            if (accentColor) {
              try {
                teamLabel.set_style(`color: ${accentColor}; font-weight: 800;`);
              } catch (e) {
                logErr(e, 'Failed to set style for teamLabel');
              }
            }
            try {
              teamBox.add_style_class_name('team--followed');
            } catch (e) {
              logErr(e, 'Failed to add style class to teamBox');
            }
          }

          const teamSwitch = new St.Button({
            style_class: isFollowed ? 'team-selector-switch team-selector-switch-active' : 'team-selector-switch',
            label: isFollowed ? '✓' : '',
            x_align: Clutter.ActorAlign.END,
          });

          teamSwitch.connect('clicked', () => {
            let currentFollowed = this._settings.get_strv('followed-teams');
            const index = currentFollowed.indexOf(teamId);
            if (index >= 0) {
              // Unfollow
              currentFollowed.splice(index, 1);
              teamSwitch.remove_style_class_name('team-selector-switch-active');
              teamSwitch.set_label('');
              this._followedCache.delete(teamId);
              teamLabel.remove_style_class_name('team--followed');
              try { teamLabel.set_style(''); } catch (e) { logErr(e, 'Failed to reset style for teamLabel'); }
              try { teamBox.remove_style_class_name('team--followed'); } catch (e) { logErr(e, 'Failed to remove style class from teamBox'); }
            } else {
              // Follow
              currentFollowed.push(teamId);
              teamSwitch.add_style_class_name('team-selector-switch-active');
              teamSwitch.set_label('✓');
              this._followedCache.add(teamId);
              teamLabel.add_style_class_name('team--followed');
              try {
                if (accentColor) teamLabel.set_style(`color: ${accentColor}; font-weight: 800;`);
              } catch (e) { logErr(e, 'Failed to set style for teamLabel'); }
              try { teamBox.add_style_class_name('team--followed'); } catch (e) { logErr(e, 'Failed to add style class to teamBox'); }
            }
            this._settings.set_strv('followed-teams', currentFollowed);
          });

          teamBox.add_child(teamLabel);
          teamBox.add_child(teamSwitch);
          this._contentBox.add_child(teamBox);

          this._batchIndex++;
          processed++;
        }

        if (this._batchIndex < this._allTeams.length) {
          GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 10, () => {
            processBatch();
            return GLib.SOURCE_REMOVE;
          });
        }
      };

      // Start first batch
      GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 10, () => {
        processBatch();
        return GLib.SOURCE_REMOVE;
      });
    }
  }
);

export default TeamSelectorDialog;
