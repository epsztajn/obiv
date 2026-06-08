const express = require('express');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sql = neon(process.env.DATABASE_URL);

// ─── Gmail transporter ────────────────────────────────────────────────────────
function getMailer() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

async function sendVerificationEmail(toEmail, code) {
  const mailer = getMailer();
  if (!mailer) return;
  await mailer.sendMail({
    from: `"sObywatel" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: '🔐 Twój kod weryfikacyjny sObywatel',
    html: `
      <div style="font-family:Roboto,Arial,sans-serif;max-width:480px;margin:auto;padding:32px 24px;background:#f5f7fa;border-radius:16px;">
        <h2 style="margin:0 0 8px;color:#111827;">Weryfikacja e-mail</h2>
        <p style="color:#6b7280;margin:0 0 24px;">Wpisz poniższy kod na stronie aktywacji, aby potwierdzić swój adres e-mail i ustawić hasło.</p>
        <div style="background:#fff;border-radius:12px;padding:24px 20px;border:1px solid #e5e7eb;margin-bottom:24px;text-align:center;">
          <div style="font-size:12px;color:#9ca3af;margin-bottom:8px;letter-spacing:1px;">KOD WERYFIKACYJNY</div>
          <div style="font-family:monospace;font-size:36px;font-weight:700;letter-spacing:8px;color:#111827;">${code}</div>
        </div>
        <p style="font-size:13px;color:#9ca3af;margin:0;">Kod jest ważny przez 15 minut. Jeśli nie próbowałeś/aś aktywować konta, zignoruj tę wiadomość.</p>
      </div>
    `,
  });
}

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
      password_hash TEXT
    )
  `;
  // Dodaj kolumny jeśli tabela już istniała bez nich
  await sql`ALTER TABLE keys ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql`ALTER TABLE keys ADD COLUMN IF NOT EXISTS password_hash TEXT`;

  await sql`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id SERIAL PRIMARY KEY,
      key_hash TEXT NOT NULL,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
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
  await sql`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id SERIAL PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
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

// ─── SHA-256 ──────────────────────────────────────────────────────────────────
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/activate/request
// Krok 1: sprawdź klucz + email, wyślij kod weryfikacyjny
app.post('/api/activate/request', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`activate_req:${ip}`, 5 * 60 * 1000, 5)) {
    return res.status(429).json({ error: 'RATE_LIMITED' });
  }

  const { hash, email } = req.body;
  if (!hash || typeof hash !== 'string') return res.status(400).json({ error: 'KEY_INVALID' });
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'EMAIL_INVALID' });
  }

  try {
    const rows = await sql`SELECT * FROM keys WHERE key_hash = ${hash} LIMIT 1`;
    if (!rows.length) return res.status(400).json({ error: 'KEY_INVALID' });
    const key = rows[0];
    if (key.blocked) return res.status(400).json({ error: 'KEY_BLOCKED' });
    if (key.expires_at && new Date(key.expires_at) < new Date()) return res.status(400).json({ error: 'KEY_EXPIRED' });
    if (key.used && key.used_by_device) return res.status(400).json({ error: 'KEY_ALREADY_USED' });

    // Usuń stare kody dla tego klucza
    await sql`DELETE FROM email_verifications WHERE key_hash = ${hash}`;

    // Wygeneruj i zapisz nowy kod (ważny 15 min)
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await sql`
      INSERT INTO email_verifications (key_hash, email, code, expires_at)
      VALUES (${hash}, ${email}, ${code}, ${expiresAt.toISOString()})
    `;

    // Wyślij mail
    await sendVerificationEmail(email, code);

    return res.json({ ok: true });
  } catch (e) {
    console.error('activate/request error:', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/activate/verify-code
// Krok 2: tylko sprawdź kod — oznacz jako zweryfikowany ale nie aktywuj jeszcze
app.post('/api/activate/verify-code', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`verify_code:${ip}`, 5 * 60 * 1000, 10)) {
    return res.status(429).json({ error: 'RATE_LIMITED' });
  }

  const { hash, code } = req.body;
  if (!hash || !code) return res.status(400).json({ error: 'MISSING_FIELDS' });

  try {
    const verRows = await sql`
      SELECT * FROM email_verifications
      WHERE key_hash = ${hash} AND used = FALSE
      ORDER BY created_at DESC LIMIT 1
    `;
    if (!verRows.length) return res.status(400).json({ error: 'CODE_INVALID' });
    const ver = verRows[0];
    if (new Date(ver.expires_at) < new Date()) return res.status(400).json({ error: 'CODE_EXPIRED' });
    if (ver.code !== String(code).trim()) return res.status(400).json({ error: 'CODE_INVALID' });

    // Oznacz kod jako użyty (email zweryfikowany)
    await sql`UPDATE email_verifications SET used = TRUE WHERE id = ${ver.id}`;
    // Zapisz flagę w tabeli verifications że ten hash jest zweryfikowany
    await sql`
      INSERT INTO email_verifications (key_hash, email, code, expires_at, used)
      VALUES (${hash}, ${ver.email}, '__verified__', ${new Date(Date.now() + 30 * 60 * 1000).toISOString()}, FALSE)
    `;

    return res.json({ ok: true });
  } catch (e) {
    console.error('verify-code error:', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/activate/verify
// Krok 3: ustaw hasło — wymaga wcześniejszej weryfikacji kodu
app.post('/api/activate/verify', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`activate_verify:${ip}`, 5 * 60 * 1000, 10)) {
    return res.status(429).json({ error: 'RATE_LIMITED' });
  }

  const { hash, password, deviceId } = req.body;
  if (!hash || !password) return res.status(400).json({ error: 'MISSING_FIELDS' });
  if (password.length < 6) return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });

  try {
    // Sprawdź czy kod był zweryfikowany
    const verRows = await sql`
      SELECT * FROM email_verifications
      WHERE key_hash = ${hash} AND code = '__verified__' AND used = FALSE
      ORDER BY created_at DESC LIMIT 1
    `;
    if (!verRows.length) return res.status(400).json({ error: 'CODE_INVALID' });
    const ver = verRows[0];
    if (new Date(ver.expires_at) < new Date()) return res.status(400).json({ error: 'CODE_EXPIRED' });

    // Zużyj token weryfikacji
    await sql`UPDATE email_verifications SET used = TRUE WHERE id = ${ver.id}`;

    // Aktywuj klucz
    const pwHash = sha256(password);
    await sql`
      UPDATE keys
      SET used = TRUE,
          used_by_device = ${deviceId || null},
          used_at = NOW(),
          email = ${ver.email},
          password_hash = ${pwHash}
      WHERE key_hash = ${hash}
    `;

    return res.json({ ok: true });
  } catch (e) {
    console.error('activate/verify error:', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/validate
app.post('/api/validate', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`validate:${ip}`, 60 * 1000, 20)) return res.status(429).json({ error: 'RATE_LIMITED' });

  const { hash, deviceId } = req.body;
  if (!hash) return res.status(400).json({ valid: false });

  try {
    const rows = await sql`SELECT * FROM keys WHERE key_hash = ${hash} LIMIT 1`;
    if (!rows.length) return res.json({ valid: false });
    const key = rows[0];
    if (key.blocked || (key.expires_at && new Date(key.expires_at) < new Date())) {
      return res.json({ valid: false });
    }
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
      await sql`
        INSERT INTO keys (key_hash, key_plain, expires_at, note)
        VALUES (${hash}, ${plain}, ${expiresAt}, ${note})
        ON CONFLICT DO NOTHING
      `;
      generated.push(plain);
    } catch (e) {
      console.error('generate key error:', e);
    }
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
    const rows = await sql`
      INSERT INTO assistant_commands (cmd, label, response) VALUES (${normalized}, ${label}, ${response}) RETURNING *
    `;
    res.json({ command: rows[0] });
  } catch (e) {
    if (e.message.includes('unique')) return res.status(400).json({ error: 'Komenda już istnieje' });
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.put('/api/admin/commands/:id', adminAuth, async (req, res) => {
  const { label, response, active } = req.body;
  await sql`
    UPDATE assistant_commands
    SET label = COALESCE(${label}, label),
        response = COALESCE(${response}, response),
        active = COALESCE(${active}, active)
    WHERE id = ${req.params.id}
  `;
  res.json({ ok: true });
});

app.delete('/api/admin/commands/:id', adminAuth, async (req, res) => {
  await sql`DELETE FROM assistant_commands WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// ─── Helper: generuj klucz XXXX-XXXX-XXXX-XXXX ───────────────────────────────
function generateKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) key += '-';
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

// ─── Catch-all SPA ────────────────────────────────────────────────────────────
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
