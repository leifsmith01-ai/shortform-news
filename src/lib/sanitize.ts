// src/lib/sanitize.ts
// Input sanitization helpers for search queries and keywords.
// These run on the client before values are sent to the API.

const MAX_SEARCH_LENGTH = 200;
const MAX_KEYWORD_LENGTH = 60;

// Characters that are safe in search queries: letters, digits, spaces, and
// common boolean/punctuation operators used in our query syntax.
const SEARCH_SAFE_PATTERN = /[^\p{L}\p{N}\s\-_'".,!?:;&|()+*]/gu;

/**
 * Sanitize a free-text search query.
 * - Trims whitespace
 * - Enforces maximum length
 * - Strips characters that are not letters, digits, spaces, or query operators
 * - Collapses consecutive whitespace
 */
export function sanitizeSearchQuery(raw: string): string {
  return raw
    .trim()
    .slice(0, MAX_SEARCH_LENGTH)
    .replace(SEARCH_SAFE_PATTERN, '')
    .replace(/\s{2,}/g, ' ');
}

/**
 * Sanitize a keyword used for tracking / monitoring.
 * Stricter than search: no special punctuation beyond hyphen and apostrophe.
 */
export function sanitizeKeyword(raw: string): string {
  return raw
    .trim()
    .slice(0, MAX_KEYWORD_LENGTH)
    .replace(/[^\p{L}\p{N}\s\-']/gu, '')
    .replace(/\s{2,}/g, ' ');
}

/**
 * Returns true if the value is non-empty after sanitization.
 */
export function isValidSearchQuery(raw: string): boolean {
  return sanitizeSearchQuery(raw).length > 0;
}

export function isValidKeyword(raw: string): boolean {
  const cleaned = sanitizeKeyword(raw);
  return cleaned.length >= 2 && cleaned.length <= MAX_KEYWORD_LENGTH;
}
