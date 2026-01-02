import {
  EXTRACT_STATUS,
  EXTRACT_STATUS_COLORS,
  ExtractStatus,
} from "../assets/configurations/constants";
import { ExtractType } from "../types/graphql-api";

/**
 * Determines the status of an extract based on its state flags.
 * @param extract - The extract to check status for
 * @returns The extract status string
 */
export function getExtractStatus(extract: ExtractType): ExtractStatus {
  if (extract.started && !extract.finished && !extract.error) {
    return EXTRACT_STATUS.RUNNING;
  }
  if (extract.finished) {
    return EXTRACT_STATUS.COMPLETED;
  }
  if (extract.error) {
    return EXTRACT_STATUS.FAILED;
  }
  return EXTRACT_STATUS.NOT_STARTED;
}

type ChipColor = "success" | "info" | "error" | "warning" | "default";

/**
 * Returns the status chip props (color and label) for an extract.
 * @param extract - The extract to get chip props for
 * @returns Object with color and label for the status chip
 */
export function getExtractStatusChipProps(extract: ExtractType): {
  color: ChipColor;
  label: ExtractStatus;
} {
  const status = getExtractStatus(extract);
  return {
    color: EXTRACT_STATUS_COLORS[status] as ChipColor,
    label: status,
  };
}

/**
 * Checks if an extract is currently running (started but not finished or errored).
 * @param extract - The extract to check
 * @returns True if the extract is running
 */
export function isExtractRunning(extract: ExtractType): boolean {
  return Boolean(extract.started && !extract.finished && !extract.error);
}

/**
 * Checks if an extract has completed successfully.
 * @param extract - The extract to check
 * @returns True if the extract completed without errors
 */
export function isExtractComplete(extract: ExtractType): boolean {
  return Boolean(extract.started && extract.finished && !extract.error);
}

/**
 * Checks if an extract has failed.
 * @param extract - The extract to check
 * @returns True if the extract has an error
 */
export function isExtractFailed(extract: ExtractType): boolean {
  return Boolean(extract.error);
}

/**
 * Checks if an extract can be edited (not yet started).
 * @param extract - The extract to check
 * @returns True if the extract can be edited
 */
export function canEditExtract(extract: ExtractType): boolean {
  return !extract.started;
}
