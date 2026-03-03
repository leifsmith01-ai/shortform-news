// api/keyword-alerts.js
// CRUD endpoint for per-keyword email alert settings.
// GET    /api/keyword-alerts?userId=xxx   → list alerts for user
// POST   /api/keyword-alerts              → create/update alert { keyword_id, email, frequency, enabled }
// DELETE /api/keyword-alerts?id=xxx       → delete alert by id
//
// All writes are done through the user's JWT (Supabase RLS enforces ownership).
// The backend uses the service role key only for cron operations (keyword-alerts/cron).

export const config = { runtime: 'edge' };

const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://shortform.news';

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return res;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return cors(new Response(null, { status: 204 }));
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!SUPABASE_URL) {
    return cors(new Response(JSON.stringify({ error: 'Supabase not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    }));
  }

  // Forward the user's Clerk JWT to Supabase so RLS can authenticate them.
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return cors(new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    }));
  }

  const supabaseHeaders = {
    'Content-Type': 'application/json',
    apikey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    Authorization: authHeader,
  };

  const url = new URL(req.url);

  // ── GET: list all alert settings for the user ────────────────────────────
  if (req.method === 'GET') {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/keyword_alert_settings?select=*&order=created_at.desc`,
      { headers: supabaseHeaders }
    );
    const data = await res.json();
    return cors(new Response(JSON.stringify(data), {
      status: res.status, headers: { 'Content-Type': 'application/json' },
    }));
  }

  // ── POST: upsert an alert setting ────────────────────────────────────────
  if (req.method === 'POST') {
    const body = await req.json();
    const { keyword_id, email, frequency = 'daily', enabled = true } = body;

    if (!keyword_id || !email) {
      return cors(new Response(JSON.stringify({ error: 'keyword_id and email are required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      }));
    }
    if (!['hourly', 'daily'].includes(frequency)) {
      return cors(new Response(JSON.stringify({ error: 'frequency must be hourly or daily' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      }));
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/keyword_alert_settings`,
      {
        method: 'POST',
        headers: { ...supabaseHeaders, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ keyword_id, email, frequency, enabled }),
      }
    );
    const data = await res.json();
    return cors(new Response(JSON.stringify(Array.isArray(data) ? data[0] : data), {
      status: res.ok ? 200 : res.status, headers: { 'Content-Type': 'application/json' },
    }));
  }

  // ── DELETE: remove an alert setting by id ───────────────────────────────
  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) {
      return cors(new Response(JSON.stringify({ error: 'id is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      }));
    }
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/keyword_alert_settings?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: supabaseHeaders }
    );
    return cors(new Response(null, { status: res.ok ? 204 : res.status }));
  }

  return cors(new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { 'Content-Type': 'application/json' },
  }));
}
