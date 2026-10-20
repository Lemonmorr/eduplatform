/* ============================================================
   GLOSSARY — глоссарий терминов и тултипы
   ============================================================ */

const GLOSSARY_KEY = 'glossary';

/* ---------- Хранилище ---------- */
function getGlossary() {
  return Storage.get(GLOSSARY_KEY, {});
}

function saveGlossary(data) {
  Storage.set(GLOSSARY_KEY, data);
}

/* ---------- Работа с терминами лекции ----------
   Формат: { "term": "определение", ... }
   Хранится в lesson.glossary = { term: definition }
*/

/* Извлекаем термины для конкретной лекции */
function getLessonGlossary(lesson) {
  return (lesson && lesson.glossary) || {};
}

/* Собираем все термины из всех лекций (для словаря) */
function getAllTerms(lessons) {
  const terms = {};
  Object.values(lessons || {}).forEach(l => {
    const g = l.glossary || {};
    Object.entries(g).forEach(([term, def]) => {
      if (!terms[term]) terms[term] = { def, lessons: [] };
      terms[term].lessons.push(l.title);
    });
  });
  return terms;
}

/* ---------- Тултипы в тексте лекции ----------
   Ищем в текстовых блоках `<span data-term="...">` и оборачиваем
   их в интерактивный элемент с подсказкой при клике/наведении.
*/

function initGlossaryInLesson(container, lesson) {
  if (!container || !lesson) return;
  const glossary = getLessonGlossary(lesson);
  if (Object.keys(glossary).length === 0) return;

  // Находим все `<span data-term="...">` внутри rich-текста
  const spans = container.querySelectorAll('.lesson-text-block span[data-term]');
  spans.forEach(span => {
    const term = (span.getAttribute('data-term') || '').toLowerCase();
    const def = glossary[term];
    if (!def) return;

    span.classList.add('glossary-term');
    span.setAttribute('tabindex', '0');
    span.setAttribute('role', 'button');
    span.setAttribute('aria-label', `Термин: ${term}`);

    // Toggle-подсказка
    span.addEventListener('click', (e) => {
      e.preventDefault();
      showTermTooltip(span, term, def);
    });
    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showTermTooltip(span, term, def);
      }
    });
  });
}

/* ---------- Тултип ---------- */
let __termTooltip = null;

function showTermTooltip(anchor, term, def) {
  hideTermTooltip();
  __termTooltip = document.createElement('div');
  __termTooltip.className = 'glossary-tooltip';
  __termTooltip.innerHTML = `
    <div class="glossary-tooltip-term">${escapeHtml(term)}</div>
    <div class="glossary-tooltip-def">${escapeHtml(def)}</div>
  `;
  document.body.appendChild(__termTooltip);

  const rect = anchor.getBoundingClientRect();
  const tt = __termTooltip.getBoundingClientRect();
  let top = rect.top - tt.height - 8 + window.scrollY;
  let left = rect.left + rect.width / 2 - tt.width / 2 + window.scrollX;

  if (left < 8) left = 8;
  if (left + tt.width > window.innerWidth - 8) left = window.innerWidth - tt.width - 8;
  if (top < window.scrollY + 8) top = rect.bottom + 8 + window.scrollY;

  __termTooltip.style.top = top + 'px';
  __termTooltip.style.left = left + 'px';

  setTimeout(() => {
    document.addEventListener('click', __globalHideGlossary, { once: true });
  }, 10);
}

function hideTermTooltip() {
  if (__termTooltip && __termTooltip.parentNode) {
    __termTooltip.parentNode.removeChild(__termTooltip);
  }
  __termTooltip = null;
}

function __globalHideGlossary(e) {
  if (__termTooltip && !__termTooltip.contains(e.target)) hideTermTooltip();
}

/* ---------- Извлечение терминов из текста для редактора ----------
   Ищем слова, обёрнутые как `[[термин]]` и превращаем в span.
   Аналогично `[[термин|определение]]` — задаёт определение сразу.
*/
function parseGlossaryMarks(htmlText) {
  if (!htmlText) return { text: '', terms: {} };
  const terms = {};
  // [[term]] или [[term|definition]]
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let out = htmlText;
  out = out.replace(re, (match, term, def) => {
    const t = term.trim();
    const d = (def || '').trim();
    if (!t) return match;
    if (d) terms[t.toLowerCase()] = d;
    return `<span data-term="${escapeAttr(t)}">${escapeHtml(t)}</span>`;
  });
  return { text: out, terms };
}

/* ---------- Публичный API для страницы лекции ---------- */
window.Glossary = {
  getLessonGlossary,
  getAllTerms,
  initGlossaryInLesson,
  parseGlossaryMarks
};