import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isRateLimited, getClientIp, applyRateLimit } from '../lib/rateLimit.js';

// Reset the internal store between tests by re-importing the module with a fresh cache.
// Since vitest isolates modules per test file by default we can manipulate time instead.

describe('getClientIp', () => {
  it('extracts the first IP from x-forwarded-for', () => {
    const req = { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, socket: {} };
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    const req = { headers: { 'x-real-ip': '9.9.9.9' }, socket: {} };
    expect(getClientIp(req)).toBe('9.9.9.9');
  });

  it('falls back to socket.remoteAddress', () => {
    const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    expect(getClientIp(req)).toBe('127.0.0.1');
  });

  it("returns 'unknown' when no IP is available", () => {
    const req = { headers: {}, socket: {} };
    expect(getClientIp(req)).toBe('unknown');
  });
});

describe('isRateLimited', () => {
  // Use a unique IP prefix per test to avoid cross-test contamination
  let ipCounter = 0;
  const freshIp = () => `10.0.${Math.floor(ipCounter / 255)}.${ipCounter++ % 255}`;

  it('allows the first request', () => {
    expect(isRateLimited(freshIp(), 5)).toBe(false);
  });

  it('allows requests up to the limit', () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(ip, 5)).toBe(false);
    }
  });

  it('blocks requests that exceed the limit', () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) isRateLimited(ip, 5);
    expect(isRateLimited(ip, 5)).toBe(true);
  });

  it('resets the counter after the window expires', () => {
    const ip = freshIp();
    // Fill the limit
    for (let i = 0; i < 5; i++) isRateLimited(ip, 5);
    expect(isRateLimited(ip, 5)).toBe(true);

    // Advance time past the 1-minute window
    vi.useFakeTimers();
    vi.advanceTimersByTime(61 * 1000);
    expect(isRateLimited(ip, 5)).toBe(false);
    vi.useRealTimers();
  });
});

describe('applyRateLimit', () => {
  let ipCounter = 1000;
  const freshIp = () => `192.168.${Math.floor(ipCounter / 255)}.${ipCounter++ % 255}`;

  it('returns false and does not send a response when under the limit', () => {
    const req = { headers: { 'x-forwarded-for': freshIp() }, socket: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    expect(applyRateLimit(req, res, 10)).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns true and sends a 429 when over the limit', () => {
    const ip = freshIp();
    const req = { headers: { 'x-forwarded-for': ip }, socket: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    for (let i = 0; i < 3; i++) applyRateLimit(req, res, 3);
    const blocked = applyRateLimit(req, res, 3);
    expect(blocked).toBe(true);
    expect(res.status).toHaveBeenCalledWith(429);
  });
});
