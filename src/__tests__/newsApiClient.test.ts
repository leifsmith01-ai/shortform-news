import { describe, it, expect, vi, beforeEach } from 'vitest';
import { newsApiClient } from '@/api/newsApiClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockFetchSuccess(body: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function mockFetchFailure(message: string) {
  global.fetch = vi.fn().mockRejectedValue(new Error(message));
}

// ── fetchNews ─────────────────────────────────────────────────────────────────

describe('newsApiClient.fetchNews', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls /api/news with a POST and the provided params', async () => {
    mockFetchSuccess({ articles: [], totalResults: 0 });

    await newsApiClient.fetchNews({
      countries: ['us'],
      categories: ['technology'],
      searchQuery: 'AI',
      dateRange: '24h',
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/news', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.countries).toEqual(['us']);
    expect(body.categories).toEqual(['technology']);
    expect(body.searchQuery).toBe('AI');
  });

  it('returns the parsed response data on success', async () => {
    const articles = [{ id: '1', title: 'Test Article' }];
    mockFetchSuccess({ articles, totalResults: 1 });

    const result = await newsApiClient.fetchNews({ countries: ['us'], categories: ['technology'] });
    expect(result.articles).toEqual(articles);
  });

  it('throws when the server returns a non-OK status', async () => {
    mockFetchSuccess({ error: 'Not found' }, 404);

    await expect(
      newsApiClient.fetchNews({ countries: ['us'], categories: ['technology'] })
    ).rejects.toThrow('Server error: 404');
  });

  it('propagates network errors', async () => {
    mockFetchFailure('Network failure');

    await expect(
      newsApiClient.fetchNews({ countries: ['us'], categories: ['technology'] })
    ).rejects.toThrow('Network failure');
  });
});

// ── getSavedArticles ───────────────────────────────────────────────────────────

describe('newsApiClient.getSavedArticles', () => {
  it('returns an empty array when localStorage has no saved articles', async () => {
    const result = await newsApiClient.getSavedArticles();
    expect(result).toEqual([]);
  });

  it('returns parsed articles from localStorage', async () => {
    const articles = [{ id: '1', title: 'Saved Article' }];
    localStorage.setItem('savedArticles', JSON.stringify(articles));

    const result = await newsApiClient.getSavedArticles();
    expect(result).toEqual(articles);
  });

  it('returns an empty array on malformed JSON', async () => {
    localStorage.setItem('savedArticles', '{bad json');
    const result = await newsApiClient.getSavedArticles();
    expect(result).toEqual([]);
  });
});

// ── saveArticle ───────────────────────────────────────────────────────────────

describe('newsApiClient.saveArticle', () => {
  it('persists the article to localStorage with a savedAt timestamp', async () => {
    const article = { id: 'a1', title: 'Test' };
    await newsApiClient.saveArticle(article);

    const saved = JSON.parse(localStorage.getItem('savedArticles')!);
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('a1');
    expect(saved[0].savedAt).toBeDefined();
  });

  it('appends to existing saved articles', async () => {
    localStorage.setItem('savedArticles', JSON.stringify([{ id: 'existing' }]));
    await newsApiClient.saveArticle({ id: 'new' });

    const saved = JSON.parse(localStorage.getItem('savedArticles')!);
    expect(saved).toHaveLength(2);
  });
});

// ── unsaveArticle ─────────────────────────────────────────────────────────────

describe('newsApiClient.unsaveArticle', () => {
  it('removes the article with the matching id', async () => {
    localStorage.setItem('savedArticles', JSON.stringify([
      { id: 'keep' },
      { id: 'remove' },
    ]));

    await newsApiClient.unsaveArticle('remove');
    const saved = JSON.parse(localStorage.getItem('savedArticles')!);
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('keep');
  });

  it('returns true on success', async () => {
    localStorage.setItem('savedArticles', JSON.stringify([{ id: 'x' }]));
    const result = await newsApiClient.unsaveArticle('x');
    expect(result).toBe(true);
  });
});

// ── Reading history ────────────────────────────────────────────────────────────

describe('newsApiClient.getReadingHistory', () => {
  it('returns an empty array initially', async () => {
    expect(await newsApiClient.getReadingHistory()).toEqual([]);
  });
});

describe('newsApiClient.addToHistory', () => {
  it('prepends the article and caps history at 100 entries', async () => {
    const existing = Array.from({ length: 100 }, (_, i) => ({ id: `old-${i}` }));
    localStorage.setItem('readingHistory', JSON.stringify(existing));

    await newsApiClient.addToHistory({ id: 'new' });
    const history = JSON.parse(localStorage.getItem('readingHistory')!);
    expect(history).toHaveLength(100);
    expect(history[0].id).toBe('new');
  });

  it('avoids duplicates by removing an existing entry before prepending', async () => {
    localStorage.setItem('readingHistory', JSON.stringify([{ id: 'dup' }]));
    await newsApiClient.addToHistory({ id: 'dup' });

    const history = JSON.parse(localStorage.getItem('readingHistory')!);
    expect(history.filter((a: { id: string }) => a.id === 'dup')).toHaveLength(1);
  });
});
