require('dotenv').config();
const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const app = express();
app.use(express.json({ limit: '10mb' }));

// ============================================
// DATABASE
// ============================================
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || './data';
const fs = require('fs');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'replygenius.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_review_id TEXT UNIQUE,
    author TEXT,
    rating INTEGER,
    text TEXT,
    review_date TEXT,
    status TEXT DEFAULT 'pending',
    ai_reply TEXT,
    approved_reply TEXT,
    tone TEXT DEFAULT 'professional',
    keywords_used TEXT,
    replied_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Default settings
const defaultSettings = {
  business_name: 'Green Rose Cleaners',
  business_type: 'residential cleaning service',
  keywords: 'residential cleaning, house cleaning, deep cleaning, Puerto Rico, eco-friendly, professional cleaners',
  tone: 'professional',
  auto_generate: 'true',
  webhook_secret: process.env.WEBHOOK_SECRET || require('crypto').randomBytes(16).toString('hex')
};
Object.entries(defaultSettings).forEach(([k, v]) => {
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(k, v);
});

// Always sync webhook secret from env var if provided
if (process.env.WEBHOOK_SECRET) {
  setSetting('webhook_secret', process.env.WEBHOOK_SECRET);
}
const getSetting = (key) => db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value;
const setSetting = (key, val) => db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, val);

console.log('Database initialized');
console.log('Webhook secret:', getSetting('webhook_secret'));

// ============================================
// AI REPLY GENERATION
// ============================================
async function generateReply(review) {
  const businessName = getSetting('business_name');
  const businessType = getSetting('business_type');
  const keywords = getSetting('keywords');
  const tone = review.tone || getSetting('tone');

  const systemPrompt = `You are an expert Google Business Profile review reply specialist for "${businessName}", a ${businessType}.

RULES:
- Write a reply to the customer review below
- Naturally include the business name "${businessName}" once
- Weave in 1-2 of these SEO keywords where natural: ${keywords}
- Tone: ${tone}
- Keep it 2-4 sentences max
- For positive reviews (4-5 stars): Thank them, mention a specific detail from their review, invite them back
- For neutral reviews (3 stars): Thank them, acknowledge the feedback, mention what you're doing to improve
- For negative reviews (1-2 stars): Apologize sincerely, take responsibility, offer to make it right offline
- NEVER be defensive or argumentative
- Sound human, not robotic
- Do NOT use exclamation marks more than once
- Do NOT start with "Dear"`;

  const userPrompt = `Review by ${review.author} (${review.rating}/5 stars):\n"${review.text}"`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
    const data = await res.json();
    const reply = data.content?.[0]?.text || '';

    // Check which keywords were used
    const kws = keywords.split(',').map(k => k.trim().toLowerCase());
    const used = kws.filter(k => reply.toLowerCase().includes(k));

    return { reply, keywords_used: used };
  } catch (e) {
    console.error('[AI ERROR]', e.message);
    return { reply: '', keywords_used: [] };
  }
}

// ============================================
// ZAPIER WEBHOOK — receives new reviews
// ============================================
app.post('/api/webhook/new-review', async (req, res) => {
  const secret = req.headers['x-webhook-secret'] || req.query.secret;
  if (secret !== getSetting('webhook_secret')) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const { reviewer_name, star_rating, review_text, review_id, review_date } = req.body;
  if (!review_text && !star_rating) return res.status(400).json({ error: 'Missing review data' });

  const author = reviewer_name || 'Customer';
  const rating = parseInt(star_rating) || 3;
  const text = review_text || '';
  const gId = review_id || `manual-${Date.now()}`;
  const date = review_date || new Date().toISOString();

  // Check duplicate
  const existing = db.prepare("SELECT id FROM reviews WHERE google_review_id = ?").get(gId);
  if (existing) return res.json({ success: true, message: 'Already exists', id: existing.id });

  // Insert review
  const result = db.prepare("INSERT INTO reviews (google_review_id, author, rating, text, review_date) VALUES (?, ?, ?, ?, ?)").run(gId, author, rating, text, date);
  const reviewId = result.lastInsertRowid;

  // Auto-generate reply if enabled
  if (getSetting('auto_generate') === 'true' && process.env.ANTHROPIC_API_KEY) {
    const { reply, keywords_used } = await generateReply({ author, rating, text, tone: getSetting('tone') });
    if (reply) {
      db.prepare("UPDATE reviews SET ai_reply = ?, keywords_used = ?, status = 'ready' WHERE id = ?").run(reply, JSON.stringify(keywords_used), reviewId);
    }
  }

  console.log(`[NEW REVIEW] ${author} - ${rating}★ - ${text.substring(0, 50)}...`);
  res.json({ success: true, id: reviewId });
});

// ============================================
// API ROUTES
// ============================================

// Get all reviews
app.get('/api/reviews', (req, res) => {
  const { status } = req.query;
  let rows;
  if (status && status !== 'all') {
    rows = db.prepare("SELECT * FROM reviews WHERE status = ? ORDER BY created_at DESC").all(status);
  } else {
    rows = db.prepare("SELECT * FROM reviews ORDER BY created_at DESC").all();
  }
  rows = rows.map(r => ({ ...r, keywords_used: r.keywords_used ? JSON.parse(r.keywords_used) : [] }));
  res.json(rows);
});

// Generate/regenerate AI reply
app.post('/api/reviews/:id/generate', async (req, res) => {
  const review = db.prepare("SELECT * FROM reviews WHERE id = ?").get(req.params.id);
  if (!review) return res.status(404).json({ error: 'Not found' });

  const tone = req.body.tone || getSetting('tone');
  const { reply, keywords_used } = await generateReply({ ...review, tone });
  if (reply) {
    db.prepare("UPDATE reviews SET ai_reply = ?, keywords_used = ?, tone = ?, status = 'ready' WHERE id = ?").run(reply, JSON.stringify(keywords_used), tone, review.id);
    res.json({ success: true, reply, keywords_used });
  } else {
    res.status(500).json({ error: 'Failed to generate' });
  }
});

// Approve reply (optionally edit)
app.post('/api/reviews/:id/approve', (req, res) => {
  const { reply } = req.body;
  const review = db.prepare("SELECT * FROM reviews WHERE id = ?").get(req.params.id);
  if (!review) return res.status(404).json({ error: 'Not found' });
  const finalReply = reply || review.ai_reply;
  db.prepare("UPDATE reviews SET approved_reply = ?, status = 'approved', replied_at = datetime('now') WHERE id = ?").run(finalReply, review.id);
  res.json({ success: true, reply: finalReply });
});

// Mark as posted (Zapier calls this after posting to Google)
app.post('/api/reviews/:id/posted', (req, res) => {
  db.prepare("UPDATE reviews SET status = 'posted' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Get approved replies ready for Zapier to post
app.get('/api/reviews/approved', (req, res) => {
  const rows = db.prepare("SELECT id, google_review_id, approved_reply FROM reviews WHERE status = 'approved'").all();
  res.json(rows);
});

// Add review manually
app.post('/api/reviews/add', async (req, res) => {
  const { author, rating, text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });
  const gId = `manual-${Date.now()}`;
  const result = db.prepare("INSERT INTO reviews (google_review_id, author, rating, text, review_date) VALUES (?, ?, ?, ?, datetime('now'))").run(gId, author || 'Customer', parseInt(rating) || 5, text);
  const reviewId = result.lastInsertRowid;

  // Auto-generate
  if (getSetting('auto_generate') === 'true' && process.env.ANTHROPIC_API_KEY) {
    const { reply, keywords_used } = await generateReply({ author: author || 'Customer', rating: parseInt(rating) || 5, text, tone: getSetting('tone') });
    if (reply) {
      db.prepare("UPDATE reviews SET ai_reply = ?, keywords_used = ?, status = 'ready' WHERE id = ?").run(reply, JSON.stringify(keywords_used), reviewId);
    }
  }

  res.json({ success: true, id: reviewId });
});

// Delete review
app.delete('/api/reviews/:id', (req, res) => {
  db.prepare("DELETE FROM reviews WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Settings
app.get('/api/settings', (req, res) => {
  const rows = db.prepare("SELECT * FROM settings").all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  Object.entries(req.body).forEach(([k, v]) => {
    if (k !== 'webhook_secret') setSetting(k, v);
  });
  res.json({ success: true });
});

// Stats
app.get('/api/stats', (req, res) => {
  const total = db.prepare("SELECT COUNT(*) as cnt FROM reviews").get().cnt;
  const pending = db.prepare("SELECT COUNT(*) as cnt FROM reviews WHERE status = 'pending'").get().cnt;
  const ready = db.prepare("SELECT COUNT(*) as cnt FROM reviews WHERE status = 'ready'").get().cnt;
  const approved = db.prepare("SELECT COUNT(*) as cnt FROM reviews WHERE status = 'approved'").get().cnt;
  const posted = db.prepare("SELECT COUNT(*) as cnt FROM reviews WHERE status = 'posted'").get().cnt;
  const avgRating = db.prepare("SELECT AVG(rating) as avg FROM reviews").get().avg || 0;
  res.json({ total, pending, ready, approved, posted, avgRating: Math.round(avgRating * 10) / 10 });
});

// ============================================
// SERVE FRONTEND
// ============================================
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n⚡ ReplyGenius v1`);
  console.log(`   Running at: http://localhost:${PORT}`);
  console.log(`   Webhook URL: /api/webhook/new-review?secret=${getSetting('webhook_secret')}`);
  console.log(`   AI: ${process.env.ANTHROPIC_API_KEY ? 'ENABLED' : 'DISABLED (no API key)'}\n`);
});
