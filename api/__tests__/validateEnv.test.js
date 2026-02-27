import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateEnv } from '../lib/validateEnv.js';

describe('validateEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore process.env after each test
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  function makeRes() {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    return res;
  }

  it('returns valid:true when all required vars are present', () => {
    process.env.TEST_KEY = 'secret';
    const res = makeRes();
    const result = validateEnv(res, { required: ['TEST_KEY'] });
    expect(result.valid).toBe(true);
    expect(result.values.TEST_KEY).toBe('secret');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns valid:false and sends a 500 when a required var is missing', () => {
    delete process.env.MISSING_KEY;
    const res = makeRes();
    const result = validateEnv(res, { required: ['MISSING_KEY'] });
    expect(result.valid).toBe(false);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Server configuration error' }));
  });

  it('returns valid:false when multiple required vars are missing', () => {
    delete process.env.KEY_A;
    delete process.env.KEY_B;
    const res = makeRes();
    const result = validateEnv(res, { required: ['KEY_A', 'KEY_B'] });
    expect(result.valid).toBe(false);
  });

  it('succeeds even when optional vars are absent, only logging a warning', () => {
    process.env.REQUIRED = 'present';
    delete process.env.OPTIONAL_VAR;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = makeRes();
    const result = validateEnv(res, { required: ['REQUIRED'], optional: ['OPTIONAL_VAR'] });
    expect(result.valid).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('OPTIONAL_VAR'));
    warnSpy.mockRestore();
  });

  it('includes optional var values when they are set', () => {
    process.env.REQUIRED = 'yes';
    process.env.NICE_TO_HAVE = 'value';
    const res = makeRes();
    const result = validateEnv(res, { required: ['REQUIRED'], optional: ['NICE_TO_HAVE'] });
    expect(result.values.NICE_TO_HAVE).toBe('value');
  });

  it('handles an empty config (no required or optional vars)', () => {
    const res = makeRes();
    const result = validateEnv(res, {});
    expect(result.valid).toBe(true);
  });
});
