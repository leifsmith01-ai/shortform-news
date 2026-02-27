// api/admin-set-premium.js
// Upgrades the currently authenticated Clerk user to premium plan.
// The Clerk session JWT is verified using the Clerk Backend SDK before
// any privileged action is taken.
// Requires CLERK_SECRET_KEY to be set in the environment.

export default async function handler(req, res) {
  // Restrict CORS to the application's own origin only
  const allowedOrigin = process.env.APP_ORIGIN || 'https://shortform.news';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
  if (!CLERK_SECRET_KEY) {
    console.error('CLERK_SECRET_KEY is not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Extract the Clerk session JWT from the Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  // Verify the JWT using the Clerk Backend API — this validates the signature,
  // expiry, and issuer so no forged token can pass.
  let userId;
  try {
    const verifyRes = await fetch('https://api.clerk.com/v1/sessions/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!verifyRes.ok) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const session = await verifyRes.json();
    userId = session.user_id;
    if (!userId) throw new Error('No user_id in verified session');
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return res.status(401).json({ error: 'Token verification failed' });
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
      console.error('Clerk metadata update failed for user:', userId);
      return res.status(500).json({ error: 'Failed to update account' });
    }

    return res.status(200).json({ success: true, message: 'Account upgraded to premium' });
  } catch (err) {
    console.error('Clerk API error:', err.message);
    return res.status(500).json({ error: 'An error occurred' });
  }
}
