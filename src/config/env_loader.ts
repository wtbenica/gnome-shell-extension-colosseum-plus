import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { logErr } from "../utils/logging.js";

/**
 * Load environment variables from .env file
 */
export function loadEnv(): Record<string, string> {
  // Try to load from extension directory first
  const extensionPath = GLib.get_home_dir() + '/.local/share/gnome-shell/extensions/colosseum@sereneblue';
  let envFile = Gio.File.new_for_path(extensionPath + '/.env');

  // If not found, try current directory (for development)
  if (!envFile.query_exists(null)) {
    envFile = Gio.File.new_for_path('.env');
  }

  if (!envFile.query_exists(null)) {
    return {};
  }

  try {
    const [success, contents] = envFile.load_contents(null);
    if (!success) {
      return {};
    }
    
    const text = new TextDecoder().decode(contents);
    const env: Record<string, string> = {};

    text.split('\n').forEach((line: string) => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length) {
        let value = valueParts.join('=').trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        env[key.trim()] = value;
      }
    });
    
    return env;
  } catch (error) {
    logErr(error, 'EnvLoader: Failed to load .env file');
    return {};
  }
}
