/* ============================================================
   PDF EXPORT — экспорт лекции в PDF с кириллицей
   ============================================================ */

/* ---------- Подгрузка PT Sans с кириллицей ---------- */
async function ensureCyrFont(doc) {
  if (doc.__cyrAdded) return;
  const fonts = [
    {
      url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ptsans/PT_Sans-Web-Regular.ttf',
      vfsName: 'PTSans-Regular.ttf', family: 'PTSans', style: 'normal'
    },
    {
      url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ptsans/PT_Sans-Web-Bold.ttf',
      vfsName: 'PTSans-Bold.ttf', family: 'PTSans', style: 'bold'
    }
  ];
  for (const f of fonts) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(f.url, { signal: controller.signal });
      clearTimeout(tid);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      doc.addFileToVFS(f.vfsName, btoa(binary));
      doc.addFont(f.vfsName, f.family, f.style);
    } catch (e) {
      console.warn('Не удалось загрузить шрифт', f.url, e);
    }
  }
  doc.__cyrAdded = true;
}

function safeSetFont(doc, style) {
  try { doc.setFont('PTSans', style); }
  catch (e) { doc.setFont('helvetica', style); }
}

/* ---------- Загрузка изображения (с обходом CORS) ---------- */
function loadImageForPDF(src) {
  return new Promise((resolve, reject) => {
    if (src.startsWith('data:')) {
      if (!src.startsWith('data:image/')) {
        reject(new Error('Не изображение (data): ' + src.slice(0, 30)));
        return;
      }
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, dataUrl: src });
      img.onerror = () => reject(new Error('dataURL image load error'));
      img.src = src;
      return;
    }
    tryLoad(src)
      .then(resolve)
      .catch(() => {
        const proxied = 'https://images.weserv.nl/?url=' +
          encodeURIComponent(src.replace(/^https?:\/\//, ''));
        tryLoad(proxied)
          .then(resolve)
          .catch(() => {
            const alt = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(src);
            tryLoad(alt).then(resolve).catch(reject);
          });
      });
  });
}

function tryLoad(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ width: img.naturalWidth, height: img.naturalHeight, dataUrl });
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('load error: ' + url.slice(0, 60)));
    img.src = url;
  });
}

function shortenUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;]+);/);
    const type = m ? m[1] : 'data';
    return '[встроенные данные ' + type + ', ' + Math.round(url.length / 1024) + ' КБ]';
  }
  return url.length > 100 ? url.slice(0, 97) + '...' : url;
}

/* ---------- Очистка HTML от тегов для PDF ---------- */
function stripHtmlToPlain(html) {
  if (!html) return '';
  // Заменяем блочные элементы на переносы строк
  let s = String(html);
  s = s.replace(/<\/p>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/h[1-6]>/gi, '\n');
  s = s.replace(/<\/li>/gi, '\n');
  // Удаляем все остальные теги
  s = s.replace(/<[^>]+>/g, '');
  // Декодируем основные HTML-сущности
  s = s.replace(/&nbsp;/g, ' ')
       .replace(/&amp;/g, '&')
       .replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'");
  // Схлопываем множественные пустые строки
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/* ============================================================
   Главный экспорт
   ============================================================ */
async function exportLessonPDF(lessonId) {
  const lessons = Storage.get('my_lessons', {});
  const lesson = lessons[lessonId];
  if (!lesson) { showToast('Лекция не найдена', true); return; }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast('Библиотека PDF не загрузилась. Проверьте интернет.', true);
    return;
  }

  showToast('Готовим PDF, загружаем шрифт...');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  try { await ensureCyrFont(doc); }
  catch (e) { console.warn('Шрифт не загружен, продолжаем с helvetica', e); }

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  function newPageIfNeeded(needed) {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function addText(text, opts = {}) {
    const size = opts.size || 11;
    const style = opts.style || 'normal';
    const color = opts.color || [30, 30, 30];
    const lineH = size * 0.45;
    safeSetFont(doc, style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(String(text || ''), contentW);
    lines.forEach(line => {
      newPageIfNeeded(lineH);
      doc.text(line, margin, y);
      y += lineH;
    });
  }

  function addLinkText(prefix, url, opts = {}) {
    const size = opts.size || 10;
    const lineH = size * 0.45;
    safeSetFont(doc, 'normal');
    doc.setFontSize(size);
    doc.setTextColor(30, 80, 200);

    const displayUrl = shortenUrl(url);
    const fullText = prefix + displayUrl;
    const lines = doc.splitTextToSize(fullText, contentW);

    lines.forEach((line, idx) => {
      newPageIfNeeded(lineH);
      doc.text(line, margin, y);
      if (idx === lines.length - 1 && !url.startsWith('data:')) {
        doc.link(margin, y - size * 0.35, doc.getTextWidth(line), size * 0.5, { url });
      }
      y += lineH;
    });
    y += 2;
  }

  /* --- Заголовок --- */
  addText(lesson.title || 'Без названия', { size: 20, style: 'bold', color: [20, 20, 60] });
  y += 2;

  /* --- Метаданные --- */
  const metaParts = [];
  if (lesson.subject) metaParts.push('Предмет: ' + lesson.subject);
  if (lesson.author) metaParts.push('Автор: ' + lesson.author);
  if (lesson.createdAt) metaParts.push('Дата: ' + lesson.createdAt);
  if (metaParts.length) addText(metaParts.join('   |   '), { size: 10, color: [100, 100, 120] });
  y += 3;

  newPageIfNeeded(4);
  doc.setDrawColor(180, 180, 200);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  /* --- Блоки контента --- */
  const blocks = (lesson.blocks && lesson.blocks.length)
    ? lesson.blocks
    : (lesson.content ? [{ type: 'text', value: lesson.content }] : []);

  for (const block of blocks) {
    if (!block || !block.type) continue;

    if (block.type === 'text') {
      const plain = stripHtmlToPlain(block.value || '');
      addText(plain, { size: 11 });
      y += 4;
    }
    else if (block.type === 'media') {
      if (!block.url) continue;
      const ytMatch = block.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch) {
        addLinkText('Видео (YouTube): ', 'https://www.youtube.com/watch?v=' + ytMatch[1]);
        y += 2;
        continue;
      }
      const isVideo = block.mediaType === 'video' ||
                      block.url.startsWith('data:video/') ||
                      /\.(mp4|webm|ogv|mov|m4v|avi)(\?|#|$)/i.test(block.url);
      if (isVideo && !block.url.startsWith('data:image/')) {
        addLinkText('Видео: ', block.url);
        y += 2;
        continue;
      }
      try {
        const img = await loadImageForPDF(block.url);
        const maxW = contentW;
        const maxH = 120;
        let w = img.width, h = img.height;
        const ratio = Math.min(maxW / w, maxH / h, 1);
        w *= ratio; h *= ratio;
        newPageIfNeeded(h + 6);
        doc.addImage(img.dataUrl, 'JPEG', margin, y, w, h, undefined, 'FAST');
        y += h + 2;
        if (block.caption) addText(block.caption, { size: 9, color: [120, 120, 120] });
        y += 4;
      } catch (e) {
        console.warn('Не удалось вставить изображение', block.url, e);
        if (block.caption) addText(block.caption, { size: 10, color: [60, 60, 60] });
        addLinkText('Ссылка на изображение: ', block.url);
        y += 2;
      }
    }
    else if (block.type === 'file') {
      const name = block.fileName || 'Файл';
      if (block.url && !block.url.startsWith('data:')) {
        addText(name, { size: 10, color: [60, 60, 60] });
        addLinkText('Скачать: ', block.url);
      } else if (block.url && block.url.startsWith('data:')) {
        addText('Файл: ' + name + ' (встроен)', { size: 10, color: [60, 60, 60] });
        y += 2;
      } else {
        addText('Файл: ' + name, { size: 10, color: [60, 60, 60] });
        y += 2;
      }
    }
  }

  /* --- Тест --- */
  if (lesson.hasTest && Array.isArray(lesson.questions) && lesson.questions.length) {
    newPageIfNeeded(20);
    y += 4;
    doc.setDrawColor(180, 180, 200);
    doc.line(margin, y, pageW - margin, y);
    y += 8;
    addText('Тест', { size: 16, style: 'bold', color: [20, 20, 60] });
    y += 2;

    lesson.questions.forEach((q, i) => {
      newPageIfNeeded(20);
      addText(`Вопрос ${i + 1}. ${q.text || ''}`, { size: 11, style: 'bold' });

      if (q.type === 'single' || q.type === 'multiple') {
        const opts = q.options || [];
        opts.forEach((opt, j) => {
          let mark = '';
          if (q.type === 'single' && q.correct === j) mark = '  [верно]';
          else if (q.type === 'multiple' && Array.isArray(q.correct) && q.correct.includes(j)) mark = '  [верно]';
          addText(`   ${String.fromCharCode(1072 + j)}) ${opt}${mark}`, { size: 10, color: [60, 60, 60] });
        });
      }
      else if (q.type === 'open') {
        addText(`   Правильный ответ: ${q.answer || ''}`, { size: 10, color: [60, 60, 60] });
      }
      else if (q.type === 'match') {
        addText('   Соответствие:', { size: 10, color: [60, 60, 60] });
        const left = q.left || [];
        const right = q.right || [];
        const correct = Array.isArray(q.correct) ? q.correct : [];
        left.forEach((l, j) => {
          const r = right[correct[j]] || '';
          addText(`     ${j + 1}. ${l}  →  ${r}`, { size: 10, color: [60, 60, 60] });
        });
      }
      else if (q.type === 'sort') {
        addText('   Правильный порядок:', { size: 10, color: [60, 60, 60] });
        const items = q.items || [];
        const correct = Array.isArray(q.correct) ? q.correct : items.map((_, idx) => idx);
        correct.forEach((origIdx, pos) => {
          addText(`     ${pos + 1}. ${items[origIdx] || ''}`, { size: 10, color: [60, 60, 60] });
        });
      }

      y += 3;
    });
  }

  /* --- Футер --- */
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    safeSetFont(doc, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(`Стр. ${i} из ${totalPages}`, pageW - margin, pageH - 8, { align: 'right' });
    doc.text('EduPlatform', margin, pageH - 8);
  }

  const safeTitle = (lesson.title || 'lesson').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 50);
  doc.save(`${safeTitle}.pdf`);
  showToast('PDF-файл скачан');
}