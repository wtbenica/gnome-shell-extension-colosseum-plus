import Gio from 'gi://Gio?version=2.0';
import { logInfo } from '../utils/logging.js';
import { CACHE } from '../config/constants.js';
import { ErrorHandler, ErrorSeverity } from '../utils/error_handler.js';

export enum CacheType {
  API = 'api',
  LOCAL = 'local'
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheMetadata {
  lastCleanup: number;
  entryCount: number;
}

/**
 * Unified cache manager supporting both API and local data caching.
 * Uses GSettings for local cache and file system for API cache.
 * Provides automatic expiration and cleanup.
 */
export class CacheManager {
  private settings: Gio.Settings | null = null;
  private apiCacheDir: Gio.File | null = null;
  private metadata: Map<CacheType, CacheMetadata> = new Map();

  constructor(
    private schemaId: string,
    private apiCachePath?: string
  ) {
    this.initializeCache();
  }

  private initializeCache(): void {
    // Initialize GSettings for local cache
    ErrorHandler.handleSync(
      () => {
        const schemaSource = Gio.SettingsSchemaSource.get_default();
        if (schemaSource?.lookup(this.schemaId, true)) {
          this.settings = new Gio.Settings({ schema_id: this.schemaId });
        }
      },
      'CacheManager.initializeSettings',
      undefined,
      ErrorSeverity.WARNING
    );

    // Initialize API cache directory
    if (this.apiCachePath) {
      ErrorHandler.handleSync(
        () => {
          this.apiCacheDir = Gio.File.new_for_path(this.apiCachePath!);
          if (!this.apiCacheDir.query_exists(null)) {
            this.apiCacheDir.make_directory_with_parents(null);
          }
        },
        'CacheManager.initializeCacheDir',
        undefined,
        ErrorSeverity.WARNING
      );
    }

    // Initialize metadata
    this.metadata.set(CacheType.API, { lastCleanup: 0, entryCount: 0 });
    this.metadata.set(CacheType.LOCAL, { lastCleanup: 0, entryCount: 0 });
  }

  /**
   * Get data from cache if not expired
   */
  get<T>(key: string, type: CacheType, maxAge: number): T | null {
    const entry = this.getEntry<T>(key, type);
    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > maxAge) {
      this.delete(key, type);
      return null;
    }

    return entry.data;
  }

  /**
   * Store data in cache with current timestamp
   */
  set<T>(key: string, data: T, type: CacheType): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now()
    };

    if (type === CacheType.LOCAL && this.settings) {
      ErrorHandler.handleSync(
        () => {
          this.settings!.set_string(key, JSON.stringify(entry));
        },
        `CacheManager.set.local.${key}`,
        undefined,
        ErrorSeverity.WARNING
      );
    } else if (type === CacheType.API && this.apiCacheDir) {
      ErrorHandler.handleSync(
        () => {
          const file = this.apiCacheDir!.get_child(`${key}.json`);
          const jsonData = JSON.stringify(entry);
          file.replace_contents(
            jsonData,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null
          );
        },
        `CacheManager.set.api.${key}`,
        undefined,
        ErrorSeverity.WARNING
      );
    }

    // Update metadata
    const meta = this.metadata.get(type);
    if (meta) {
      meta.entryCount++;
    }
  }

  /**
   * Delete a cache entry
   */
  delete(key: string, type: CacheType): void {
    if (type === CacheType.LOCAL && this.settings) {
      ErrorHandler.handleSync(
        () => {
          this.settings!.reset(key);
        },
        `CacheManager.delete.local.${key}`,
        undefined,
        ErrorSeverity.WARNING
      );
    } else if (type === CacheType.API && this.apiCacheDir) {
      ErrorHandler.handleSync(
        () => {
          const file = this.apiCacheDir!.get_child(`${key}.json`);
          if (file.query_exists(null)) {
            file.delete(null);
          }
        },
        `CacheManager.delete.api.${key}`,
        undefined,
        ErrorSeverity.WARNING
      );
    }
  }

  /**
   * Clear all cache entries of a specific type
   */
  clearAll(type: CacheType): void {
    if (type === CacheType.LOCAL && this.settings) {
      ErrorHandler.handleSync(
        () => {
          const keys = this.settings!.list_keys();
          keys.forEach(key => this.settings!.reset(key));
          logInfo(`Cleared ${keys.length} local cache entries`, 'CacheManager');
        },
        'CacheManager.clearAll.local',
        undefined,
        ErrorSeverity.WARNING
      );
    } else if (type === CacheType.API && this.apiCacheDir) {
      ErrorHandler.handleSync(
        () => {
          const enumerator = this.apiCacheDir!.enumerate_children(
            'standard::name',
            Gio.FileQueryInfoFlags.NONE,
            null
          );

          let count = 0;
          let fileInfo: Gio.FileInfo | null;
          while ((fileInfo = enumerator.next_file(null)) !== null) {
            const fileName = fileInfo.get_name();
            if (fileName && fileName.endsWith('.json')) {
              const file = this.apiCacheDir!.get_child(fileName);
              file.delete(null);
              count++;
            }
          }
          enumerator.close(null);
          logInfo(`Cleared ${count} API cache entries`, 'CacheManager');
        },
        'CacheManager.clearAll.api',
        undefined,
        ErrorSeverity.WARNING
      );
    }

    // Reset metadata
    const meta = this.metadata.get(type);
    if (meta) {
      meta.entryCount = 0;
      meta.lastCleanup = Date.now();
    }
  }

  /**
   * Clean expired entries from cache
   */
  cleanExpired(type: CacheType, maxAge: number): void {
    const meta = this.metadata.get(type);
    if (!meta) {
      return;
    }

    // Check if cleanup is needed
    const timeSinceLastCleanup = Date.now() - meta.lastCleanup;
    if (timeSinceLastCleanup < CACHE.CLEANUP_INTERVAL) {
      return;
    }

    if (type === CacheType.LOCAL && this.settings) {
      ErrorHandler.handleSync(
        () => {
          const keys = this.settings!.list_keys();
          let removed = 0;

          keys.forEach(key => {
            const entry = this.getEntry<unknown>(key, CacheType.LOCAL);
            if (entry && Date.now() - entry.timestamp > maxAge) {
              this.settings!.reset(key);
              removed++;
            }
          });

          if (removed > 0) {
            logInfo(`Cleaned ${removed} expired local cache entries`, 'CacheManager');
          }
        },
        'CacheManager.cleanExpired.local',
        undefined,
        ErrorSeverity.WARNING
      );
    } else if (type === CacheType.API && this.apiCacheDir) {
      ErrorHandler.handleSync(
        () => {
          const enumerator = this.apiCacheDir!.enumerate_children(
            'standard::name',
            Gio.FileQueryInfoFlags.NONE,
            null
          );

          let removed = 0;
          let fileInfo: Gio.FileInfo | null;
          while ((fileInfo = enumerator.next_file(null)) !== null) {
            const fileName = fileInfo.get_name();
            if (fileName && fileName.endsWith('.json')) {
              const key = fileName.replace('.json', '');
              const entry = this.getEntry<unknown>(key, CacheType.API);
              if (entry && Date.now() - entry.timestamp > maxAge) {
                const file = this.apiCacheDir!.get_child(fileName);
                file.delete(null);
                removed++;
              }
            }
          }
          enumerator.close(null);

          if (removed > 0) {
            logInfo(`Cleaned ${removed} expired API cache entries`, 'CacheManager');
          }
        },
        'CacheManager.cleanExpired.api',
        undefined,
        ErrorSeverity.WARNING
      );
    }

    meta.lastCleanup = Date.now();
  }

  /**
   * Get cache entry without checking expiration
   */
  private getEntry<T>(key: string, type: CacheType): CacheEntry<T> | null {
    if (type === CacheType.LOCAL && this.settings) {
      return ErrorHandler.handleSync(
        () => {
          const value = this.settings!.get_string(key);
          return value ? (JSON.parse(value) as CacheEntry<T>) : null;
        },
        `CacheManager.getEntry.local.${key}`,
        null,
        ErrorSeverity.WARNING
      ) ?? null;
    } else if (type === CacheType.API && this.apiCacheDir) {
      return ErrorHandler.handleSync(
        () => {
          const file = this.apiCacheDir!.get_child(`${key}.json`);
          if (!file.query_exists(null)) {
            return null;
          }

          const [success, contents] = file.load_contents(null);
          if (!success || !contents) {
            return null;
          }

          const jsonString = new TextDecoder().decode(contents);
          return JSON.parse(jsonString) as CacheEntry<T>;
        },
        `CacheManager.getEntry.api.${key}`,
        null,
        ErrorSeverity.WARNING
      ) ?? null;
    }

    return null;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.settings = null;
    this.apiCacheDir = null;
    this.metadata.clear();
  }
}

export {};
