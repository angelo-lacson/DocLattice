/**
 * Shared utility functions for extract-related components
 *
 * These utilities are used by ExtractDetail, ExtractListCard, and other
 * components that display extract status and metadata.
 */

import type { ExtractType } from "../types/graphql-api";

/**
 * Extract status types
 */
export type ExtractStatusLabel =
  | "Running"
  | "Completed"
  | "Failed"
  | "Not Started";

export type ExtractStatusColor =
  | "success"
  | "info"
  | "error"
  | "warning"
  | "default";

export interface ExtractStatusInfo {
  label: ExtractStatusLabel;
  color: ExtractStatusColor;
}

/**
 * Determines the status label and color for an extract based on its state
 *
 * @param extract - The extract to get status for
 * @returns Object containing the status label and color for display
 */
export function getExtractStatus(extract: ExtractType): ExtractStatusInfo {
  if (extract.started && !extract.finished && !extract.error) {
    return { label: "Running", color: "info" };
  }
  if (extract.finished) {
    return { label: "Completed", color: "success" };
  }
  if (extract.error) {
    return { label: "Failed", color: "error" };
  }
  return { label: "Not Started", color: "default" };
}

/**
 * Formats a date string to a human-readable format
 *
 * @param dateString - ISO date string to format
 * @returns Formatted date string (e.g., "Jan 15, 2024")
 */
export function formatExtractDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
