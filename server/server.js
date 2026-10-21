const express = require('express');
const path = require('path');
const { createClient } = require('@libsql/client/web'); // Используем веб-клиент
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Мы УБРАЛИ автоматическое создание таблицы initDb(), так как оно вызывает ошибку 400
// Мы создадим таблицу вручную в панели Turso.

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..')));

app.get('/api/all', async (req, res) => {
  try {
    const result = await db.execute('SELECT key, value FROM kv');
    const data = {};
    result.rows.forEach(r => {
      try { data[r.key] = JSON.parse(r.value); } catch (e) { data[r.key] = null; }
    });
    res.json(data);
  } catch (e) {
    console.error('DB read error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/kv/:key', async (req, res) => {
  try {
    await db.execute({
      sql: 'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
      args: [req.params.key, JSON.stringify(req.body.value)],
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('DB write error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/kv/:key', async (req, res) => {
  try {
    await db.execute({
      sql: 'DELETE FROM kv WHERE key = ?',
      args: [req.params.key],
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('DB delete error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('==================================================');
  console.log(`  EduPlatform запущен: http://localhost:${PORT}`);
  console.log('==================================================');
});