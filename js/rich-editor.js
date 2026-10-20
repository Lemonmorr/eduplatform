/* ============================================================
   RICH EDITOR — редактор форматированного текста
   ============================================================ */

function buildRichToolbar(blockIndex) {
  return `
    <div class="rich-toolbar" data-block-index="${blockIndex}">
      <button type="button" class="rich-btn" onmousedown="event.preventDefault(); richExec('bold', ${blockIndex})" title="Жирный (Ctrl+B)"><b>B</b></button>
      <button type="button" class="rich-btn" onmousedown="event.preventDefault(); richExec('italic', ${blockIndex})" title="Курсив (Ctrl+I)"><i>I</i></button>
      <span class="rich-sep"></span>
      <button type="button" class="rich-btn" onmousedown="event.preventDefault(); richFormatBlock('h2', ${blockIndex})" title="Заголовок 2">H2</button>
      <button type="button" class="rich-btn" onmousedown="event.preventDefault(); richFormatBlock('h3', ${blockIndex})" title="Заголовок 3">H3</button>
      <button type="button" class="rich-btn" onmousedown="event.preventDefault(); richFormatBlock('p', ${blockIndex})" title="Обычный абзац">¶</button>
      <span class="rich-sep"></span>
      <button type="button" class="rich-btn" onmousedown="event.preventDefault(); richExec('insertUnorderedList', ${blockIndex})" title="Список">• Список</button>
      <button type="button" class="rich-btn" onmousedown="event.preventDefault(); richExec('insertOrderedList', ${blockIndex})" title="Нумерованный список">1. Список</button>
      <span class="rich-sep"></span>
      <button type="button" class="rich-btn" onmousedown="event.preventDefault(); richAddLink(${blockIndex})" title="Вставить ссылку">🔗</button>
      <button type="button" class="rich-btn" onmousedown="event.preventDefault(); richExec('removeFormat', ${blockIndex})" title="Убрать форматирование">✕ Формат</button>
    </div>
  `;
}

function focusRichEditor(blockIndex) {
  const editor = document.getElementById('rich-editor-' + blockIndex);
  if (editor) editor.focus();
}

function richExec(command, blockIndex, value) {
  focusRichEditor(blockIndex);
  document.execCommand(command, false, value || null);
  syncRichEditor(blockIndex);
}

function richFormatBlock(tag, blockIndex) {
  focusRichEditor(blockIndex);
  document.execCommand('formatBlock', false, tag);
  syncRichEditor(blockIndex);
}

function richAddLink(blockIndex) {
  focusRichEditor(blockIndex);
  const url = prompt('Введите URL ссылки:', 'https://');
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) {
    showToast('Ссылка должна начинаться с http:// или https://', true);
    return;
  }
  document.execCommand('createLink', false, url);
  syncRichEditor(blockIndex);
}

function syncRichEditor(blockIndex) {
  if (typeof currentBlocks === 'undefined' || !currentBlocks[blockIndex]) return;
  const editor = document.getElementById('rich-editor-' + blockIndex);
  if (!editor) return;
  currentBlocks[blockIndex].value = editor.innerHTML;
  if (typeof updateSaveInfo === 'function') updateSaveInfo();
}

function initRichEditor(blockIndex) {
  const editor = document.getElementById('rich-editor-' + blockIndex);
  if (!editor) return;

  editor.addEventListener('input', () => syncRichEditor(blockIndex));

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      setTimeout(() => syncRichEditor(blockIndex), 10);
    }
  });

  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
    syncRichEditor(blockIndex);
  });

  editor.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link) e.preventDefault();
  });
}