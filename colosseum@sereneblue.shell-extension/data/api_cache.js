import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { logErr, logInfo } from '../utils/logging.js';
const CACHE_VERSION = 1;
const CACHE_DIR = GLib.build_filenamev([GLib.get_user_cache_dir(), 'colosseum-extension']);
const MAX_CACHE_AGE_DAYS = 7; // Competition/season metadata
/**
 * Persistent file-based cache for API responses.
 * Reduces API calls by caching competition metadata ([MAX_CACHE_AGE_DAYS] days)
 */
export class ApiCache {
    constructor() {
        this._ensureCacheDir();
    }
    _ensureCacheDir() {
        const dir = Gio.File.new_for_path(CACHE_DIR);
        if (!dir.query_exists(null)) {
            try {
                dir.make_directory_with_parents(null);
                logInfo('Created cache directory', 'ApiCache');
            }
            catch (e) {
                logErr(e, 'Failed to create cache directory');
            }
        }
    }
    _getCacheKey(endpoint, params) {
        const paramStr = JSON.stringify(params || {});
        return `${endpoint}_${GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, paramStr, -1)}`;
    }
    _getCacheFile(key) {
        return Gio.File.new_for_path(GLib.build_filenamev([CACHE_DIR, `${key}.json`]));
    }
    /**
     * Get cached data if available and not expired
     * @param {string} endpoint - API endpoint identifier
     * @param {object} params - Parameters used in the API call
     * @param {number} maxAgeDays - Maximum age in days before cache expires
     * @returns {Promise<any|null>} Cached data or null if not found/expired
     */
    async get(endpoint, params = null, maxAgeDays = MAX_CACHE_AGE_DAYS) {
        const key = this._getCacheKey(endpoint, params);
        const file = this._getCacheFile(key);
        if (!file.query_exists(null)) {
            return null;
        }
        try {
            const [success, contents] = file.load_contents(null);
            if (!success)
                return null;
            const decoder = new TextDecoder('utf-8');
            const data = JSON.parse(decoder.decode(contents));
            // Check cache version
            if (data.version !== CACHE_VERSION) {
                logInfo(`Cache version mismatch for ${endpoint}, invalidating`, 'ApiCache');
                file.delete(null);
                return null;
            }
            // Check age
            const ageMs = Date.now() - data.timestamp;
            const ageDays = ageMs / (1000 * 60 * 60 * 24);
            if (ageDays > maxAgeDays) {
                logInfo(`Cache expired for ${endpoint} (${ageDays.toFixed(1)} days old)`, 'ApiCache');
                file.delete(null);
                return null;
            }
            return data.payload;
        }
        catch (e) {
            logErr(e, `Failed to read cache for ${endpoint}`);
            return null;
        }
    }
    /**
     * Store data in cache
     * @param {string} endpoint - API endpoint identifier
     * @param {any} payload - Data to cache
     * @param {object} params - Parameters used in the API call, if any
     */
    async set(endpoint, payload, params = null) {
        const key = this._getCacheKey(endpoint, params);
        const file = this._getCacheFile(key);
        const cacheData = {
            version: CACHE_VERSION,
            timestamp: Date.now(),
            endpoint,
            params,
            payload
        };
        try {
            const contents = JSON.stringify(cacheData);
            file.replace_contents(contents, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        }
        catch (e) {
            logErr(e, `Failed to write cache for ${endpoint}`);
        }
    }
    /**
     * Invalidate a specific cache entry
     */
    async invalidate(endpoint, params = null) {
        const key = this._getCacheKey(endpoint, params);
        const file = this._getCacheFile(key);
        if (file.query_exists(null)) {
            try {
                file.delete(null);
                logInfo(`Invalidated cache for ${endpoint}`, 'ApiCache');
            }
            catch (e) {
                logErr(e, `Failed to delete cache for ${endpoint}`);
            }
        }
    }
    /**
     * Clear all cached data
     */
    async invalidateAll() {
        const dir = Gio.File.new_for_path(CACHE_DIR);
        if (!dir.query_exists(null))
            return;
        try {
            const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let fileInfo;
            let count = 0;
            while ((fileInfo = enumerator.next_file(null)) !== null) {
                const file = dir.get_child(fileInfo.get_name());
                file.delete(null);
                count++;
            }
            logInfo(`Cleared ${count} cache entries`, 'ApiCache');
        }
        catch (e) {
            logErr(e, 'Failed to clear cache directory');
        }
    }
}
