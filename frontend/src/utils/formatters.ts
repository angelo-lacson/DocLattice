import { FILE_SIZE, TIME_UNITS } from "../assets/configurations/constants";

/**
 * Formats a byte count into a human-readable file size string.
 * @param bytes - The number of bytes to format
 * @returns Formatted string like "1.5 KB" or "2.3 MB", or empty string if no bytes
 */
export function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < FILE_SIZE.BYTES_PER_KB) return `${bytes} B`;
  if (bytes < FILE_SIZE.BYTES_PER_MB) {
    return `${(bytes / FILE_SIZE.BYTES_PER_KB).toFixed(1)} KB`;
  }
  return `${(bytes / FILE_SIZE.BYTES_PER_MB).toFixed(1)} MB`;
}

/**
 * Formats a date string into a relative time description.
 * @param dateString - ISO date string to format
 * @returns Relative time string like "Just now", "5 hours ago", "3 days ago"
 */
export function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / TIME_UNITS.MS_PER_HOUR;
  const diffDays = diffHours / TIME_UNITS.HOURS_PER_DAY;

  if (diffHours < 1) return "Just now";
  if (diffHours < TIME_UNITS.HOURS_PER_DAY) {
    return `${Math.floor(diffHours)} hours ago`;
  }
  if (diffDays < TIME_UNITS.DAYS_PER_WEEK) {
    return `${Math.floor(diffDays)} days ago`;
  }
  return date.toLocaleDateString();
}

/**
 * Formats a date string into a compact relative time description.
 * Used in activity feeds and compact displays.
 * @param dateString - ISO date string to format
 * @returns Compact time string like "5h ago", "3d ago", or empty string if no dateString
 */
export function formatCompactRelativeTime(dateString?: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / TIME_UNITS.MS_PER_SECOND);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / TIME_UNITS.HOURS_PER_DAY);

  if (diffDays > TIME_UNITS.DAYS_PER_MONTH) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } else if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMins > 0) {
    return `${diffMins}m ago`;
  } else {
    return "Just now";
  }
}

/**
 * Extracts initials from a name or email for avatar display.
 * Handles email addresses by taking first letter before @.
 * @param name - Name or email to extract initials from
 * @returns 1-2 character initial string, or "U" if no name provided
 */
export function getInitials(name?: string | null): string {
  if (!name) return "U";
  // Handle email addresses - take first letter before @
  if (name.includes("@")) {
    return name.split("@")[0].charAt(0).toUpperCase();
  }
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
