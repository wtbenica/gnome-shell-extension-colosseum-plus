import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import St from "gi://St";
import * as ModalDialog from "resource:///org/gnome/shell/ui/modalDialog.js";

import { gjsLogger } from "../logger_gjs.js";

export const TeamSelectorDialog = GObject.registerClass(
  class TeamSelectorDialog extends ModalDialog.ModalDialog {
    _init(settings) {
      super._init({ styleClass: 'team-selector-dialog' });

      this._settings = settings;

      // Dialog title
      let titleLabel = new St.Label({
        text: 'Select Teams to Follow',
        style_class: 'team-selector-title',
      });
      this.contentLayout.add_child(titleLabel);

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

      // Populate with teams
      this._populateTeamSelector();
    }

    async _populateTeamSelector() {
      try {
        gjsLogger.log('TeamSelector: Starting to populate team selector');
        this._contentBox.destroy_all_children();
        
        // Add search bar
        let searchEntry = new St.Entry({
          style_class: 'team-selector-search',
          hint_text: 'Search country or league...',
          x_expand: true,
        });
        this._contentBox.add_child(searchEntry);

        // Fetch competitions from Sportradar
        const DataLoader = (await import('../data.js')).default;
        gjsLogger.log('TeamSelector: Fetching competitions from DataLoader');
        const competitions = await DataLoader.fetchCompetitions();
        
        if (!competitions || competitions.length === 0) {
          gjsLogger.log('TeamSelector: No competitions available');
          let noLeaguesLabel = new St.Label({
            text: 'No competitions available. Data may still be loading.',
            style_class: 'no-teams-label',
          });
          this._contentBox.add_child(noLeaguesLabel);
          return;
        }

        gjsLogger.log('TeamSelector: Got', competitions.length, 'competitions');

        // Group competitions by country
        let countryMap = {};
        for (const comp of competitions) {
          const country = comp.category?.name || 'Other';
          if (!countryMap[country]) countryMap[country] = [];
          countryMap[country].push(comp);
        }

        gjsLogger.log('TeamSelector: Grouped into', Object.keys(countryMap).length, 'countries');

        // Render countries and competitions
        let countrySections = {};
        for (const country of Object.keys(countryMap).sort()) {
          let countryButton = new St.Button({
            label: `▶ ${country}`,
            style_class: 'team-selector-country-header',
            x_expand: true,
          });
          this._contentBox.add_child(countryButton);

          // Competitions container (initially hidden)
          let compsContainer = new St.BoxLayout({
            style_class: 'team-selector-comps-container',
            vertical: true,
            visible: false,
          });
          
          for (const comp of countryMap[country]) {
            let compBox = new St.BoxLayout({
              style_class: 'team-selector-comp-row',
              vertical: true,
            });
            
            let compButton = new St.Button({
              label: `  ${comp.name}`,
              style_class: 'team-selector-comp-button',
              x_expand: true,
            });
            compBox.add_child(compButton);

            // Teams container (initially hidden)
            let teamsContainer = new St.BoxLayout({
              style_class: 'team-selector-teams-container',
              vertical: true,
              visible: false,
            });
            compBox.add_child(teamsContainer);
            compsContainer.add_child(compBox);

            // Expand competition to show teams
            compButton.connect('clicked', async () => {
              try {
                gjsLogger.log('TeamSelector: Competition clicked:', comp.name, comp.id);
                
                if (teamsContainer.get_children().length === 0) {
                  // Show loading indicator
                  let loadingLabel = new St.Label({
                    text: '  Loading teams...',
                    style_class: 'team-selector-loading',
                  });
                  teamsContainer.add_child(loadingLabel);
                  teamsContainer.set_visible(true);
                  
                  // Fetch teams from Sportradar
                  gjsLogger.log('TeamSelector: Fetching competition info for', comp.id);
                  const info = await DataLoader.fetchCompetitionInfo(comp.id);
                  
                  teamsContainer.destroy_all_children();
                  
                  if (info && info.season && info.season.competitors) {
                    gjsLogger.log('TeamSelector: Got', info.season.competitors.length, 'teams for', comp.name);
                    
                    const teams = info.season.competitors;
                    const followedTeams = this._settings.get_strv('followed-teams');
                    
                    for (const team of teams) {
                      let teamBox = new St.BoxLayout({
                        style_class: 'team-selector-team-row',
                        vertical: false,
                      });
                      
                      let teamLabel = new St.Label({
                        text: `    ${team.name}`,
                        style_class: 'team-selector-team-label',
                        x_expand: true,
                      });
                      
                      const teamId = String(team.id);
                      const isFollowed = followedTeams.includes(teamId);
                      
                      let teamSwitch = new St.Button({
                        style_class: isFollowed
                          ? 'team-selector-switch team-selector-switch-active'
                          : 'team-selector-switch',
                        label: isFollowed ? '✓' : '',
                        x_align: Clutter.ActorAlign.END,
                      });
                      
                      teamSwitch.connect('clicked', () => {
                        let currentFollowed = this._settings.get_strv('followed-teams');
                        const index = currentFollowed.indexOf(teamId);
                        
                        if (index >= 0) {
                          currentFollowed.splice(index, 1);
                          teamSwitch.remove_style_class_name('team-selector-switch-active');
                          teamSwitch.set_label('');
                          gjsLogger.log('TeamSelector: Unfollowed team:', team.name);
                        } else {
                          currentFollowed.push(teamId);
                          teamSwitch.add_style_class_name('team-selector-switch-active');
                          teamSwitch.set_label('✓');
                          gjsLogger.log('TeamSelector: Followed team:', team.name);
                        }
                        
                        this._settings.set_strv('followed-teams', currentFollowed);
                      });
                      
                      teamBox.add_child(teamLabel);
                      teamBox.add_child(teamSwitch);
                      teamsContainer.add_child(teamBox);
                    }
                  } else {
                    gjsLogger.log('TeamSelector: No teams found for competition', comp.id);
                    let errorLabel = new St.Label({
                      text: '  No teams found for this competition.',
                      style_class: 'no-teams-label',
                    });
                    teamsContainer.add_child(errorLabel);
                  }
                } else {
                  // Toggle visibility if already loaded
                  teamsContainer.set_visible(!teamsContainer.get_visible());
                }
              } catch (error) {
                gjsLogger.logError(error, 'TeamSelector: Failed to load teams for competition ' + comp.name);
                teamsContainer.destroy_all_children();
                let errorLabel = new St.Label({
                  text: '  Error loading teams: ' + error.message,
                  style_class: 'no-teams-label',
                });
                teamsContainer.add_child(errorLabel);
                teamsContainer.set_visible(true);
              }
            });
          }
          
          this._contentBox.add_child(compsContainer);
          countrySections[country] = { countryButton, compsContainer };

          // Toggle competitions visibility when country row is clicked
          countryButton.connect('clicked', () => {
            gjsLogger.log('TeamSelector: Country clicked:', country);
            const isVisible = compsContainer.get_visible();
            compsContainer.set_visible(!isVisible);
            countryButton.label = isVisible ? `▶ ${country}` : `▼ ${country}`;
          });
        }

        // Search filter logic
        searchEntry.clutter_text.connect('text-changed', () => {
          const query = searchEntry.get_text().toLowerCase();
          gjsLogger.log('TeamSelector: Search query:', query);
          
          for (const country of Object.keys(countrySections)) {
            const { countryButton, compsContainer } = countrySections[country];
            let matchCountry = country.toLowerCase().includes(query);
            let matchComp = false;
            
            compsContainer.get_children().forEach(compBox => {
              const compButton = compBox.get_children()[0];
              const compName = compButton.label.toLowerCase();
              const visible = compName.includes(query) || matchCountry;
              compBox.set_visible(visible);
              
              if (visible) matchComp = true;
              
              // Collapse teams when searching
              if (compBox.get_children().length > 1) {
                compBox.get_children()[1].set_visible(false);
              }
            });
            
            // Only show country if it or any of its competitions match
            const shouldShow = query === '' || matchCountry || matchComp;
            countryButton.set_visible(shouldShow);
            compsContainer.set_visible(shouldShow && (matchCountry || matchComp));
            
            if (query !== '') {
              countryButton.label = `▶ ${country}`;
            }
          }
        });
        
        gjsLogger.log('TeamSelector: Population complete');
      } catch (error) {
        gjsLogger.logError(error, 'TeamSelector: Failed to populate team selector');
        this._contentBox.destroy_all_children();
        let errorLabel = new St.Label({
          text: 'Error loading teams: ' + error.message,
          style_class: 'no-teams-label',
        });
        this._contentBox.add_child(errorLabel);
      }
    }
  }
);
