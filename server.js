const express = require('express');
const path = require('path');
const { createClient } = require('@libsql/client'); // Используем стандартный клиент для Node.js
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Инициализация клиента Turso
const db = createClient({
  url: process.env.TURSO_DATABASE_URL || '',
  authToken: process.env.TURSO_AUTH_TOKEN || '',
});

// Разрешаем большие JSON (для картинок в лекциях)
app.use(express.json({ limit: '50mb' }));

// Отдаем статические файлы из корневой папки (где лежит этот server.js)
app.use(express.static(__dirname));

// --- АВТОСОЗДАНИЕ ТАБЛИЦЫ ПРИ СТАРТЕ ---
// Защищает от ошибки "migration jobs: 400" и гарантирует, что таблица есть
async function initDB() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    console.log('✅ База данных готова (таблица kv существует)');
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:', error.message);
  }
}
initDB();

// --- API: ПОЛУЧИТЬ ВСЕ ДАННЫЕ ---
app.get('/api/all', async (req, res) => {
  console.log('🔄 Получен запрос на синхронизацию данных (/api/all)');
  try {
    // Таймаут 10 сек, чтобы сервер не висел вечно, если Turso недоступен
    const dbRequest = db.execute('SELECT key, value FROM kv');
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Превышено время ожидания ответа от Turso (10 сек)')), 10000)
    );

    const result = await Promise.race([dbRequest, timeout]);
    
    console.log(`✅ Данные из Turso получены. Найдено ключей: ${result.rows.length}`);
    
    const data = {};
    result.rows.forEach(r => {
      try {
        data[r.key] = JSON.parse(r.value);
      } catch (e) {
        console.warn(`⚠️ Не удалось распарсить ключ ${r.key}:`, e.message);
        data[r.key] = null;
      }
    });
    
    res.json(data);
  } catch (e) {
    console.error('❌ Ошибка чтения БД (/api/all):', e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- API: СОХРАНИТЬ ДАННЫЕ ---
app.post('/api/kv/:key', async (req, res) => {
  const key = req.params.key;
  const value = req.body.value;

  try {
    const dbRequest = db.execute({
      sql: 'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
      args: [key, JSON.stringify(value)],
    });
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Таймаут записи в Turso (10 сек)')), 10000)
    );

    await Promise.race([dbRequest, timeout]);
    
    console.log(`💾 Сохранено в БД: ${key}`);
    res.json({ ok: true });
  } catch (e) {
    console.error(`❌ Ошибка записи БД (${key}):`, e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- API: УДАЛИТЬ ДАННЫЕ ---
app.delete('/api/kv/:key', async (req, res) => {
  try {
    await db.execute({
      sql: 'DELETE FROM kv WHERE key = ?',
      args: [req.params.key],
    });
    console.log(`🗑️ Удалено из БД: ${req.params.key}`);
    res.json({ ok: true });
  } catch (e) {
    console.error(`❌ Ошибка удаления БД (${req.params.key}):`, e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- ОБРАБОТКА ОСТАЛЬНЫХ ЗАПРОСОВ ---
// Если запрос не к API, отдаем index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
  console.log('==================================================');
  console.log(`🚀 EduPlatform сервер запущен на порту ${PORT}`);
  console.log('==================================================');
});