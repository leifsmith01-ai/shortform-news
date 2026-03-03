// api/cron/keyword-alerts.js
// Vercel Cron Job — runs on the schedule defined in vercel.json.
// For each enabled keyword alert, fetches recent news and emails the user
// via Resend if articles were found since their last digest was sent.
//
// Required env vars:
//   CRON_SECRET              — must match the Authorization header Vercel sends
//   SUPABASE_URL             — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS to read all users' alerts
//   RESEND_API_KEY           — Resend email service key
//   VERCEL_URL               — automatically set by Vercel (used to call /api/news)
//
// To test locally:
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/keyword-alerts

export default async function handler(req, res) {
  // Verify Vercel-provided cron secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'] || '';
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const APP_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase config' });
  }
  if (!RESEND_KEY) {
    console.warn('[cron/keyword-alerts] RESEND_API_KEY not set — skipping email sends');
  }

  const serviceHeaders = {
    'Content-Type': 'application/json',
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };

  // Fetch all enabled alert settings with their parent keyword text
  const alertsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/keyword_alert_settings?enabled=eq.true&select=*,tracked_keywords(keyword,user_id)`,
    { headers: serviceHeaders }
  );
  if (!alertsRes.ok) {
    return res.status(500).json({ error: 'Failed to fetch alerts' });
  }
  const alerts = await alertsRes.json();

  const now = new Date();
  let sent = 0;
  let skipped = 0;

  for (const alert of alerts) {
    try {
      // Check if it's time to send based on frequency
      const windowMs = alert.frequency === 'hourly' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      const lastSent = alert.last_sent_at ? new Date(alert.last_sent_at) : null;
      if (lastSent && now - lastSent < windowMs) {
        skipped++;
        continue;
      }

      const keyword = alert.tracked_keywords?.keyword;
      if (!keyword) { skipped++; continue; }

      // Fetch news for this keyword (uses cache, so rarely hits external APIs)
      const newsUrl = `${APP_URL}/api/news?countries=world&categories=world&searchQuery=${encodeURIComponent(keyword)}&dateRange=${alert.frequency === 'hourly' ? '24h' : '24h'}&mode=keyword`;
      const newsRes = await fetch(newsUrl);
      if (!newsRes.ok) { skipped++; continue; }
      const { articles = [] } = await newsRes.json();

      if (articles.length === 0) {
        // Update last_sent_at so we don't re-check until next window
        await fetch(
          `${SUPABASE_URL}/rest/v1/keyword_alert_settings?id=eq.${alert.id}`,
          {
            method: 'PATCH',
            headers: serviceHeaders,
            body: JSON.stringify({ last_sent_at: now.toISOString() }),
          }
        );
        skipped++;
        continue;
      }

      // Build email HTML
      const topArticles = articles.slice(0, 5);
      const articleRows = topArticles.map(a => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
            <a href="${a.url}" style="color:#1e293b;font-weight:600;text-decoration:none;font-size:14px;line-height:1.4;">
              ${escapeHtml(a.title || '')}
            </a>
            <div style="margin-top:4px;font-size:12px;color:#6b7280;">
              ${escapeHtml(a.source || '')} &middot; ${escapeHtml(a.time_ago || '')}
            </div>
            ${a.description ? `<div style="margin-top:6px;font-size:13px;color:#374151;line-height:1.5;">${escapeHtml(a.description.slice(0, 180))}${a.description.length > 180 ? '…' : ''}</div>` : ''}
          </td>
        </tr>
      `).join('');

      const subject = `[${keyword}] ${articles.length} new article${articles.length !== 1 ? 's' : ''} — Shortform`;
      const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
            <tr>
              <td style="background:#0f172a;padding:24px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;">Shortform</span>
                <span style="color:#94a3b8;font-size:14px;margin-left:12px;">Media Monitor</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;">
                <h2 style="margin:0 0 4px;font-size:20px;color:#0f172a;">
                  Keyword: <em style="font-style:normal;color:#2563eb;">${escapeHtml(keyword)}</em>
                </h2>
                <p style="margin:0 0 24px;font-size:14px;color:#64748b;">
                  ${articles.length} article${articles.length !== 1 ? 's' : ''} found &middot; ${alert.frequency} digest
                </p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${articleRows}
                </table>
                ${articles.length > 5 ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;">+ ${articles.length - 5} more article${articles.length - 5 !== 1 ? 's' : ''}</p>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <a href="https://shortform.news/keywords" style="font-size:12px;color:#64748b;">Manage alerts</a>
                <span style="color:#cbd5e1;margin:0 8px;">&middot;</span>
                <span style="font-size:12px;color:#94a3b8;">Shortform News &mdash; shortform.news</span>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      if (RESEND_KEY) {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RESEND_KEY}`,
          },
          body: JSON.stringify({
            from: 'Shortform <alerts@shortform.news>',
            to: [alert.email],
            subject,
            html,
          }),
        });
        if (!emailRes.ok) {
          const err = await emailRes.text();
          console.error(`[cron/keyword-alerts] Failed to send to ${alert.email}:`, err);
          skipped++;
          continue;
        }
      }

      // Update last_sent_at
      await fetch(
        `${SUPABASE_URL}/rest/v1/keyword_alert_settings?id=eq.${alert.id}`,
        {
          method: 'PATCH',
          headers: serviceHeaders,
          body: JSON.stringify({ last_sent_at: now.toISOString() }),
        }
      );

      sent++;
    } catch (err) {
      console.error('[cron/keyword-alerts] Error processing alert:', alert.id, err.message);
      skipped++;
    }
  }

  return res.status(200).json({
    ok: true,
    processed: alerts.length,
    sent,
    skipped,
    timestamp: now.toISOString(),
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
