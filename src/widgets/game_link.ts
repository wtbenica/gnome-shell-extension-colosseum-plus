import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GObject from "gi://GObject";
import Meta from "gi://Meta";
import St from "gi://St";

import * as Config from "resource:///org/gnome/shell/misc/config.js";

/**
 * A clickable label widget that opens a URL when clicked.
 * Changes cursor to pointer on hover and handles click events.
 */
export const GameLink = GObject.registerClass(
  class GameLink extends St.Label {
    private _url: string | null;
    private _cursorChanged: boolean;

    /**
     * Creates a new GameLink
     * 
     * @param url - The URL to open when clicked
     */
    constructor(url?: string | null) {
      super({ text: "" });
      this._url = url || null;
      this._cursorChanged = false;
    }

    /**
     * Handles button press events
     */
    vfunc_button_press_event(_event: any): boolean {
      if (!this.visible || this.get_paint_opacity() === 0) {
        return Clutter.EVENT_PROPAGATE;
      }
      return true;
    }

    /**
     * Handles button release events (opens the URL)
     */
    vfunc_button_release_event(_event: any): boolean {
      if (!this.visible || this.get_paint_opacity() === 0) {
        return Clutter.EVENT_PROPAGATE;
      }

      if (this._url) {
        Gio.app_info_launch_default_for_uri(
          this._url,
          global.create_app_launch_context(0, -1)
        );
      }

      return Clutter.EVENT_STOP;
    }

    /**
     * Handles mouse motion events (changes cursor)
     */
    vfunc_motion_event(_event: any): boolean {
      if (!this.visible || this.get_paint_opacity() === 0) {
        return Clutter.EVENT_PROPAGATE;
      }

      if (!this._cursorChanged) {
        const cursor = this._getCursorType();
        global.display.set_cursor((Meta.Cursor as any)[cursor]);
        this._cursorChanged = true;
      }

      return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Gets the appropriate cursor type based on GNOME Shell version
     * 
     * @returns The cursor type string
     */
    private _getCursorType(): string {
      const [major] = Config.PACKAGE_VERSION.split(".").map((s: string) => Number(s));
      return major >= 48 ? "POINTER" : "POINTING_HAND";
    }

    /**
     * Handles leave events (resets cursor)
     */
    vfunc_leave_event(event: any): boolean {
      if (!this.visible || this.get_paint_opacity() === 0) {
        return Clutter.EVENT_PROPAGATE;
      }

      if (this._cursorChanged) {
        this._cursorChanged = false;
        global.display.set_cursor(Meta.Cursor.DEFAULT);
      }

      return super.vfunc_leave_event(event);
    }
  }
);

export default GameLink;
