// api/admin-set-premium.js
// DEV/TESTING TOOL: Upgrades the currently authenticated Clerk user to premium plan.
// The Clerk session JWT is passed as a Bearer token; the user ID is extracted from
// the payload (no signature verification — this endpoint is for development use only).
// Requires CLERK_SECRET_KEY to be set in the environment.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
  if (!CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'CLERK_SECRET_KEY is not configured on the server' });
  }

  // Extract the Clerk session JWT from the Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  let userId;
  try {
    const token = authHeader.slice(7);
    // Decode JWT payload without verification (dev/testing only)
    const payloadBase64 = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    userId = payload.sub;
    if (!userId) throw new Error('No user ID (sub) in token');
  } catch {
    return res.status(401).json({ error: 'Could not decode authorization token' });
  }

  // Call the Clerk Backend API to set publicMetadata.plan = 'premium'
  try {
    const clerkRes = await fetch(`https://api.clerk.com/v1/users/${userId}/metadata`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        public_metadata: { plan: 'premium' },
      }),
    });

    if (!clerkRes.ok) {
      const err = await clerkRes.json();
      return res.status(500).json({ error: err.errors?.[0]?.message || 'Clerk API error' });
    }

    return res.status(200).json({ success: true, userId, message: 'Account upgraded to premium' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
