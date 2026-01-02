/**
 * Extract-related constants
 *
 * This file contains magic numbers and configuration values used across
 * extract-related components to avoid duplication and improve maintainability.
 */

/**
 * Debounce delay for search input in extract list (milliseconds)
 */
export const EXTRACT_SEARCH_DEBOUNCE_MS = 500;

/**
 * Polling interval for checking extract progress when running (milliseconds)
 * Extracts poll every 5 seconds to check for completion
 */
export const EXTRACT_POLLING_INTERVAL_MS = 5000;

/**
 * Maximum time to poll for extract completion before pausing (milliseconds)
 * After 10 minutes, polling stops to prevent server load on long-running jobs
 */
export const EXTRACT_POLLING_TIMEOUT_MS = 600000; // 10 minutes
