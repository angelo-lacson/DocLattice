export const VERSION_TAG = "v3.0.0.b4";
export const MOBILE_VIEW_BREAKPOINT = 600;
// Tablet breakpoint - used for sidebar collapse behavior (larger than mobile)
export const TABLET_BREAKPOINT = 768;
// Desktop breakpoint - minimum width for desktop-only features (TABLET_BREAKPOINT + 1)
export const DESKTOP_BREAKPOINT = 769;

// Mention preview character limit (Issue #689)
// Used for truncating annotation text in mention chips and pickers
export const MENTION_PREVIEW_LENGTH = 24;

// Label/UI colors
// Default neutral gray color (Tailwind slate-400) used for inactive/placeholder states
export const DEFAULT_LABEL_COLOR = "94a3b8";
// Primary teal color used for new label creation
export const PRIMARY_LABEL_COLOR = "0F766E";

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

// Document view mode constants
export const VIEW_MODES = {
  GRID: "grid",
  LIST: "list",
  COMPACT: "compact",
} as const;

export type ViewMode = (typeof VIEW_MODES)[keyof typeof VIEW_MODES];

// Document status filter constants
export const STATUS_FILTERS = {
  ALL: "all",
  PROCESSED: "processed",
  PROCESSING: "processing",
} as const;

export type StatusFilter = (typeof STATUS_FILTERS)[keyof typeof STATUS_FILTERS];

// Debounce timing constants
export const DEBOUNCE = {
  SEARCH_MS: 1000,
  EXTRACT_SEARCH_MS: 500,
  CLICK_OUTSIDE_DELAY_MS: 100,
  CORPUS_SEARCH_MS: 400,
  CORPUS_SEARCH_MAX_WAIT_MS: 1000,
} as const;

// Upload constraints
export const UPLOAD = {
  /** Maximum file size in bytes (100MB) */
  MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024,
  /** Maximum file size display string */
  MAX_FILE_SIZE_DISPLAY: "100MB",
} as const;

// Polling constants (legacy - most polling replaced by WebSocket notifications)
export const POLLING = {
  DOCUMENT_PROCESSING_INTERVAL_MS: 15000,
  DOCUMENT_PROCESSING_TIMEOUT_MS: 600000,
} as const;

// Extract status constants
export const EXTRACT_STATUS = {
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
  NOT_STARTED: "Not Started",
} as const;

export type ExtractStatus =
  (typeof EXTRACT_STATUS)[keyof typeof EXTRACT_STATUS];

// Extract chip color mapping
export const EXTRACT_STATUS_COLORS = {
  [EXTRACT_STATUS.RUNNING]: "info",
  [EXTRACT_STATUS.COMPLETED]: "success",
  [EXTRACT_STATUS.FAILED]: "error",
  [EXTRACT_STATUS.NOT_STARTED]: "default",
} as const;

// Document relationship pagination limits
export const DOCUMENT_RELATIONSHIP_PAGINATION_LIMIT = 50;
export const DOCUMENT_RELATIONSHIP_TOC_LIMIT = 500;
// Limit for fetching corpus documents in TOC (includes standalone docs)
// Backend enforces max 100 records per page on documents connection
export const CORPUS_DOCUMENTS_TOC_LIMIT = 100;

// Document search/picker limits
export const DOCUMENT_PICKER_SEARCH_LIMIT = 20;

// Mutation batching
export const MUTATION_BATCH_SIZE = 10;
