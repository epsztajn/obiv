const express = require('express');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sql = neon(process.env.DATABASE_URL);

// ─── Rate limiting ────────────────────────────────────────────────────────────
const rateBuckets = new Map();
function rateLimit(key, windowMs, max) {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now > b.resetAt) b = { count: 0, resetAt: now + windowMs };
  if (b.count >= max) { rateBuckets.set(key, b); return false; }
  b.count++;
  rateBuckets.set(key, b);
  return true;
}

// ─── Admin auth ───────────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function generateKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) key += '-';
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ─── DB init ──────────────────────────────────────────────────────────────────
async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS keys (
      id SERIAL PRIMARY KEY,
      key_hash TEXT UNIQUE NOT NULL,
      key_plain TEXT,
      used BOOLEAN DEFAULT FALSE,
      used_by_device TEXT,
      used_at TIMESTAMPTZ,
      blocked BOOLEAN DEFAULT FALSE,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      note TEXT,
      email TEXT,
      password_hash TEXT,
      username TEXT
    )
  `;
  await sql`ALTER TABLE keys ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql`ALTER TABLE keys ADD COLUMN IF NOT EXISTS password_hash TEXT`;
  await sql`ALTER TABLE keys ADD COLUMN IF NOT EXISTS username TEXT`;

  await sql`
    CREATE TABLE IF NOT EXISTS assistant_commands (
      id SERIAL PRIMARY KEY,
      cmd TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      response TEXT NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  const existing = await sql`SELECT COUNT(*) as c FROM assistant_commands`;
  if (parseInt(existing[0].c) === 0) {
    await sql`
      INSERT INTO assistant_commands (cmd, label, response) VALUES
      ('/instrukcja', 'Instrukcja', '<ol><li>Wejdź na stronę i dodaj do ekranu głównego</li><li>Uruchom aplikację z pulpitu</li><li>Wpisz otrzymany klucz — <strong>ZAPISZ GO!</strong></li><li>Ustaw hasło przy pierwszym logowaniu</li></ol>'),
      ('/pomoc', 'Pomoc (ticket)', 'Aby uzyskać pomoc, skontaktuj się z administratorem na Discordzie.'),
      ('/aktualizacja', 'Aktualizacja aplikacji', 'Aby zaktualizować aplikację, usuń ją z ekranu głównego i dodaj ponownie.')
      ON CONFLICT DO NOTHING
    `;
  }
  console.log('DB initialized');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/activate/check — sprawdź klucz
app.post('/api/activate/check', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`act_check:${ip}`, 5 * 60 * 1000, 10)) return res.status(429).json({ error: 'RATE_LIMITED' });

  const { hash } = req.body;
  if (!hash) return res.status(400).json({ error: 'KEY_INVALID' });

  try {
    const rows = await sql`SELECT * FROM keys WHERE key_hash = ${hash} LIMIT 1`;
    if (!rows.length) return res.status(400).json({ error: 'KEY_INVALID' });
    const key = rows[0];
    if (key.blocked) return res.status(400).json({ error: 'KEY_BLOCKED' });
    if (key.expires_at && new Date(key.expires_at) < new Date()) return res.status(400).json({ error: 'KEY_EXPIRED' });
    if (key.used) return res.status(400).json({ error: 'KEY_ALREADY_USED' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('activate/check error:', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/activate/complete — ustaw username + hasło, aktywuj klucz
app.post('/api/activate/complete', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`act_complete:${ip}`, 5 * 60 * 1000, 10)) return res.status(429).json({ error: 'RATE_LIMITED' });

  const { hash, username, password, deviceId } = req.body;
  if (!hash || !username || !password) return res.status(400).json({ error: 'MISSING_FIELDS' });
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) return res.status(400).json({ error: 'USERNAME_INVALID' });
  if (password.length < 6) return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });

  try {
    const rows = await sql`SELECT * FROM keys WHERE key_hash = ${hash} LIMIT 1`;
    if (!rows.length) return res.status(400).json({ error: 'KEY_INVALID' });
    const key = rows[0];
    if (key.blocked) return res.status(400).json({ error: 'KEY_BLOCKED' });
    if (key.used) return res.status(400).json({ error: 'KEY_ALREADY_USED' });

    // Sprawdź czy username wolny
    const taken = await sql`SELECT id FROM keys WHERE username = ${username} LIMIT 1`;
    if (taken.length) return res.status(400).json({ error: 'USERNAME_TAKEN' });

    const pwHash = sha256(password);
    await sql`
      UPDATE keys SET
        used = TRUE,
        used_by_device = ${deviceId || null},
        used_at = NOW(),
        username = ${username},
        password_hash = ${pwHash}
      WHERE key_hash = ${hash}
    `;
    return res.json({ ok: true });
  } catch (e) {
    console.error('activate/complete error:', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`login:${ip}`, 5 * 60 * 1000, 10)) return res.status(429).json({ error: 'RATE_LIMITED' });

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'MISSING_FIELDS' });

  try {
    const pwHash = sha256(password);
    const rows = await sql`
      SELECT * FROM keys WHERE username = ${username} AND password_hash = ${pwHash} LIMIT 1
    `;
    if (!rows.length) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    const key = rows[0];
    if (key.blocked) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

    const token = generateToken();
    return res.json({ ok: true, token, keyHash: key.key_hash });
  } catch (e) {
    console.error('login error:', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/validate
app.post('/api/validate', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`validate:${ip}`, 60 * 1000, 20)) return res.status(429).json({ error: 'RATE_LIMITED' });

  const { hash } = req.body;
  if (!hash) return res.status(400).json({ valid: false });

  try {
    const rows = await sql`SELECT * FROM keys WHERE key_hash = ${hash} LIMIT 1`;
    if (!rows.length) return res.json({ valid: false });
    const key = rows[0];
    if (key.blocked || (key.expires_at && new Date(key.expires_at) < new Date())) return res.json({ valid: false });
    return res.json({ valid: true });
  } catch (e) {
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /api/assistant/commands
app.get('/api/assistant/commands', async (req, res) => {
  try {
    const rows = await sql`SELECT cmd, label, response FROM assistant_commands WHERE active = TRUE ORDER BY id`;
    res.json({ commands: rows });
  } catch (e) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN API
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'Nieprawidłowe hasło' });
  res.json({ token: process.env.ADMIN_TOKEN });
});

app.get('/api/admin/keys', adminAuth, async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM keys ORDER BY created_at DESC`;
    res.json({ keys: rows });
  } catch (e) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/admin/keys/generate', adminAuth, async (req, res) => {
  const count = Math.min(parseInt(req.body.count) || 1, 100);
  const expiresAt = req.body.expires_at || null;
  const note = req.body.note || null;
  const generated = [];
  for (let i = 0; i < count; i++) {
    const plain = generateKey();
    const hash = sha256(plain);
    try {
      await sql`INSERT INTO keys (key_hash, key_plain, expires_at, note) VALUES (${hash}, ${plain}, ${expiresAt}, ${note}) ON CONFLICT DO NOTHING`;
      generated.push(plain);
    } catch (e) { console.error('generate key error:', e); }
  }
  res.json({ keys: generated });
});

app.post('/api/admin/keys/:id/block', adminAuth, async (req, res) => {
  await sql`UPDATE keys SET blocked = TRUE WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

app.post('/api/admin/keys/:id/unblock', adminAuth, async (req, res) => {
  await sql`UPDATE keys SET blocked = FALSE WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

app.put('/api/admin/keys/:id', adminAuth, async (req, res) => {
  const { username, note, expires_at } = req.body;
  await sql`
    UPDATE keys SET
      username = COALESCE(${username || null}, username),
      note = COALESCE(${note || null}, note),
      expires_at = COALESCE(${expires_at || null}, expires_at)
    WHERE id = ${req.params.id}
  `;
  res.json({ ok: true });
});

app.post('/api/admin/keys/:id/reset-password', adminAuth, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Hasło min. 6 znaków' });
  const pwHash = sha256(password);
  await sql`UPDATE keys SET password_hash = ${pwHash} WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

app.delete('/api/admin/keys/:id', adminAuth, async (req, res) => {
  await sql`DELETE FROM keys WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

app.get('/api/admin/commands', adminAuth, async (req, res) => {
  const rows = await sql`SELECT * FROM assistant_commands ORDER BY id`;
  res.json({ commands: rows });
});

app.post('/api/admin/commands', adminAuth, async (req, res) => {
  const { cmd, label, response } = req.body;
  if (!cmd || !label || !response) return res.status(400).json({ error: 'Wymagane: cmd, label, response' });
  const normalized = cmd.startsWith('/') ? cmd : '/' + cmd;
  try {
    const rows = await sql`INSERT INTO assistant_commands (cmd, label, response) VALUES (${normalized}, ${label}, ${response}) RETURNING *`;
    res.json({ command: rows[0] });
  } catch (e) {
    if (e.message.includes('unique')) return res.status(400).json({ error: 'Komenda już istnieje' });
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.put('/api/admin/commands/:id', adminAuth, async (req, res) => {
  const { label, response, active } = req.body;
  await sql`UPDATE assistant_commands SET label = COALESCE(${label}, label), response = COALESCE(${response}, response), active = COALESCE(${active}, active) WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

app.delete('/api/admin/commands/:id', adminAuth, async (req, res) => {
  await sql`DELETE FROM assistant_commands WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// ─── Catch-all ────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
initDb().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(e => {
  console.error('DB init failed:', e);
  process.exit(1);
});