/**
 * Pure utility functions for chat statistics and styling.
 * These have no React dependencies and operate on plain data.
 */

export interface MessageStats {
  max: number;
  min: number;
  mean: number;
  stdDev: number;
}

export interface MessageCountColorStyle {
  background: string;
  opacity: number;
  textColor: string;
}

/**
 * Calculate statistical metrics (max, min, mean, stdDev) for message counts
 * across a list of conversations.
 *
 * @param conversations - Array of conversation objects with chatMessages.totalCount
 * @returns An object with max, min, mean, and stdDev fields.
 */
export const calculateMessageStats = (
  conversations: Array<{ chatMessages?: { totalCount?: number } | null }>
): MessageStats => {
  const counts = conversations.map(
    (conv) => conv?.chatMessages?.totalCount || 0
  );
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  const sum = counts.reduce((a, b) => a + b, 0);
  const mean = sum / counts.length;

  // Calculate standard deviation
  const variance =
    counts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);

  return { max, min, mean, stdDev };
};

/**
 * Determine the background gradient, opacity, and text color for a message
 * count badge based on how the count relates to overall statistics (z-score).
 *
 * @param count - The message count for a specific conversation.
 * @param stats - Aggregate statistics from calculateMessageStats.
 * @returns A style object with background, opacity, and textColor.
 */
export const getMessageCountColor = (
  count: number,
  stats: MessageStats
): MessageCountColorStyle => {
  if (count === 0) {
    return {
      background: "linear-gradient(135deg, #EDF2F7 0%, #E2E8F0 100%)",
      opacity: 0.9,
      textColor: "#4A5568", // Dark text for zero count
    };
  }

  // Calculate z-score
  const zScore = (count - stats.mean) / (stats.stdDev || 1);

  // Convert z-score to a 0-1 scale using sigmoid function
  const intensity = 1 / (1 + Math.exp(-zScore));

  // Create gradient based on intensity
  return {
    background: `linear-gradient(135deg,
      rgba(43, 108, 176, ${0.7 + intensity * 0.3}) 0%,
      rgba(44, 82, 130, ${0.8 + intensity * 0.2}) 100%)`,
    opacity: 0.8 + intensity * 0.2,
    textColor: intensity > 0.3 ? "white" : "#1A202C", // Flip text color based on intensity
  };
};
