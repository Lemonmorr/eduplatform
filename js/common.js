/* ============================================================
   COMMON — общие функции
   ============================================================ */

/* ---------- Тема ---------- */
function toggleTheme() {
  const html = document.documentElement;
  html.classList.toggle('light-theme');
  localStorage.setItem('theme', html.classList.contains('light-theme') ? 'light' : 'dark');
}

/* ---------- Toast ---------- */
function showToast(msg, isError) {
  const t = document.getElementById('toast');
  if (!t) { console.warn('Toast element not found:', msg); return; }
  t.textContent = msg;
  t.classList.toggle('error', !!isError);
  t.style.display = 'block';
  clearTimeout(t.__hideTimer);
  t.__hideTimer = setTimeout(() => { t.style.display = 'none'; }, isError ? 4000 : 2500);
}

/* ---------- Escape ---------- */
function escapeHtml(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- Утилиты для текста ---------- */
function stripHtmlToPlain(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<\/p>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/h[1-6]>/gi, '\n').replace(/<\/li>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

function localTodayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ============================================================
   STORAGE — ГИБРИДНОЕ ХРАНИЛИЩЕ (Браузер + Сервер)
   ============================================================ */
const __storageCache = new Map();
const __pendingSync = new Map(); // Для сохранения того, что не удалось отправить
const API_BASE = '/api/kv';

// Показываем экран загрузки
function showLoadingScreen() {
  if (document.getElementById('global-loader')) return;
  const loader = document.createElement('div');
  loader.id = 'global-loader';
  loader.style.cssText = `
    position: fixed; inset: 0; background: #0f172a; z-index: 9999;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #fff; font-family: system-ui, sans-serif; transition: opacity 0.3s;
  `;
  loader.innerHTML = `
    <div style="width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.1); border-top-color: #6366f1; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px;"></div>
    <div style="font-size: 16px; font-weight: 600;">Загрузка данных...</div>
    <div style="font-size: 13px; color: #94a3b8; margin-top: 8px;">Сервер просыпается, это может занять до 40 секунд</div>
    <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
  `;
  document.body.appendChild(loader);
}

function hideLoadingScreen() {
  const loader = document.getElementById('global-loader');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 300);
  }
}

// 1. Синхронизация с сервером при старте
async function syncWithServer() {
  showLoadingScreen();
  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  while (attempts < MAX_ATTEMPTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 секунд на попытку

      const res = await fetch('/api/all', { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      // Записываем всё в локальное хранилище
      for (const [key, value] of Object.entries(data)) {
        if (value !== null) {
          if (key === 'currentUser') continue; 
          
          // ФИКС БАГА: не загружаем гостевой прогресс с сервера и сливаем с локальным
          if (key === 'last_reading_progress') {
            if (value['guest']) delete value['guest'];
            const local = __storageCache.get(key) || {};
            const merged = { ...local, ...value }; 
            __storageCache.set(key, merged);
            try { localStorage.setItem(key, JSON.stringify(merged)); } catch(e){}
            continue;
          }
          
          __storageCache.set(key, value);
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch (e) {
            console.warn(`Не удалось сохранить ${key} в localStorage. Превышен лимит.`, e);
          }
        }
      }

      // Отправляем то, что не ушло в прошлый раз (если есть)
      for (const [key, value] of __pendingSync) {
        fetch(`${API_BASE}/${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value })
        }).then(r => { if (r.ok) __pendingSync.delete(key); }).catch(() => {});
      }
      
      console.log('✅ Данные синхронизированы с Turso');
      hideLoadingScreen();
      window.dispatchEvent(new Event('dataSynced'));
      return; // Успех, выходим из цикла
      
    } catch (e) {
      attempts++;
      console.log(`⏳ Сервер спит или недоступен. Попытка ${attempts} из ${MAX_ATTEMPTS}...`);
      
      if (attempts >= MAX_ATTEMPTS) {
        const loader = document.getElementById('global-loader');
        if (loader) {
          loader.innerHTML = `
            <div style="color: #ef4444; text-align: center; padding: 20px;">
              <div style="font-size: 24px; margin-bottom: 10px;">⚠️ Ошибка загрузки данных</div>
              <div style="font-size: 14px; margin-bottom: 20px;">Сервер не отвечает. Попробуйте позже.</div>
              <button onclick="location.reload()" style="padding: 10px 20px; background: #6366f1; color: #fff; border: none; border-radius: 8px; cursor: pointer;">Повторить</button>
            </div>
          `;
        }
        return;
      }
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// Запускаем синхронизацию
syncWithServer();

// 2. Обертка над localStorage
const Storage = {
  get(key, fallback) {
    if (__storageCache.has(key)) return __storageCache.get(key);
    try {
      const v = localStorage.getItem(key);
      if (v === null) {
        const fb = fallback !== undefined ? fallback : null;
        __storageCache.set(key, fb);
        return fb;
      }
      const parsed = JSON.parse(v);
      __storageCache.set(key, parsed);
      return parsed;
    } catch (e) {
      console.warn('Storage.get error:', key, e);
      return fallback !== undefined ? fallback : null;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      __storageCache.set(key, value);

      // ВАЖНО: не отправляем сессию пользователя на сервер
      if (key === 'currentUser') return true;
      
      // ФИКС БАГА: Запрещаем отправлять гостевой прогресс на сервер
      if (key === 'last_reading_progress') {
        if (typeof getCurrentUser === 'function' && !getCurrentUser()) return true;
        if (value && value['guest']) {
          value = { ...value };
          delete value['guest'];
        }
      }

      fetch(`${API_BASE}/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }).catch(err => {
        console.warn('Ошибка сохранения на сервер:', err);
        __pendingSync.set(key, value); // запомним на потом
      });

      return true;
    } catch (e) {
      console.warn('Storage.set error:', key, e);
      return false;
    }
  },

  remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
    __storageCache.delete(key);
    
    if (key !== 'currentUser') {
      fetch(`${API_BASE}/${key}`, { method: 'DELETE' })
        .catch(err => console.warn('Ошибка удаления на сервер:', err));
    }
  }
};

window.addEventListener('storage', (e) => {
  if (e.key === null) __storageCache.clear();
  else if (e.key) __storageCache.delete(e.key);
});

/* ---------- Утилиты ---------- */
function formatDate(isoDate) {
  if (!isoDate) return '—';
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function getYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function debounce(fn, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

function cleanupOldViewCounters() {
  try {
    const today = localTodayISO();
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('view_counted_') && !key.endsWith('_' + today)) {
        toRemove.push(key);
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}

/* ============================================================
   МОДАЛЬНЫЕ ОКНА
   ============================================================ */
let __lastFocusedElement = null;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  
  __lastFocusedElement = document.activeElement;
  el.style.display = 'flex';
  el.classList.add('active');
  document.body.classList.add('modal-open');

  requestAnimationFrame(() => {
    const first = el.querySelector(FOCUSABLE);
    if (first) first.focus();
  });

  const trap = (e) => {
    if (e.key !== 'Tab') return;
    const nodes = [...el.querySelectorAll(FOCUSABLE)];
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  el.addEventListener('keydown', trap);
  el.__focusTrap = trap;
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'none';
    el.classList.remove('active');
    if (el.__focusTrap) el.removeEventListener('keydown', el.__focusTrap);
  }
  const anyOpen = document.querySelector('.modal-overlay[style*="display: flex"]');
  if (!anyOpen) {
    document.body.classList.remove('modal-open');
    if (__lastFocusedElement) { __lastFocusedElement.focus(); __lastFocusedElement = null; }
  }
}

document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-overlay')) {
    e.target.style.display = 'none';
    e.target.classList.remove('active');
    const anyOpen = document.querySelector('.modal-overlay[style*="display: flex"]');
    if (!anyOpen) {
      document.body.classList.remove('modal-open');
      if (__lastFocusedElement) { __lastFocusedElement.focus(); __lastFocusedElement = null; }
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = document.querySelectorAll('.modal-overlay[style*="display: flex"]');
  if (!open.length) return;
  const top = open[open.length - 1];
  top.style.display = 'none';
  top.classList.remove('active');
  if (open.length === 1) {
    document.body.classList.remove('modal-open');
    if (__lastFocusedElement) { __lastFocusedElement.focus(); __lastFocusedElement = null; }
  }
});

/* ============================================================
   ПОДТВЕРЖДЕНИЕ
   ============================================================ */
let __confirmCallback = null;

function showConfirm(message, callback) {
  const modal     = document.getElementById('confirm-modal');
  const msgEl     = document.getElementById('confirm-message');
  const okBtn     = document.getElementById('confirm-btn-ok');
  const cancelBtn = document.getElementById('confirm-btn-cancel');

  if (!modal || !okBtn || !cancelBtn) {
    if (window.confirm(message)) {
      if (typeof callback === 'function') callback();
    }
    return;
  }

  __confirmCallback = callback;
  if (msgEl) msgEl.textContent = message;
  openModal('confirm-modal');

  okBtn.onclick = () => {
    closeModal('confirm-modal');
    const cb = __confirmCallback;
    __confirmCallback = null;
    if (typeof cb === 'function') cb();
  };
  cancelBtn.onclick = () => {
    closeModal('confirm-modal');
    __confirmCallback = null;
  };
}

/* ============================================================
   DROPDOWN
   ============================================================ */
document.addEventListener('click', (e) => {
  if (!e.target.closest('.profile-wrapper')) {
    const dm = document.getElementById('dropdown-menu');
    if (dm) dm.classList.remove('active');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  cleanupOldViewCounters();
});