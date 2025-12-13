/**
 * Social media crawler detection utilities
 *
 * Detects user agents from social media platforms that fetch link previews.
 * These crawlers don't execute JavaScript, so they need pre-rendered OG tags.
 */

/**
 * Known social media crawler user agent substrings (case-insensitive)
 *
 * Sources:
 * - https://developers.cloudflare.com/bots/concepts/bot/verified-bots/
 * - https://radar.cloudflare.com/bots/directory
 */
const SOCIAL_CRAWLERS = [
  // Social Media
  "twitterbot", // Twitter/X
  "facebookexternalhit", // Facebook
  "facebookcatalog", // Facebook Commerce
  "linkedinbot", // LinkedIn
  "slackbot", // Slack
  "slackbot-linkexpanding", // Slack link preview
  "discordbot", // Discord
  "whatsapp", // WhatsApp
  "telegrambot", // Telegram

  // Messaging/Preview Services
  "pinterest", // Pinterest
  "applebot", // Apple (iMessage, Siri)
  "redditbot", // Reddit
  "embedly", // Embed.ly

  // Optional: Search engines (uncomment for SEO benefits)
  // 'googlebot',  // Google
  // 'bingbot',    // Bing
  // 'duckduckbot', // DuckDuckGo
];

/**
 * Check if the user agent belongs to a social media crawler
 *
 * @param userAgent - The User-Agent header value
 * @returns true if the request is from a social media crawler
 */
export function isSocialMediaCrawler(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return SOCIAL_CRAWLERS.some((crawler) => ua.includes(crawler));
}

/**
 * Check if the user agent appears to be any kind of bot
 * Useful for debugging and logging
 *
 * @param userAgent - The User-Agent header value
 * @returns true if the request appears to be from a bot
 */
export function isKnownBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return (
    ua.includes("bot") ||
    ua.includes("crawler") ||
    ua.includes("spider") ||
    ua.includes("preview") ||
    ua.includes("fetch")
  );
}

/**
 * Get the crawler name for logging purposes
 *
 * @param userAgent - The User-Agent header value
 * @returns The detected crawler name or null
 */
export function getCrawlerName(userAgent: string): string | null {
  const ua = userAgent.toLowerCase();

  // Specific crawler identification
  if (ua.includes("twitterbot")) return "Twitter";
  if (ua.includes("facebookexternalhit")) return "Facebook";
  if (ua.includes("linkedinbot")) return "LinkedIn";
  if (ua.includes("slackbot")) return "Slack";
  if (ua.includes("discordbot")) return "Discord";
  if (ua.includes("whatsapp")) return "WhatsApp";
  if (ua.includes("telegrambot")) return "Telegram";
  if (ua.includes("pinterest")) return "Pinterest";
  if (ua.includes("applebot")) return "Apple";
  if (ua.includes("redditbot")) return "Reddit";
  if (ua.includes("googlebot")) return "Google";
  if (ua.includes("bingbot")) return "Bing";

  // Generic bot detection
  if (isKnownBot(userAgent)) return "Unknown Bot";

  return null;
}
