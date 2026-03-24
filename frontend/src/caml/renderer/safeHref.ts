/**
 * URL safety guard for CAML-rendered hrefs.
 *
 * Only permits http://, https://, relative (/), and fragment (#) URLs.
 * Rejects javascript:, data:, vbscript:, and other dangerous protocols
 * that could execute arbitrary code when rendered into anchor elements.
 */
const SAFE_URL_PATTERN = /^(https?:\/\/|\/|#)/i;

export function isSafeHref(href: string): boolean {
  if (!href) return false;
  return SAFE_URL_PATTERN.test(href.trim());
}
