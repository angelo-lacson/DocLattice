/**
 * Text sanitization utilities for user-generated content
 *
 * Per CLAUDE.md: "User-generated content in JSON fields must be escaped on frontend"
 * These utilities help prevent XSS when displaying user-generated text in mentions,
 * tooltips, and other UI elements.
 */

/**
 * Escape HTML special characters in text to prevent XSS when rendered in markdown
 * or other contexts where HTML might be interpreted.
 *
 * This is particularly important for annotation rawText which comes from user
 * documents and may contain special characters.
 *
 * @param text - The text to sanitize
 * @returns Sanitized text with HTML entities escaped
 */
export function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

/**
 * Sanitize text for use in mention labels and tooltips.
 * Escapes characters that could break markdown rendering or enable XSS.
 *
 * For mention labels that will be converted to markdown links, we need to
 * escape brackets and special markdown characters.
 *
 * @param text - The text to sanitize for mention display
 * @returns Sanitized text safe for use in mentions
 */
export function sanitizeForMention(text: string): string {
  // Remove or escape characters that could break markdown link syntax
  // [label](url) - we need to escape [ ] ( ) in the label
  return text
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\n/g, " ") // Replace newlines with spaces for single-line display
    .replace(/\r/g, ""); // Remove carriage returns
}

/**
 * Truncate text to a maximum length, adding ellipsis if truncated.
 * Sanitizes the text before truncating to ensure safe display.
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation
 * @param sanitize - Whether to sanitize for mentions (default: true)
 * @returns Truncated and optionally sanitized text
 */
export function truncateText(
  text: string,
  maxLength: number,
  sanitize: boolean = true
): string {
  const processedText = sanitize ? sanitizeForMention(text) : text;
  if (processedText.length <= maxLength) {
    return processedText;
  }
  return processedText.substring(0, maxLength) + "…";
}
