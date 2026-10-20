/* ============================================================
   TEACHER — конструктор лекций
   ============================================================ */

const urlParams = new URLSearchParams(window.location.search);
const editId = urlParams.get('edit');

let lessons = Storage.get('my_lessons', {});
let currentQuestions = [];
let currentBlocks = [];

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
// УМЕНЬШИЛИ РАЗМЕР КАРТИНОК ДЛЯ ЭКОНОМИИ МЕСТА
const MAX_IMAGE_WIDTH = 1000;
const IMAGE_QUALITY = 0.7;

const STORAGE_WARN_CHARS = 2_200_000;
const STORAGE_HARD_CHARS = 2_600_000;

/* ---------- Теги ---------- */
function parseTags(str) {
  if (!str) return [];
  return str.split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 10);
}

/* ============================================================
   АВТОСОХРАНЕНИЕ ЧЕРНОВИКА
   ============================================================ */
const DRAFT_KEY = 'lesson_draft';
let __draftInitDone = false;
let __draftTimer = null;

function hasDraftContent() {
  const title = (document.getElementById('lesson-title')?.value || '').trim();
  if (!title) return false;
  return currentBlocks.some(b => {
    if (!b) return false;
    if (b.type === 'text') {
      return (b.value || '').replace(/<[^>]+>/g, '').trim().length > 0;
    }
    return b.url && b.url.trim();
  });
}

function saveDraft() {
  if (!__draftInitDone) return;
  if (!hasDraftContent()) return;
  const draft = {
    title:      document.getElementById('lesson-title')?.value || '',
    subject:    document.getElementById('lesson-subject')?.value || '',
    tags:       document.getElementById('lesson-tags')?.value || '',
    blocks:     currentBlocks,
    hasTest:    document.getElementById('has-test-checkbox')?.checked || false,
    questions:  currentQuestions,
    timeLimitMinutes: parseInt(document.getElementById('time-limit')?.value) || 0,
    deadline:   document.getElementById('test-deadline')?.value || '',
    allowRetakes: document.getElementById('allow-retakes')?.checked || false,
    gradeThresholds: {
      g5: parseInt(document.getElementById('g5-threshold')?.value) || 90,
      g4: parseInt(document.getElementById('g4-threshold')?.value) || 75,
      g3: parseInt(document.getElementById('g3-threshold')?.value) || 50
    },
    savedAt: new Date().toISOString(),
    editId: editId || null
  };
  try { Storage.set(DRAFT_KEY, draft); } catch (e) {}
}

function clearDraft() {
  Storage.remove(DRAFT_KEY);
}

function scheduleDraftSave() {
  if (__draftTimer) clearTimeout(__draftTimer);
  __draftTimer = setTimeout(saveDraft, 800);
}

function restoreDraft() {
  const draft = Storage.get(DRAFT_KEY, null);
  if (!draft) return false;

  document.getElementById('lesson-title').value = draft.title || '';
  document.getElementById('lesson-subject').value = draft.subject || '';
  document.getElementById('lesson-tags').value = draft.tags || '';
  currentBlocks = draft.blocks && draft.blocks.length
    ? JSON.parse(JSON.stringify(draft.blocks))
    : [{ type: 'text', value: '' }];
  currentQuestions = Array.isArray(draft.questions) ? JSON.parse(JSON.stringify(draft.questions)) : [];

  const cb = document.getElementById('has-test-checkbox');
  cb.checked = !!draft.hasTest;
  document.getElementById('test-section').classList.toggle('visible', cb.checked);

  if (draft.timeLimitMinutes) document.getElementById('time-limit').value = draft.timeLimitMinutes;
  if (draft.deadline) document.getElementById('test-deadline').value = draft.deadline;
  document.getElementById('allow-retakes').checked = !!draft.allowRetakes;
  if (draft.gradeThresholds) {
    document.getElementById('g5-threshold').value = draft.gradeThresholds.g5;
    document.getElementById('g4-threshold').value = draft.gradeThresholds.g4;
    document.getElementById('g3-threshold').value = draft.gradeThresholds.g3;
  }

  renderBlocks();
  if (cb.checked) renderQuestions();
  updateSaveInfo();
  return true;
}

function askRestoreDraft() {
  const draft = Storage.get(DRAFT_KEY, null);
  if (!draft) return;
  const when = new Date(draft.savedAt).toLocaleString('ru-RU');
  const modal = document.getElementById('draft-modal');
  if (!modal) return;

  document.getElementById('draft-modal-info').textContent =
    `Черновик сохранён ${when}. Название: «${draft.title || 'без названия'}».`;
  modal.style.display = 'flex';
  modal.classList.add('active');

  document.getElementById('draft-modal-restore').onclick = () => {
    restoreDraft();
    modal.style.display = 'none';
    modal.classList.remove('active');
    showToast('Черновик восстановлен');
  };
  document.getElementById('draft-modal-discard').onclick = () => {
    clearDraft();
    modal.style.display = 'none';
    modal.classList.remove('active');
    showToast('Черновик удалён');
  };
}

/* ============================================================
   ЛОКАЛЬНЫЙ showConfirm ДЛЯ TEACHER (чтобы не конфликтовать)
   ============================================================ */
function showTeacherConfirm(message, onOk) {
  const modal = document.getElementById('confirm-modal-teacher');
  document.getElementById('confirm-text-teacher').textContent = message;
  modal.classList.add('active');
  modal.style.display = 'flex';

  const okBtn = document.getElementById('confirm-ok-teacher');
  const cancelBtn = document.getElementById('confirm-cancel-teacher');

  const cleanup = () => {
    modal.classList.remove('active');
    modal.style.display = 'none';
    okBtn.onclick = null;
    cancelBtn.onclick = null;
    modal.onclick = null;
  };

  okBtn.onclick = () => { cleanup(); onOk(); };
  cancelBtn.onclick = () => cleanup();
  modal.onclick = (e) => { if (e.target === modal) cleanup(); };
}

/* ============================================================
   УТИЛИТЫ
   ============================================================ */
function detectMediaType(url) {
  if (!url) return null;
  const lower = url.toLowerCase().split('?')[0].split('#')[0];
  if (/\.(mp4|webm|ogv|mov|m4v|avi)$/.test(lower)) return 'video';
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)$/.test(lower)) return 'image';
  if (getYouTubeId(url)) return 'video';
  return null;
}

function compressImage(dataUrl, maxWidth, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function() {
      try {
        const canvas = document.createElement('canvas');
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1024 / 1024).toFixed(2) + ' МБ';
}

function dataUrlSizeKB(dataUrl) {
  if (!dataUrl) return 0;
  const base64 = dataUrl.split(',')[1] || '';
  return Math.round(base64.length * 3 / 4 / 1024);
}

function looksLikeHtml(str) {
  if (!str) return false;
  return /<[a-z][\s\S]*>/i.test(str);
}

function estimateLessonsStorage(extraLesson) {
  const all = Storage.get('my_lessons', {});
  let extraChars = 0;
  try { extraChars = JSON.stringify(extraLesson).length; } catch (e) { extraChars = Infinity; }
  let baseChars = 0;
  try { baseChars = JSON.stringify(all).length; } catch (e) { baseChars = 0; }
  const chars = baseChars + extraChars;

  const mb = chars * 2 / 1024 / 1024;
  let level = 'ok';
  if (chars >= STORAGE_HARD_CHARS) level = 'hard';
  else if (chars >= STORAGE_WARN_CHARS) level = 'warn';

  return { chars, mb, level };
}

/* ============================================================
   ПРЕДМЕТЫ (подсказки)
   ============================================================ */
function renderSubjectSuggestions() {
  const subjects = new Set();
  Object.values(lessons).forEach(l => {
    if (l.subject && l.subject.trim()) subjects.add(l.subject.trim());
  });
  const container = document.getElementById('subject-suggestions');
  if (subjects.size === 0) { container.innerHTML = ''; return; }
  const arr = Array.from(subjects).sort((a, b) => a.localeCompare(b, 'ru')).slice(0, 12);
  container.innerHTML = arr.map(s =>
    `<span class="subject-chip" onclick="pickSubject('${escapeHtml(s)}')">${escapeHtml(s)}</span>`
  ).join('');
}
function pickSubject(s) {
  document.getElementById('lesson-subject').value = s;
  scheduleDraftSave();
}

/* ============================================================
   БЛОКИ
   ============================================================ */
function addBlock(type) {
  if (type === 'text') currentBlocks.push({ type: 'text', value: '' });
  else if (type === 'media') currentBlocks.push({ type: 'media', mediaType: 'image', url: '', caption: '', fileName: '' });
  else if (type === 'file') currentBlocks.push({ type: 'file', url: '', fileName: '' });
  renderBlocks();
  updateSaveInfo();
}

function removeBlock(idx) {
  showTeacherConfirm('Удалить этот блок?', () => {
    currentBlocks.splice(idx, 1);
    if (currentBlocks.length === 0) currentBlocks.push({ type: 'text', value: '' });
    renderBlocks();
    updateSaveInfo();
  });
}

function moveBlock(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= currentBlocks.length) return;
  const tmp = currentBlocks[idx];
  currentBlocks[idx] = currentBlocks[newIdx];
  currentBlocks[newIdx] = tmp;
  renderBlocks();
  updateSaveInfo();
}

function updateBlock(idx, field, value) {
  if (!currentBlocks[idx]) return;
  currentBlocks[idx][field] = value;
  if (field === 'url') {
    const detected = detectMediaType(value);
    if (detected && currentBlocks[idx].type === 'media') currentBlocks[idx].mediaType = detected;
  }
  if (field === 'url' || field === 'mediaType') renderBlocks();
  updateSaveInfo();
}

function handleMediaFile(idx, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) {
    showToast('Файл слишком большой (' + formatBytes(file.size) + '). Максимум ' + MAX_FILE_SIZE_MB + ' МБ.', true);
    input.value = '';
    return;
  }
  const isImage = file.type.startsWith('image/');
  const reader = new FileReader();
  reader.onload = async function(e) {
    let url = e.target.result;
    if (isImage) {
      try { url = await compressImage(url, MAX_IMAGE_WIDTH, IMAGE_QUALITY); } catch (err) {}
    }
    currentBlocks[idx].url = url;
    currentBlocks[idx].fileName = file.name;
    if (file.type.startsWith('video/')) currentBlocks[idx].mediaType = 'video';
    else if (isImage) currentBlocks[idx].mediaType = 'image';
    renderBlocks();
    updateSaveInfo();
  };
  reader.onerror = () => showToast('Не удалось прочитать файл', true);
  reader.readAsDataURL(file);
}

function handleFileUpload(idx, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) {
    showToast('Файл слишком большой (' + formatBytes(file.size) + '). Максимум ' + MAX_FILE_SIZE_MB + ' МБ.', true);
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    currentBlocks[idx].url = e.target.result;
    if (!currentBlocks[idx].fileName) currentBlocks[idx].fileName = file.name;
    renderBlocks();
    updateSaveInfo();
  };
  reader.onerror = () => showToast('Не удалось прочитать файл', true);
  reader.readAsDataURL(file);
}

function renderMediaPreview(block) {
  if (!block.url || !block.url.trim()) {
    return `<div class="media-preview"><div class="media-placeholder">Превью появится после загрузки</div></div>`;
  }
  const ytId = getYouTubeId(block.url);
  if (ytId) return `<div class="media-preview"><iframe src="https://www.youtube.com/embed/${ytId}" allowfullscreen></iframe></div>`;
  const url = escapeHtml(block.url);
  if (block.mediaType === 'video') return `<div class="media-preview"><video src="${url}" controls preload="metadata"></video></div>`;
  return `<div class="media-preview"><img src="${url}" alt="" onerror="this.parentElement.innerHTML='&lt;div class=&quot;media-placeholder&quot;&gt;Не удалось загрузить&lt;/div&gt;'"></div>`;
}

function renderBlocks() {
  const container = document.getElementById('blocks-editor');
  container.innerHTML = '';
  currentBlocks.forEach((block, idx) => {
    const el = document.createElement('div');
    el.className = 'block-card';
    const isFirst = idx === 0;
    const isLast = idx === currentBlocks.length - 1;
    let blockLabel = '';
    let bodyHtml = '';

    if (block.type === 'text') {
      blockLabel = 'Текстовый блок';
      let html = block.value || '';
      if (html && !looksLikeHtml(html)) {
        html = '<p>' + escapeHtml(html).replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
      }
      bodyHtml = `
        ${buildRichToolbar(idx)}
        <div class="rich-editor"
             id="rich-editor-${idx}"
             contenteditable="true"
             data-placeholder="Введите текст лекции..."
             data-block-index="${idx}">${html}</div>
      `;
    } else if (block.type === 'media') {
      blockLabel = block.mediaType === 'video' ? 'Видео' : 'Изображение';
      const hasUrl = block.url && block.url.trim();
      const statusLabel = hasUrl
        ? `<span class="file-status ok">Загружено (${dataUrlSizeKB(block.url) || '—'} КБ)</span>`
        : `<span class="file-status err">Нет файла или ссылки</span>`;
      bodyHtml = `
        <div class="upload-row">
          <label>Загрузить с компьютера<input type="file" accept="image/*,video/*" onchange="handleMediaFile(${idx}, this)"></label>
          <span class="file-name">${block.fileName ? escapeHtml(block.fileName) : ''}</span>
          ${statusLabel}
        </div>
        <div class="divider-text">или вставьте ссылку</div>
        <div class="form-group">
          <label style="font-size: 12px;">Ссылка (URL)</label>
          <input type="text" value="${block.url && !block.url.startsWith('data:') ? escapeHtml(block.url) : ''}" placeholder="https://..." oninput="updateBlock(${idx}, 'url', this.value)">
        </div>
        <div class="form-group">
          <label style="font-size: 12px;">Тип медиа</label>
          <select onchange="updateBlock(${idx}, 'mediaType', this.value)">
            <option value="image" ${block.mediaType !== 'video' ? 'selected' : ''}>Изображение</option>
            <option value="video" ${block.mediaType === 'video' ? 'selected' : ''}>Видео</option>
          </select>
        </div>
        <div class="form-group">
          <label style="font-size: 12px;">Подпись</label>
          <input type="text" value="${escapeHtml(block.caption || '')}" placeholder="Рис. 1" oninput="updateBlock(${idx}, 'caption', this.value)">
        </div>
        ${renderMediaPreview(block)}
      `;
    } else if (block.type === 'file') {
      blockLabel = 'Файл';
      const hasUrl = block.url && block.url.trim();
      const statusLabel = hasUrl
        ? `<span class="file-status ok">Загружено (${dataUrlSizeKB(block.url) || '—'} КБ)</span>`
        : `<span class="file-status err">Нет файла или ссылки</span>`;
      bodyHtml = `
        <div class="upload-row">
          <label>Загрузить с компьютера<input type="file" onchange="handleFileUpload(${idx}, this)"></label>
          <span class="file-name">${block.fileName ? escapeHtml(block.fileName) : ''}</span>
          ${statusLabel}
        </div>
        <div class="divider-text">или вставьте ссылку</div>
        <div class="form-group">
          <label style="font-size: 12px;">Ссылка на файл (URL)</label>
          <input type="text" value="${block.url && !block.url.startsWith('data:') ? escapeHtml(block.url) : ''}" placeholder="https://example.com/doc.pdf" oninput="updateBlock(${idx}, 'url', this.value)">
        </div>
        <div class="form-group">
          <label style="font-size: 12px;">Название файла</label>
          <input type="text" value="${escapeHtml(block.fileName || '')}" placeholder="Методичка.pdf" oninput="updateBlock(${idx}, 'fileName', this.value)">
        </div>
      `;
    }

    el.innerHTML = `
      <div class="block-header">
        <div class="block-type">${blockLabel}</div>
        <div class="block-actions">
          <button type="button" ${isFirst ? 'disabled' : ''} onclick="moveBlock(${idx}, -1)">↑</button>
          <button type="button" ${isLast ? 'disabled' : ''} onclick="moveBlock(${idx}, 1)">↓</button>
          <button type="button" class="btn-remove" onclick="removeBlock(${idx})">Удалить</button>
        </div>
      </div>
      ${bodyHtml}
    `;
    container.appendChild(el);

    if (block.type === 'text') initRichEditor(idx);
  });
  scheduleDraftSave();
}

function syncAllRichEditors() {
  if (typeof currentBlocks === 'undefined') return;
  currentBlocks.forEach((block, idx) => {
    if (block.type !== 'text') return;
    const editor = document.getElementById('rich-editor-' + idx);
    if (editor) block.value = sanitizeRichHtml(editor.innerHTML);
    else if (block.value) block.value = sanitizeRichHtml(block.value);
  });
}

function countBlocks() {
  let text = 0, media = 0, file = 0, emptyMedia = 0, emptyFile = 0;
  currentBlocks.forEach(b => {
    if (b.type === 'text') {
      const stripped = (b.value || '').replace(/<[^>]+>/g, '').trim();
      const hasMedia = /<(img|iframe|video)/i.test(b.value || '');
      if (stripped || hasMedia) text++;
    }
    else if (b.type === 'media') { if (b.url && b.url.trim()) media++; else emptyMedia++; }
    else if (b.type === 'file') { if (b.url && b.url.trim()) file++; else emptyFile++; }
  });
  return { text, media, file, emptyMedia, emptyFile, total: text + media + file };
}

function updateSaveInfo() {
  const info = document.getElementById('save-info');
  const stats = countBlocks();
  const parts = [];
  if (stats.text) parts.push('текст: ' + stats.text);
  if (stats.media) parts.push('медиа: ' + stats.media);
  if (stats.file) parts.push('файл: ' + stats.file);
  const emptyCount = stats.emptyMedia + stats.emptyFile;

  if (emptyCount > 0) {
    info.classList.add('visible');
    info.innerHTML = `Будет сохранено блоков: <b>${stats.total}</b> (${parts.join(', ')}). ⚠ Пустых: <b>${emptyCount}</b>`;
  } else if (stats.total > 0) {
    info.classList.add('visible');
    info.innerHTML = `Будет сохранено блоков: <b>${stats.total}</b> (${parts.join(', ')}).`;
  } else {
    info.classList.remove('visible');
  }
  scheduleDraftSave();
}

/* ============================================================
   ТЕСТ — редактор вопросов
   ============================================================ */
function toggleTestSection() {
  const isChecked = document.getElementById('has-test-checkbox').checked;
  const section = document.getElementById('test-section');
  section.classList.toggle('visible', isChecked);
  if (isChecked && currentQuestions.length === 0) addQuestion();
  scheduleDraftSave();
}

function addQuestion() {
  currentQuestions.push({ text: '', type: 'single', options: ['', ''], correct: 0 });
  renderQuestions();
}

function removeQuestion(index) {
  showTeacherConfirm('Удалить этот вопрос?', () => {
    currentQuestions.splice(index, 1);
    renderQuestions();
  });
}

function renderQuestions() {
  const container = document.getElementById('questions-container');
  container.innerHTML = '';

  currentQuestions.forEach((q, qIndex) => {
    const qCard = document.createElement('div');
    qCard.className = 'question-card';

    let bodyHtml = '';
    if (q.type === 'single' || q.type === 'multiple') bodyHtml = renderOptionsEditor(q, qIndex);
    else if (q.type === 'open') bodyHtml = renderOpenEditor(q, qIndex);
    else if (q.type === 'match') bodyHtml = renderMatchEditor(q, qIndex);
    else if (q.type === 'sort') bodyHtml = renderSortEditor(q, qIndex);

    qCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong>Вопрос №${qIndex + 1}</strong>
        <button type="button" class="btn btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="removeQuestion(${qIndex})">Удалить вопрос</button>
      </div>
      <input type="text" value="${escapeHtml(q.text)}" placeholder="Текст вопроса" oninput="updateQuestionText(${qIndex}, this.value)" style="margin-bottom: 8px;">
      <div style="margin-bottom: 8px;">
        <label style="font-size: 12px;">Тип ответа:</label>
        <select style="width: auto; padding: 4px 8px;" onchange="changeQuestionType(${qIndex}, this.value)">
          <option value="single"   ${q.type === 'single'   ? 'selected' : ''}>Один правильный ответ</option>
          <option value="multiple" ${q.type === 'multiple' ? 'selected' : ''}>Несколько правильных ответов</option>
          <option value="open"     ${q.type === 'open'     ? 'selected' : ''}>Открытый ответ</option>
          <option value="match"    ${q.type === 'match'    ? 'selected' : ''}>Соответствие</option>
          <option value="sort"     ${q.type === 'sort'     ? 'selected' : ''}>Сортировка</option>
        </select>
      </div>
      ${bodyHtml}
    `;
    container.appendChild(qCard);
  });
  scheduleDraftSave();
}

function renderOptionsEditor(q, qIndex) {
  let html = '';
  q.options.forEach((opt, optIndex) => {
    const isChecked = (q.type === 'single' && q.correct === optIndex) ||
                     (q.type === 'multiple' && Array.isArray(q.correct) && q.correct.includes(optIndex));
    const inputType = q.type === 'single' ? 'radio' : 'checkbox';
    html += `
      <div class="answer-option">
        <input type="${inputType}" name="q_${qIndex}" ${isChecked ? 'checked' : ''} onchange="setCorrect(${qIndex}, ${optIndex})">
        <input type="text" value="${escapeHtml(opt)}" placeholder="Вариант ${optIndex + 1}" oninput="updateOptionText(${qIndex}, ${optIndex}, this.value)">
        ${q.options.length > 2 ? `<button type="button" class="btn btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="removeOption(${qIndex}, ${optIndex})">Удалить</button>` : ''}
      </div>
    `;
  });
  html += `<button type="button" class="btn btn-secondary" style="margin-top: 8px; padding: 4px 8px; font-size: 12px;" onclick="addOption(${qIndex})">+ Добавить вариант</button>`;
  return html;
}

function renderOpenEditor(q, qIndex) {
  return `
    <div class="open-answer-row">
      <label>Правильный ответ:</label>
      <input type="text" value="${escapeHtml(q.answer || '')}" placeholder="Например: Москва" oninput="updateOpenAnswer(${qIndex}, this.value)">
    </div>
    <div style="font-size: 11px; color: #94a3b8; margin-top: 6px;">
      Сравнение без учёта регистра и лишних пробелов.
    </div>
  `;
}

function renderMatchEditor(q, qIndex) {
  let rows = '';
  const count = Math.max(q.left.length, q.right.length);
  for (let i = 0; i < count; i++) {
    const leftVal = q.left[i] || '';
    const rightVal = q.right[i] || '';
    rows += `
      <div class="match-row">
        <input type="text" value="${escapeHtml(leftVal)}" placeholder="Левая часть ${i + 1}" oninput="updateMatchLeft(${qIndex}, ${i}, this.value)">
        <span class="match-arrow">→</span>
        <input type="text" value="${escapeHtml(rightVal)}" placeholder="Правая часть ${i + 1}" oninput="updateMatchRight(${qIndex}, ${i}, this.value)">
        ${count > 2 ? `<button type="button" class="match-remove" onclick="removeMatchPair(${qIndex}, ${i})" title="Удалить">✕</button>` : '<span style="width: 28px;"></span>'}
      </div>
    `;
  }
  return `
    <div class="match-editor">
      <div class="match-editor-title">Пары «левая часть → правая часть»</div>
      ${rows}
      <button type="button" class="match-add" onclick="addMatchPair(${qIndex})">+ Добавить пару</button>
    </div>
  `;
}

function renderSortEditor(q, qIndex) {
  let rows = '';
  q.items.forEach((item, i) => {
    rows += `
      <div class="sort-row">
        <span class="sort-num">${i + 1}</span>
        <input type="text" value="${escapeHtml(item)}" placeholder="Элемент ${i + 1}" oninput="updateSortItem(${qIndex}, ${i}, this.value)">
        <button type="button" ${i === 0 ? 'disabled' : ''} onclick="moveSortItem(${qIndex}, ${i}, -1)" title="Вверх">↑</button>
        <button type="button" ${i === q.items.length - 1 ? 'disabled' : ''} onclick="moveSortItem(${qIndex}, ${i}, 1)" title="Вниз">↓</button>
        ${q.items.length > 2 ? `<button type="button" class="sort-remove" onclick="removeSortItem(${qIndex}, ${i})" title="Удалить">✕</button>` : '<span style="width: 28px;"></span>'}
      </div>
    `;
  });
  return `
    <div class="sort-editor">
      <div class="sort-editor-title">Элементы в правильном порядке (сверху вниз)</div>
      ${rows}
      <button type="button" class="sort-add" onclick="addSortItem(${qIndex})">+ Добавить элемент</button>
    </div>
  `;
}

function updateQuestionText(qIndex, val) { currentQuestions[qIndex].text = val; scheduleDraftSave(); }
function updateOptionText(qIndex, optIndex, val) { currentQuestions[qIndex].options[optIndex] = val; scheduleDraftSave(); }

function addOption(qIndex) { currentQuestions[qIndex].options.push(''); renderQuestions(); }
function removeOption(qIndex, optIndex) {
  currentQuestions[qIndex].options.splice(optIndex, 1);
  if (currentQuestions[qIndex].type === 'single') currentQuestions[qIndex].correct = 0;
  else currentQuestions[qIndex].correct = [];
  renderQuestions();
}
function setCorrect(qIndex, optIndex) {
  const q = currentQuestions[qIndex];
  if (q.type === 'single') { q.correct = optIndex; }
  else {
    if (!Array.isArray(q.correct)) q.correct = [];
    const idx = q.correct.indexOf(optIndex);
    if (idx > -1) q.correct.splice(idx, 1);
    else q.correct.push(optIndex);
  }
  scheduleDraftSave();
}
function updateOpenAnswer(qIndex, val) { currentQuestions[qIndex].answer = val; scheduleDraftSave(); }
function updateMatchLeft(qIndex, i, val) {
  const q = currentQuestions[qIndex];
  if (!q.left) q.left = [];
  q.left[i] = val;
  scheduleDraftSave();
}
function updateMatchRight(qIndex, i, val) {
  const q = currentQuestions[qIndex];
  if (!q.right) q.right = [];
  q.right[i] = val;
  scheduleDraftSave();
}
function addMatchPair(qIndex) {
  const q = currentQuestions[qIndex];
  if (!q.left) q.left = [];
  if (!q.right) q.right = [];
  q.left.push(''); q.right.push('');
  renderQuestions();
}
function removeMatchPair(qIndex, i) {
  const q = currentQuestions[qIndex];
  q.left.splice(i, 1); q.right.splice(i, 1);
  renderQuestions();
}
function updateSortItem(qIndex, i, val) {
  const q = currentQuestions[qIndex];
  if (!q.items) q.items = [];
  q.items[i] = val;
  scheduleDraftSave();
}
function addSortItem(qIndex) {
  const q = currentQuestions[qIndex];
  if (!q.items) q.items = [];
  q.items.push('');
  q.correct = q.items.map((_, idx) => idx);
  renderQuestions();
}
function removeSortItem(qIndex, i) {
  const q = currentQuestions[qIndex];
  q.items.splice(i, 1);
  q.correct = q.items.map((_, idx) => idx);
  renderQuestions();
}
function moveSortItem(qIndex, i, dir) {
  const q = currentQuestions[qIndex];
  const newIdx = i + dir;
  if (newIdx < 0 || newIdx >= q.items.length) return;
  const tmp = q.items[i];
  q.items[i] = q.items[newIdx];
  q.items[newIdx] = tmp;
  q.correct = q.items.map((_, idx) => idx);
  renderQuestions();
}

function changeQuestionType(qIndex, newType) {
  const q = currentQuestions[qIndex];
  q.type = newType;

  if (newType === 'single') {
    q.options = q.options && q.options.length >= 2 ? q.options : ['', ''];
    q.correct = 0;
    delete q.answer; delete q.left; delete q.right; delete q.items;
  } else if (newType === 'multiple') {
    q.options = q.options && q.options.length >= 2 ? q.options : ['', ''];
    q.correct = [];
    delete q.answer; delete q.left; delete q.right; delete q.items;
  } else if (newType === 'open') {
    q.answer = q.answer || '';
    delete q.options; delete q.correct; delete q.left; delete q.right; delete q.items;
  } else if (newType === 'match') {
    q.left  = q.left  && q.left.length  >= 2 ? q.left  : ['', ''];
    q.right = q.right && q.right.length >= 2 ? q.right : ['', ''];
    q.correct = q.left.map((_, i) => i);
    delete q.options; delete q.answer; delete q.items;
  } else if (newType === 'sort') {
    q.items   = q.items   && q.items.length   >= 2 ? q.items   : ['', ''];
    q.correct = q.items.map((_, i) => i);
    delete q.options; delete q.answer; delete q.left; delete q.right;
  }
  renderQuestions();
}

/* ============================================================
   СОХРАНЕНИЕ
   ============================================================ */
function cleanBlocksFromBlocks() {
  return currentBlocks.filter(b => {
    if (b.type === 'text') {
      const stripped = (b.value || '').replace(/<[^>]+>/g, '').trim();
      const hasMedia = /<(img|iframe|video)/i.test(b.value || '');
      return stripped || hasMedia;
    }
    if (b.type === 'media') return b.url && b.url.trim();
    if (b.type === 'file') return b.url && b.url.trim();
    return false;
  });
}

function saveLesson() {
  syncAllRichEditors();

  const title = document.getElementById('lesson-title').value.trim();
  const subject = document.getElementById('lesson-subject').value.trim();
  const hasTest = document.getElementById('has-test-checkbox').checked;

  if (!title) { showToast('Пожалуйста, введите название лекции!', true); return; }

  const stats = countBlocks();
  const emptyBlocks = stats.emptyMedia + stats.emptyFile;
  if (stats.total === 0) { showToast('Добавьте хотя бы один непустой блок!', true); return; }

  const cleanBlocks = cleanBlocksFromBlocks();

  const proceed = () => {
    if (emptyBlocks > 0) {
      showTeacherConfirm('Есть ' + emptyBlocks + ' пустых блоков. Продолжить?', () => {
        doSaveLesson(title, subject, hasTest, cleanBlocks);
      });
    } else {
      doSaveLesson(title, subject, hasTest, cleanBlocks);
    }
  };

  const previewLesson = {
    title, subject,
    blocks: cleanBlocks,
    hasTest,
    questions: hasTest ? currentQuestions : []
  };
  const size = estimateLessonsStorage(previewLesson);

  if (size.level === 'hard') {
    showTeacherConfirm(
      `Хранилище почти заполнено (≈${size.mb.toFixed(1)} МБ). Продолжить?`,
      proceed
    );
    return;
  }
  if (size.level === 'warn') {
    showTeacherConfirm(
      `Хранилище загружено на ≈${size.mb.toFixed(1)} МБ из ~5 МБ. Продолжить?`,
      proceed
    );
    return;
  }
  proceed();
}

function doSaveLesson(title, subject, hasTest, cleanBlocks) {
  const textPreview = cleanBlocks
    .filter(b => b.type === 'text')
    .map(b => (b.value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .join('\n\n');

  const currentUser = getCurrentUser() || {};
  const lessonId = editId || ('lesson_' + Date.now());
  const existingVisibility = (editId && lessons[lessonId]) ? lessons[lessonId].visibility : 'public';
  const existingStatus = (editId && lessons[lessonId]) ? lessons[lessonId].status : null;
  let newStatus = existingStatus;
  if (!newStatus) newStatus = (currentUser.role === 'Студент') ? 'pending' : 'approved';
  const existingCreatedAt = (editId && lessons[lessonId]) ? lessons[lessonId].createdAt : null;
  const createdAt = existingCreatedAt || localTodayISO(); // Используем локальную дату
  const existingViews = (editId && lessons[lessonId]) ? (lessons[lessonId].views || 0) : 0;

  const newLessonData = {
    title,
    subject,
    tags: parseTags(document.getElementById('lesson-tags').value),
    content: textPreview,
    blocks: cleanBlocks,
    hasTest,
    visibility: existingVisibility,
    status: newStatus,
    createdAt, views: existingViews,
    author: currentUser.fio || currentUser.name || 'Не указан',
    authorEmail: currentUser.email || '',
    timeLimitMinutes: hasTest ? parseInt(document.getElementById('time-limit').value) || 0 : 0,
    deadline: hasTest ? (document.getElementById('test-deadline').value || null) : null,
    allowRetakes: hasTest ? document.getElementById('allow-retakes').checked : false,
    gradeThresholds: hasTest ? {
      g5: parseInt(document.getElementById('g5-threshold').value) || 90,
      g4: parseInt(document.getElementById('g4-threshold').value) || 75,
      g3: parseInt(document.getElementById('g3-threshold').value) || 50
    } : null,
    questions: hasTest ? currentQuestions : []
  };

  const all = Storage.get('my_lessons', {});
  all[lessonId] = newLessonData;

  if (!Storage.set('my_lessons', all)) {
    showToast('Не удалось сохранить лекцию. Превышен лимит хранилища.', true);
    return;
  }

  if (typeof Achievements !== 'undefined' && currentUser.email && !editId) {
    Achievements.addXP(40, currentUser.email);
    Achievements.checkAchievements(currentUser.email);
  }

  clearDraft();
  showToast((editId ? 'Обновлено' : 'Создано') + '. Блоков: ' + cleanBlocks.length);
  setTimeout(() => { window.location.href = 'my-lessons.html'; }, 1200);
}

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  lessons = Storage.get('my_lessons', {});

  const titleEl = document.getElementById('lesson-title');
  const subjectEl = document.getElementById('lesson-subject');
  const tagsEl = document.getElementById('lesson-tags');
  titleEl.addEventListener('input', scheduleDraftSave);
  subjectEl.addEventListener('input', scheduleDraftSave);
  tagsEl.addEventListener('input', scheduleDraftSave);

  renderSubjectSuggestions();

  if (editId && lessons[editId]) {
    document.getElementById('page-title').textContent = 'Редактирование лекции';
    const item = lessons[editId];
    titleEl.value = item.title || '';
    subjectEl.value = item.subject || '';
    tagsEl.value = (item.tags || []).join(', ');

    if (item.blocks && Array.isArray(item.blocks) && item.blocks.length > 0) {
      currentBlocks = JSON.parse(JSON.stringify(item.blocks));
    } else if (item.content) {
      currentBlocks = [{ type: 'text', value: item.content }];
    } else {
      currentBlocks = [{ type: 'text', value: '' }];
    }

    if (item.hasTest) {
      document.getElementById('has-test-checkbox').checked = true;
      toggleTestSection();
      if (item.timeLimitMinutes) document.getElementById('time-limit').value = item.timeLimitMinutes;
      if (item.deadline) document.getElementById('test-deadline').value = item.deadline;
      document.getElementById('allow-retakes').checked = !!item.allowRetakes;
      if (item.gradeThresholds) {
        document.getElementById('g5-threshold').value = item.gradeThresholds.g5 || 90;
        document.getElementById('g4-threshold').value = item.gradeThresholds.g4 || 75;
        document.getElementById('g3-threshold').value = item.gradeThresholds.g3 || 50;
      }
      currentQuestions = item.questions || [];
      renderQuestions();
    }
  } else {
    currentBlocks = [{ type: 'text', value: '' }];
  }

  renderBlocks();
  updateSaveInfo();

  __draftInitDone = true;

  const draft = Storage.get(DRAFT_KEY, null);
  const isRelevantDraft = draft &&
    (!editId || !draft.editId || draft.editId === editId) &&
    !titleEl.value.trim();
  if (isRelevantDraft) setTimeout(askRestoreDraft, 200);

  setInterval(saveDraft, 5000);
  window.addEventListener('beforeunload', saveDraft);
});