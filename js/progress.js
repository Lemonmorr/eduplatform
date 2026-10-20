/* ============================================================
   PROGRESS — прогресс чтения лекций
   ============================================================ */

const PROGRESS_STORAGE_KEY = 'last_reading_progress';

/* ---------- Чтение ---------- */
function getReadingProgress(lessonId, email) {
  const all = Storage.get(PROGRESS_STORAGE_KEY, {});
  const user = email || 'guest';
  return (all[user] && all[user][lessonId]) || null;
}

/* ---------- Запись ---------- */
function saveReadingProgress(lessonId, data, email) {
  const all = Storage.get(PROGRESS_STORAGE_KEY, {});
  const user = email || (typeof getUserKey === 'function' ? getUserKey() : 'guest');
  if (!all[user]) all[user] = {};
  all[user][lessonId] = data;
  Storage.set(PROGRESS_STORAGE_KEY, all);
}

/* ---------- Удаление ---------- */
function clearReadingProgress(lessonId, email) {
  const all = Storage.get(PROGRESS_STORAGE_KEY, {});
  const user = email || (typeof getUserKey === 'function' ? getUserKey() : 'guest');
  if (all[user] && all[user][lessonId]) {
    delete all[user][lessonId];
    Storage.set(PROGRESS_STORAGE_KEY, all);
  }
}

/* ---------- Вычисление состояния ----------
   Возвращает { state: 'unread' | 'progress' | 'done', percent, firstUnread }
   - state === 'done'    — лекция прочитана (100% / completedAt / все блоки)
   - state === 'progress'— есть сохранённый прогресс, но не финал
   - state === 'unread'  — прогресса нет
*/
function computeReadState(progress) {
  if (!progress || !progress.total) {
    return { state: 'unread', percent: 0, firstUnread: 0 };
  }

  const scrollPct = (typeof progress.scrollPercent === 'number') ? progress.scrollPercent : null;
  const blocksDone = Array.isArray(progress.read) && progress.read.length >= progress.total;

  if (progress.completedAt || (scrollPct !== null && scrollPct >= 100) || blocksDone) {
    return { state: 'done', percent: 100, firstUnread: 0 };
  }

  let firstUnread = 0;
  if (Array.isArray(progress.read)) {
    for (let i = 0; i < progress.total; i++) {
      if (!progress.read.includes(i)) { firstUnread = i; break; }
    }
  }

  let percent = 0;
  if (scrollPct !== null && scrollPct > 0) {
    percent = scrollPct;
  } else if (Array.isArray(progress.read) && progress.read.length > 0) {
    percent = Math.round((progress.read.length / progress.total) * 100);
  }

  return {
    state: percent > 0 ? 'progress' : 'unread',
    percent,
    firstUnread
  };
}

/* ---------- Построение кнопки и бейджа ----------
   opts: {
     baseClass: 'btn-read' | 'btn-sm',
     continueClass: 'btn-continue' | 'btn-continue-lesson',
     defaultLabel: 'Читать' | 'Просмотр'
   }
*/
function buildReadButtonHtml(lessonId, progress, opts) {
  opts = opts || {};
  const baseCls      = opts.baseClass      || 'btn-read';
  const continueCls  = opts.continueClass  || 'btn-continue';
  const defaultLabel = opts.defaultLabel   || 'Читать';
  const href = `lesson.html?id=${encodeURIComponent(lessonId)}`;

  const s = computeReadState(progress);

  if (s.state === 'done') {
    return {
      btnHtml:  `<a href="${href}" class="${baseCls} btn-read-done" title="Лекция прочитана">↺ Перечитать</a>`,
      badgeHtml: '<span class="badge-read">✓ Прочитано</span>'
    };
  }

  if (s.state === 'progress') {
    return {
      btnHtml: `<a href="${href}#block-${s.firstUnread}" class="${baseCls} ${continueCls}" title="Продолжить с ${s.percent}%">▶ Продолжить (${s.percent}%)</a>`,
      badgeHtml: ''
    };
  }

  return {
    btnHtml:  `<a href="${href}" class="${baseCls}">${defaultLabel}</a>`,
    badgeHtml: ''
  };
}