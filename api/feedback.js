'use strict';

/* =============================================================================
   Brand Hunters · feedback endpoint (Vercel serverless function)
   -----------------------------------------------------------------------------
   POST /api/feedback   { "team": "…", "message": "…", "sessionId": "…" }
   Sends the message by email with Resend (https://resend.com).

   Limits (the page applies them too, but anyone can bypass a web page):
     · per browser session (random "sessionId" made by the page, kept until the
       browser is closed): 2 messages, at least 1 minute apart;
     · per IP address: 20 messages per 10 minutes. Kept loose on purpose: a
       whole class on the same Wi-Fi often shares one address.
   They are kept in the memory of each server instance: a good brake against
   abuse, not an exact count (an instance can restart, several can run).

   The Resend API key must stay secret: it lives here, on the server, never in
   the website code. Set these environment variables in Vercel
   (Project → Settings → Environment Variables):

     RESEND_API_KEY   required  Resend API key (starts with "re_")
     FEEDBACK_TO      required  address(es) that receive the feedback,
                                comma-separated
     FEEDBACK_FROM    optional  sender. Default: "Brand Hunters <onboarding@resend.dev>"
                                (works without a domain, but Resend then only
                                delivers to the address of your Resend account)
     ALLOWED_ORIGINS  optional  comma-separated websites allowed to send feedback,
                                e.g. "https://yourname.github.io". Default: any.
                                The site served by this same Vercel project is
                                always allowed.

   No dependencies: it uses the fetch() built into Node.js 18+.
   ========================================================================== */

const MAX_TEAM = 60;
const MAX_MESSAGE = 2000;
const MAX_BODY_BYTES = 16 * 1024;
/** A human needs more than this to write a message: faster = bot. */
const MIN_FILL_MS = 2500;
/** Per browser session. keepMs: after that, a forgotten session starts again. */
const SESSION_LIMIT = { max: 2, minIntervalMs: 60 * 1000, keepMs: 12 * 60 * 60 * 1000 };
/** Safety net per IP address (bots changing their session id at each request). */
const IP_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 };
/** Keeps memory bounded. */
const MAX_TRACKED = 5000;
const SESSION_ID = /^[\w-]{6,64}$/;
const DEFAULT_FROM = 'Brand Hunters <onboarding@resend.dev>';

const sentBySession = new Map(); // session id → times of the messages sent
const recentByIp = new Map();    // IP address → times of the recent attempts

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function list(value) {
  return String(value || '').split(',').map((item) => item.trim().replace(/\/+$/, '')).filter(Boolean);
}

/** Decides whether the calling website may use this endpoint (CORS). */
function checkOrigin(req) {
  const origin = String(req.headers.origin || '').replace(/\/+$/, '');
  if (!origin) return { allowed: true, origin: null }; // not a cross-site browser request
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return { allowed: false, origin: null };
  }
  if (host === req.headers.host) return { allowed: true, origin }; // same site
  const allowed = list(process.env.ALLOWED_ORIGINS);
  if (!allowed.length || allowed.includes(origin)) return { allowed: true, origin };
  return { allowed: false, origin: null };
}

/** Reads the JSON body (already parsed by Vercel, or read from the stream). */
async function readJson(req) {
  let raw;
  try {
    raw = req.body;
  } catch {
    return null; // Vercel throws on invalid JSON
  }
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  if (raw === undefined) {
    raw = await new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (data) => {
        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new Error('body_too_large'));
          req.destroy();
        } else {
          chunks.push(chunk);
        }
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    }).catch(() => null);
  }
  if (raw === null || raw === undefined) return null;
  try {
    const data = JSON.parse(String(raw));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

/** Forgets old entries when a map gets too big. */
function prune(map, maxAgeMs, now) {
  if (map.size <= MAX_TRACKED) return;
  for (const [key, times] of map) {
    if (!times.length || now - times[times.length - 1] >= maxAgeMs) map.delete(key);
  }
  if (map.size > MAX_TRACKED) map.clear();
}

/** null if this session may send now, otherwise the reason (and the wait in seconds). */
function checkSession(id, now = Date.now()) {
  const times = (sentBySession.get(id) || []).filter((time) => now - time < SESSION_LIMIT.keepMs);
  if (times.length >= SESSION_LIMIT.max) return { error: 'session_limit' };
  const last = times[times.length - 1];
  if (last !== undefined && now - last < SESSION_LIMIT.minIntervalMs) {
    return { error: 'too_soon', retryAfter: Math.ceil((SESSION_LIMIT.minIntervalMs - (now - last)) / 1000) };
  }
  return null;
}

function recordSession(id, now) {
  const times = (sentBySession.get(id) || []).filter((time) => now - time < SESSION_LIMIT.keepMs);
  times.push(now);
  sentBySession.set(id, times);
  prune(sentBySession, SESSION_LIMIT.keepMs, now);
}

/** The email could not be sent: the attempt must not use up the session's quota. */
function forgetSession(id, now) {
  const times = sentBySession.get(id);
  if (!times) return;
  const index = times.lastIndexOf(now);
  if (index >= 0) times.splice(index, 1);
  if (!times.length) sentBySession.delete(id);
}

/** Counts this attempt for the IP address; true if it is over the limit. */
function isIpLimited(ip, now = Date.now()) {
  const recent = (recentByIp.get(ip) || []).filter((time) => now - time < IP_LIMIT.windowMs);
  if (recent.length >= IP_LIMIT.max) {
    recentByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  recentByIp.set(ip, recent);
  prune(recentByIp, IP_LIMIT.windowMs, now);
  return false;
}

function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (char) => map[char]);
}

function buildEmail({ team, message, from, to }) {
  const who = team || 'Anonymous';
  const subject = `Brand Hunters feedback · ${who}`;
  const text = [
    'New feedback from the Brand Hunters scorekeeper',
    '',
    `Team: ${who}`,
    '',
    message,
  ].join('\n');
  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;padding:24px;background:#2B1528;color:#FBEBD7;border-radius:16px">
      <p style="margin:0 0 4px;color:#F8C787;font-size:12px;letter-spacing:3px;text-transform:uppercase">Brand Hunters</p>
      <h1 style="margin:0 0 16px;font-size:24px;font-style:italic">New feedback</h1>
      <p style="margin:0 0 16px"><strong>Team:</strong> ${escapeHtml(who)}</p>
      <div style="padding:16px;border-radius:12px;background:#FBE3C8;color:#2B1528;white-space:pre-wrap;line-height:1.5">${escapeHtml(message)}</div>
      <p style="margin:16px 0 0;color:#DDBBA7;font-size:12px">Sent from the feedback page of the Brand Hunters scorekeeper.</p>
    </div>`;
  return { from, to: list(to), subject, text, html };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const cors = checkOrigin(req);
  if (cors.origin) {
    res.setHeader('Access-Control-Allow-Origin', cors.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (!cors.allowed) return sendJson(res, 403, { ok: false, error: 'origin_not_allowed' });

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  const body = await readJson(req);
  if (!body) return sendJson(res, 400, { ok: false, error: 'invalid_body' });

  // Spam traps: a hidden field only bots fill in, or a form sent too fast.
  // We answer “ok” so bots don't learn anything, but nothing is sent.
  const elapsed = Number(body.elapsedMs);
  if (body.website || (Number.isFinite(elapsed) && elapsed < MIN_FILL_MS)) {
    return sendJson(res, 200, { ok: true });
  }

  const team = String(body.team || '').replace(/\s+/g, ' ').trim();
  const message = String(body.message || '').replace(/\r\n?/g, '\n').trim();
  if (!message) return sendJson(res, 400, { ok: false, error: 'message_required' });
  if (message.length > MAX_MESSAGE) return sendJson(res, 400, { ok: false, error: 'message_too_long' });
  if (team.length > MAX_TEAM) return sendJson(res, 400, { ok: false, error: 'team_too_long' });

  // Same limits as the page, for this browser session.
  const now = Date.now();
  const sessionId = SESSION_ID.test(String(body.sessionId || '')) ? String(body.sessionId) : null;
  if (sessionId) {
    const blocked = checkSession(sessionId, now);
    if (blocked) {
      if (blocked.retryAfter) res.setHeader('Retry-After', String(blocked.retryAfter));
      return sendJson(res, 429, { ok: false, ...blocked });
    }
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || (req.socket && req.socket.remoteAddress) || 'unknown';
  if (isIpLimited(ip, now)) return sendJson(res, 429, { ok: false, error: 'too_many_requests' });

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO;
  if (!apiKey || !list(to).length) {
    console.error('Feedback: RESEND_API_KEY or FEEDBACK_TO is not set.');
    return sendJson(res, 500, { ok: false, error: 'not_configured' });
  }

  const email = buildEmail({ team, message, from: process.env.FEEDBACK_FROM || DEFAULT_FROM, to });
  // Counted before sending, so two requests at the same moment can't both pass.
  if (sessionId) recordSession(sessionId, now);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(email),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`Feedback: Resend answered ${response.status}: ${detail.slice(0, 500)}`);
      if (sessionId) forgetSession(sessionId, now);
      return sendJson(res, 502, { ok: false, error: 'send_failed' });
    }
  } catch (error) {
    console.error('Feedback: could not reach Resend.', error);
    if (sessionId) forgetSession(sessionId, now);
    return sendJson(res, 502, { ok: false, error: 'send_failed' });
  }
  return sendJson(res, 200, { ok: true });
};

// Exposed for the tests.
module.exports.buildEmail = buildEmail;
