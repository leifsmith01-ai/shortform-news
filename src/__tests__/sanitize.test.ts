import { describe, it, expect } from 'vitest';
import {
  sanitizeSearchQuery,
  sanitizeKeyword,
  isValidSearchQuery,
  isValidKeyword,
} from '@/lib/sanitize';

describe('sanitizeSearchQuery', () => {
  it('trims leading and trailing whitespace', () => {
    expect(sanitizeSearchQuery('  hello world  ')).toBe('hello world');
  });

  it('collapses multiple spaces into one', () => {
    expect(sanitizeSearchQuery('hello   world')).toBe('hello world');
  });

  it('enforces the 200-character maximum length', () => {
    const long = 'a'.repeat(250);
    expect(sanitizeSearchQuery(long).length).toBe(200);
  });

  it('allows letters, digits, and common query operators', () => {
    const query = 'AI OR "machine learning" AND NOT crypto';
    expect(sanitizeSearchQuery(query)).toBe(query);
  });

  it('strips angle brackets and script tags', () => {
    const xss = '<script>alert(1)</script>';
    const result = sanitizeSearchQuery(xss);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('returns an empty string for an all-special-character input', () => {
    expect(sanitizeSearchQuery('<<<>>>')).toBe('');
  });

  it('preserves accented and unicode letters', () => {
    expect(sanitizeSearchQuery('café résumé')).toBe('café résumé');
  });

  it('preserves parentheses and boolean operators used in queries', () => {
    const q = '(climate OR weather) AND NOT politics';
    expect(sanitizeSearchQuery(q)).toBe(q);
  });
});

describe('sanitizeKeyword', () => {
  it('trims whitespace', () => {
    expect(sanitizeKeyword('  bitcoin  ')).toBe('bitcoin');
  });

  it('enforces the 60-character maximum length', () => {
    const long = 'a'.repeat(80);
    expect(sanitizeKeyword(long).length).toBe(60);
  });

  it('strips disallowed special characters', () => {
    expect(sanitizeKeyword('hello<world>')).toBe('helloworld');
  });

  it('allows hyphens and apostrophes', () => {
    expect(sanitizeKeyword("e-commerce couldn't")).toBe("e-commerce couldn't");
  });
});

describe('isValidSearchQuery', () => {
  it('returns true for a non-empty sanitized query', () => {
    expect(isValidSearchQuery('AI news')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isValidSearchQuery('')).toBe(false);
  });

  it('returns false for a string that is entirely stripped by sanitization', () => {
    expect(isValidSearchQuery('<<<>>>')).toBe(false);
  });
});

describe('isValidKeyword', () => {
  it('returns true for a normal two-character keyword', () => {
    expect(isValidKeyword('AI')).toBe(true);
  });

  it('returns false for a single character after sanitization', () => {
    expect(isValidKeyword('a')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidKeyword('')).toBe(false);
  });

  it('truncates and accepts a keyword that is slightly over the limit', () => {
    // sanitizeKeyword truncates to MAX_KEYWORD_LENGTH (60), so 61 chars → valid 60-char keyword
    expect(isValidKeyword('a'.repeat(61))).toBe(true);
  });

  it('returns true for a keyword exactly at the maximum length', () => {
    expect(isValidKeyword('a'.repeat(60))).toBe(true);
  });
});
