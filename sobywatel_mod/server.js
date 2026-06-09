const express = require('express');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '5mb' }));
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
  // Tabela kluczy
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
      username TEXT,
      password_hash TEXT,
      can_create BOOLEAN DEFAULT TRUE,
      can_edit BOOLEAN DEFAULT TRUE,
      can_delete BOOLEAN DEFAULT TRUE,
      card_limit INT DEFAULT NULL
    )
  `;
  // Migracje – dodaj kolumny jeśli ich nie ma
  await sql`ALTER TABLE keys ADD COLUMN IF NOT EXISTS username TEXT`;
  await sql`ALTER TABLE keys ADD COLUMN IF NOT EXISTS password_hash TEXT`;
  await sql`ALTER TABLE keys ADD COLUMN IF NOT EXISTS can_create BOOLEAN DEFAULT TRUE`;
  await sql`ALTER TABLE keys ADD COLUMN IF NOT EXISTS can_edit BOOLEAN DEFAULT TRUE`;
  await sql`ALTER TABLE keys ADD COLUMN IF NOT EXISTS can_delete BOOLEAN DEFAULT TRUE`;
  await sql`ALTER TABLE keys ADD COLUMN IF NOT EXISTS card_limit INT DEFAULT NULL`;

  // Tabela sesji (trwałe, 30 dni)
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      key_id INT REFERENCES keys(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Tabela kart
  await sql`
    CREATE TABLE IF NOT EXISTS cards (
      id SERIAL PRIMARY KEY,
      card_token TEXT UNIQUE NOT NULL,
      key_id INT REFERENCES keys(id) ON DELETE CASCADE,
      username TEXT,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Tabela komend asystenta
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

// ─── Helper: pobierz klucz z sesji ───────────────────────────────────────────
async function getKeyFromSession(session) {
  if (!session) return null;
  const rows = await sql`
    SELECT k.* FROM sessions s
    JOIN keys k ON k.id = s.key_id
    WHERE s.token = ${session}
      AND s.created_at > NOW() - INTERVAL '30 days'
    LIMIT 1
  `;
  if (!rows.length) return null;
  const key = rows[0];
  if (key.blocked) return null;
  return key;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/activate/check
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

// POST /api/activate/complete
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
    await sql`INSERT INTO sessions (token, key_id) VALUES (${token}, ${key.id})`;

    return res.json({ ok: true, token });
  } catch (e) {
    console.error('login error:', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/logout
app.post('/api/logout', async (req, res) => {
  const { session } = req.body;
  if (session) {
    try { await sql`DELETE FROM sessions WHERE token = ${session}`; } catch (_) {}
  }
  res.json({ ok: true });
});

// POST /api/validate — weryfikacja klucza aktywacyjnego (PWA start)
app.post('/api/validate', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`validate_key:${ip}`, 60 * 1000, 20)) {
    return res.status(429).json({ valid: false, error: 'RATE_LIMITED' });
  }

  const { hash } = req.body;
  if (!hash) return res.json({ valid: false });

  try {
    const key = await getKeyFromActivationHash(hash);
    return res.json({ valid: !!key });
  } catch (e) {
    console.error('validate error:', e);
    return res.status(500).json({ valid: false });
  }
});

// POST /api/session/validate
app.post('/api/session/validate', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`validate:${ip}`, 60 * 1000, 30)) return res.status(429).json({ error: 'RATE_LIMITED' });

  const { session } = req.body;
  try {
    const key = await getKeyFromSession(session);
    if (!key) return res.json({ valid: false });
    return res.json({ valid: true });
  } catch (e) {
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/me
app.post('/api/me', async (req, res) => {
  const { session } = req.body;
  try {
    const key = await getKeyFromSession(session);
    if (!key) return res.status(401).json({ ok: false });
    return res.json({
      ok: true,
      username: key.username,
      cardLimit: key.card_limit,
      canCreate: key.can_create !== false,
      canEdit: key.can_edit !== false,
      canDelete: key.can_delete !== false
    });
  } catch (e) {
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/cards — lista kart usera
app.post('/api/cards', async (req, res) => {
  const { session } = req.body;
  try {
    const key = await getKeyFromSession(session);
    if (!key) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const cards = await sql`
      SELECT id, card_token, data->'firstName' as first_name, data->'lastName' as last_name,
             data->'pageType' as page_type,
             data->'birthDay' as birth_day, data->'birthMonth' as birth_month, data->'birthYear' as birth_year,
             created_at
      FROM cards WHERE key_id = ${key.id} ORDER BY created_at DESC
    `;
    return res.json({ cards });
  } catch (e) {
    console.error('cards error:', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/submit — zapisz/edytuj kartę
app.post('/api/submit', async (req, res) => {
  const { session, id, data } = req.body;
  try {
    const key = await getKeyFromSession(session);
    if (!key) return res.status(401).json({ error: 'UNAUTHORIZED' });

    if (id) {
      // Edycja – sprawdź czy karta należy do usera
      if (key.can_edit === false) return res.status(403).json({ error: 'NO_PERMISSION' });
      const existing = await sql`SELECT * FROM cards WHERE id = ${id} AND key_id = ${key.id} LIMIT 1`;
      if (!existing.length) return res.status(404).json({ error: 'NOT_FOUND' });

      await sql`UPDATE cards SET data = ${data} WHERE id = ${id}`;
      return res.json({ ok: true, card_token: existing[0].card_token });
    } else {
      // Nowa karta
      if (key.can_create === false) return res.status(403).json({ error: 'NO_PERMISSION' });

      // Sprawdź limit
      if (key.card_limit !== null) {
        const count = await sql`SELECT COUNT(*) as c FROM cards WHERE key_id = ${key.id}`;
        if (parseInt(count[0].c) >= key.card_limit) {
          return res.status(403).json({ error: 'CARD_LIMIT_REACHED' });
        }
      }

      const cardToken = generateToken();
      await sql`
        INSERT INTO cards (card_token, key_id, username, data)
        VALUES (${cardToken}, ${key.id}, ${key.username}, ${data})
      `;
      return res.json({ ok: true, card_token: cardToken });
    }
  } catch (e) {
    console.error('submit error:', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/card-full — pełne dane karty (do edycji)
app.post('/api/card-full', async (req, res) => {
  const { session, id } = req.body;
  try {
    const key = await getKeyFromSession(session);
    if (!key) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const rows = await sql`SELECT data FROM cards WHERE id = ${id} AND key_id = ${key.id} LIMIT 1`;
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({ data: rows[0].data });
  } catch (e) {
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/delete-card
app.post('/api/delete-card', async (req, res) => {
  const { session, id } = req.body;
  try {
    const key = await getKeyFromSession(session);
    if (!key) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (key.can_delete === false) return res.status(403).json({ error: 'NO_PERMISSION' });

    await sql`DELETE FROM cards WHERE id = ${id} AND key_id = ${key.id}`;
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /get/card?card_token=xxx — dane karty bez zdjęcia (dla mObywatela)
app.get('/get/card', async (req, res) => {
  const { card_token } = req.query;
  if (!card_token) return res.status(400).json({ error: 'MISSING_TOKEN' });
  try {
    const rows = await sql`SELECT data FROM cards WHERE card_token = ${card_token} LIMIT 1`;
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND' });
    const data = { ...rows[0].data };
    delete data.photo; // nie wysyłaj zdjęcia tutaj
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /images?card_token=xxx — zdjęcie karty
app.get('/images', async (req, res) => {
  const { card_token } = req.query;
  if (!card_token) return res.status(400).end();
  try {
    const rows = await sql`SELECT data->>'photo' as photo FROM cards WHERE card_token = ${card_token} LIMIT 1`;
    if (!rows.length || !rows[0].photo) return res.status(404).end();

    const base64 = rows[0].photo;
    // Obsłuż zarówno "data:image/...;base64,..." jak i samo base64
    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const buf = Buffer.from(match[2], 'base64');
      res.set('Content-Type', mimeType);
      return res.send(buf);
    }
    const buf = Buffer.from(base64, 'base64');
    res.set('Content-Type', 'image/jpeg');
    return res.send(buf);
  } catch (e) {
    return res.status(500).end();
  }
});

// ─── Helper: klucz z hasha aktywacji (PWA) ───────────────────────────────────
async function getKeyFromActivationHash(hash) {
  if (!hash) return null;
  const rows = await sql`
    SELECT * FROM keys
    WHERE key_hash = ${hash} AND used = TRUE
    LIMIT 1
  `;
  if (!rows.length) return null;
  const key = rows[0];
  if (key.blocked) return null;
  return key;
}

// POST /api/kreator/save — zapis danych z czatu /kreator (Neon)
app.post('/api/kreator/save', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`kreator:${ip}`, 60 * 1000, 15)) {
    return res.status(429).json({ error: 'RATE_LIMITED' });
  }

  const { hash, card_token, data } = req.body;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'MISSING_FIELDS' });
  }

  try {
    // Aktualizacja istniejącej strony — card_token z linku generatora jest sekretem
    if (card_token) {
      const existing = await sql`
        SELECT id, card_token FROM cards WHERE card_token = ${card_token} LIMIT 1
      `;
      if (!existing.length) return res.status(404).json({ error: 'CARD_NOT_FOUND' });

      await sql`UPDATE cards SET data = ${data} WHERE id = ${existing[0].id}`;
      return res.json({ ok: true, card_token: existing[0].card_token });
    }

    // Nowa karta — wymaga hasha klucza aktywacyjnego użytkownika PWA
    if (!hash) return res.status(400).json({ error: 'MISSING_TOKEN' });

    const key = await getKeyFromActivationHash(hash);
    if (!key) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (key.can_create === false) return res.status(403).json({ error: 'NO_PERMISSION' });

    if (key.card_limit !== null) {
      const count = await sql`SELECT COUNT(*) as c FROM cards WHERE key_id = ${key.id}`;
      if (parseInt(count[0].c) >= key.card_limit) {
        return res.status(403).json({ error: 'CARD_LIMIT_REACHED' });
      }
    }

    const newToken = generateToken();
    await sql`
      INSERT INTO cards (card_token, key_id, username, data)
      VALUES (${newToken}, ${key.id}, ${key.username}, ${data})
    `;
    return res.json({ ok: true, card_token: newToken });
  } catch (e) {
    console.error('kreator/save error:', e);
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

// Klucze
app.get('/api/admin/keys', adminAuth, async (req, res) => {
  try {
    const rows = await sql`
      SELECT k.*, (SELECT COUNT(*) FROM cards c WHERE c.key_id = k.id) as card_count
      FROM keys k ORDER BY k.created_at DESC
    `;
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
  const { note, expires_at } = req.body;
  await sql`
    UPDATE keys SET
      note = COALESCE(${note !== undefined ? note : null}, note),
      expires_at = COALESCE(${expires_at || null}, expires_at)
    WHERE id = ${req.params.id}
  `;
  res.json({ ok: true });
});

app.delete('/api/admin/keys/:id', adminAuth, async (req, res) => {
  await sql`DELETE FROM keys WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// Użytkownicy (admin)
app.post('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const rows = await sql`
      SELECT k.id, k.username, k.blocked, k.can_create, k.can_edit, k.can_delete, k.card_limit, k.created_at,
             (SELECT COUNT(*) FROM cards c WHERE c.key_id = k.id) as card_count
      FROM keys k WHERE k.used = TRUE ORDER BY k.used_at DESC
    `;
    res.json({ users: rows });
  } catch (e) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/admin/users/:id/permissions', adminAuth, async (req, res) => {
  const { can_create, can_edit, can_delete, card_limit, blocked } = req.body;
  try {
    await sql`
      UPDATE keys SET
        can_create = COALESCE(${can_create !== undefined ? can_create : null}, can_create),
        can_edit = COALESCE(${can_edit !== undefined ? can_edit : null}, can_edit),
        can_delete = COALESCE(${can_delete !== undefined ? can_delete : null}, can_delete),
        card_limit = ${card_limit !== undefined ? (card_limit === null ? null : parseInt(card_limit)) : sql`card_limit`},
        blocked = COALESCE(${blocked !== undefined ? blocked : null}, blocked)
      WHERE id = ${req.params.id}
    `;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/admin/users/:id/reset-password', adminAuth, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Hasło min. 6 znaków' });
  const pwHash = sha256(password);
  await sql`UPDATE keys SET password_hash = ${pwHash} WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  // Usuń sesje i karty przez CASCADE, potem klucz
  await sql`DELETE FROM keys WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// Karty (admin)
app.post('/api/admin/cards', adminAuth, async (req, res) => {
  try {
    const rows = await sql`
      SELECT c.id, c.card_token, c.username, c.created_at,
             c.data->>'firstName' as first_name, c.data->>'lastName' as last_name,
             c.data->>'pesel' as pesel
      FROM cards c ORDER BY c.created_at DESC
    `;
    res.json({ cards: rows });
  } catch (e) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.delete('/api/admin/cards/:id', adminAuth, async (req, res) => {
  await sql`DELETE FROM cards WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// Komendy (admin)
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
  await sql`UPDATE assistant_commands SET
    label = COALESCE(${label !== undefined ? label : null}, label),
    response = COALESCE(${response !== undefined ? response : null}, response),
    active = COALESCE(${active !== undefined ? active : null}, active)
    WHERE id = ${req.params.id}`;
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
