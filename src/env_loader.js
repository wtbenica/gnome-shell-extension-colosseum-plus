import GLib from "gi://GLib";
import Gio from "gi://Gio";

import { gjsLogger } from "./logger_gjs.js";

/**
 * Load environment variables from .env file
 */
export function loadEnv() {
  // Try to load from extension directory first
  const extensionPath = GLib.get_home_dir() + '/.local/share/gnome-shell/extensions/colosseum@sereneblue';
  let envFile = Gio.File.new_for_path(extensionPath + '/.env');

  // If not found, try current directory (for development)
  if (!envFile.query_exists(null)) {
    envFile = Gio.File.new_for_path('.env');
  }

  if (!envFile.query_exists(null)) {
    gjsLogger.log('EnvLoader: No .env file found. API key will not be available.');
    return {};
  }

  try {
    const [success, contents] = envFile.load_contents(null);
    if (!success) {
      gjsLogger.log('EnvLoader: Failed to read .env file contents');
      return {};
    }
    
    const text = new TextDecoder().decode(contents);
    const env = {};
    
    text.split('\n').forEach(line => {
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
    
    gjsLogger.log('EnvLoader: Environment loaded successfully');
    return env;
  } catch (error) {
    gjsLogger.logError(error, 'EnvLoader: Failed to load .env file');
    return {};
  }
}
