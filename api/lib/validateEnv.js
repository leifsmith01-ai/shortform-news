// api/lib/validateEnv.js
// Validates that required environment variables are present.
// Call this at the top of each serverless handler so misconfiguration
// is surfaced immediately rather than failing silently mid-request.

/**
 * @typedef {Object} EnvConfig
 * @property {string[]} required   - Variables that MUST be set; handler returns 500 if missing
 * @property {string[]} [optional] - Variables that are nice-to-have; logs a warning if absent
 */

/**
 * Validate environment variables and return a 500 response if any required
 * ones are missing.  Returns { valid: true, values } or { valid: false }.
 *
 * @param {import('http').ServerResponse} res
 * @param {EnvConfig} config
 * @returns {{ valid: boolean, values: Record<string, string|undefined> }}
 */
export function validateEnv(res, config) {
  const missing = [];
  const values = {};

  for (const key of config.required ?? []) {
    const val = process.env[key];
    if (!val) {
      missing.push(key);
    } else {
      values[key] = val;
    }
  }

  for (const key of config.optional ?? []) {
    values[key] = process.env[key] || undefined;
    if (!values[key]) {
      console.warn(`[env] Optional variable ${key} is not set`);
    }
  }

  if (missing.length > 0) {
    console.error(`[env] Missing required environment variables: ${missing.join(', ')}`);
    res.status(500).json({
      error: 'Server configuration error',
      // Do NOT expose which variables are missing in production
    });
    return { valid: false, values };
  }

  return { valid: true, values };
}
