/**
 * Converts an external article URL into a URL-safe base64 slug and back.
 * Used to generate stable /article/:slug routes without a database.
 */

export function toArticleSlug(url: string): string {
  return btoa(encodeURIComponent(url))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function fromArticleSlug(slug: string): string {
  const padded = slug.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 ? '='.repeat(4 - (padded.length % 4)) : '';
  return decodeURIComponent(atob(padded + pad));
}
