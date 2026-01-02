export const VERSION_TAG = "v3.0.0.b3";
export const MOBILE_VIEW_BREAKPOINT = 600;
// Tablet breakpoint - used for sidebar collapse behavior (larger than mobile)
export const TABLET_BREAKPOINT = 768;

// Mention preview character limit (Issue #689)
// Used for truncating annotation text in mention chips and pickers
export const MENTION_PREVIEW_LENGTH = 24;

// File size constants for formatting
export const FILE_SIZE = {
  BYTES_PER_KB: 1024,
  BYTES_PER_MB: 1024 * 1024,
  BYTES_PER_GB: 1024 * 1024 * 1024,
} as const;

// Time unit constants for relative time formatting
export const TIME_UNITS = {
  MS_PER_SECOND: 1000,
  MS_PER_MINUTE: 1000 * 60,
  MS_PER_HOUR: 1000 * 60 * 60,
  MS_PER_DAY: 1000 * 60 * 60 * 24,
  HOURS_PER_DAY: 24,
  DAYS_PER_WEEK: 7,
  DAYS_PER_MONTH: 30,
} as const;
