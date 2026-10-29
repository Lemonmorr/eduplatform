/* ============================================================
   LESSON — логика просмотра лекции
   ============================================================ */

let currentProgress = { read: [], total: 0, scrollPercent: 0 };
let lastProgress = null;
let resumeOffered = false;
let ioObserver = null;
let scrollHandler = null;
let resizeObserver = null;
let __xpAwardedForRead = false;

if (typeof looksLikeHtml !== 'function') {
  window.looksLikeHtml = function (str) {
    if (!str) return false;
    return /<[a-z][\s\S]*>/i.test(str);
  };
}
if (typeof sanitizeRichHtml !== 'function') {
  window.sanitizeRichHtml = function (html) {
    const temp = document.createElement('div');
    temp.innerHTML = html || '';
    temp.querySelectorAll('script, style, iframe, object, embed, form, input, button').forEach(el => el.remove());
    return temp.innerHTML;
  };
}

function computeScrollPercent() {
  const el = document.scrollingElement || document.documentElement;
  const scrollable = el.scrollHeight - el.clientHeight;
  if (scrollable <= 0) return 0; // ФИКС БАГА: изменено с 100 на 0
  const pct = (el.scrollTop / scrollable) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

function updateProgressUI(percent) {
  const fill = document.getElementById('progress-fill');
  const pctEl = document.getElementById('progress-percent');
  if (fill) fill.style.width = percent + '%';
  if (pctEl) pctEl.textContent = percent + '%';
}

/* ---------- Рендер блоков + глоссарий ---------- */
function renderLessonContent(container, lesson) {
  container.innerHTML = '';
  const blocks = (lesson.blocks && lesson.blocks.length)
    ? lesson.blocks
    : (lesson.content ? [{ type: 'text', value: lesson.content }] : []);

  blocks.forEach((block, idx) => {
    if (!block || !block.type) return;
    const wrap = document.createElement('div');
    wrap.className = 'block-anchor';
    wrap.id = 'block-' + idx;
    wrap.dataset.blockIndex = idx;

    const mark = document.createElement('span');
    mark.className = 'block-read-mark';
    mark.textContent = '✓ Прочитано';
    wrap.appendChild(mark);

    if (block.type === 'text') {
      const div = document.createElement('div');
      div.className = 'lesson-text-block';
      const value = block.value || '';
      if (looksLikeHtml(value)) div.innerHTML = sanitizeRichHtml(value);
      else { div.textContent = value; div.style.whiteSpace = 'pre-wrap'; }
      wrap.appendChild(div);
    } else if (block.type === 'media') {
      if (!block.url) return;
      const mw = document.createElement('div');
      mw.className = 'lesson-media-block';
      const ytId = getYouTubeId(block.url);
      if (ytId) {
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${ytId}`;
        iframe.allowFullscreen = true;
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
        mw.appendChild(iframe);
      } else if (block.mediaType === 'video') {
        const video = document.createElement('video');
        video.src = block.url;
        video.controls = true;
        video.preload = 'metadata';
        mw.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = block.url;
        img.alt = block.caption || '';
        img.loading = 'lazy';
        mw.appendChild(img);
      }
      if (block.caption) {
        const cap = document.createElement('div');
        cap.className = 'lesson-media-caption';
        cap.textContent = block.caption;
        mw.appendChild(cap);
      }
      wrap.appendChild(mw);
    } else if (block.type === 'file') {
      if (!block.url) return;
      const a = document.createElement('a');
      a.className = 'lesson-file-block';
      a.href = block.url;
      a.target = '_blank';
      a.rel = 'noopener';
      if (block.fileName) a.download = block.fileName;
      a.textContent = block.fileName || 'Скачать файл';
      wrap.appendChild(a);
    }
    container.appendChild(wrap);
  });

  if (window.Glossary) {
    try { window.Glossary.initGlossaryInLesson(container, lesson); }
    catch (e) { console.warn('Glossary error:', e); }
  }
}

/* ---------- Прогресс ---------- */
function initReadingProgress() {
  const lectureContentEl = document.getElementById('lecture-content');
  const blocks = lectureContentEl.querySelectorAll('.block-anchor');
  const total = blocks.length;
  if (total === 0) return;

  const lessonId = new URLSearchParams(window.location.search).get('id');

  document.getElementById('progress-wrap').classList.add('visible');
  document.body.classList.add('has-progress');

  let maxScrollPercent = 0;
  const blocksSeen = new Set();
  let startTime = Date.now(); // ФИКС БАГА: защита от мгновенного прочтения

  lastProgress = getReadingProgress(lessonId, getUserKey());
  if (lastProgress) {
    if (Array.isArray(lastProgress.read)) lastProgress.read.forEach(i => blocksSeen.add(i));
    const oldScrollDone = typeof lastProgress.scrollPercent === 'number' && lastProgress.scrollPercent >= 100;
    if (oldScrollDone) {
      lastProgress = null;
      clearReadingProgress(lessonId, getUserKey());
    } else if (typeof lastProgress.scrollPercent === 'number') {
      maxScrollPercent = lastProgress.scrollPercent;
    } else {
      maxScrollPercent = Math.round((lastProgress.read.length / total) * 100);
    }
  }

  currentProgress = {
    read: Array.from(blocksSeen).sort((a, b) => a - b),
    total, scrollPercent: maxScrollPercent
  };
  updateProgressUI(maxScrollPercent);

  blocks.forEach(b => {
    const idx = parseInt(b.dataset.blockIndex, 10);
    if (blocksSeen.has(idx)) b.classList.add('is-read');
  });

  if (lastProgress && !resumeOffered) {
    resumeOffered = true;
    showResumePanel(lastProgress, total);
  }

  let rafPending = false;
  let lastPersistTs = 0;
  const PERSIST_INTERVAL_MS = 300;

  function persistProgress() {
    if (Date.now() - startTime < 3000) return; // ФИКС БАГА: ждём 3 секунды
    if (maxScrollPercent <= 0) return;
    const now = Date.now();
    if (now - lastPersistTs < PERSIST_INTERVAL_MS) return;
    lastPersistTs = now;

    const data = { read: [...currentProgress.read], total, scrollPercent: maxScrollPercent };
    if (maxScrollPercent >= 100) data.completedAt = new Date().toISOString();
    saveReadingProgress(lessonId, data, getUserKey());
  }

  function checkVisibleBlocks() {
    if (Date.now() - startTime < 3000) return; // ФИКС БАГА: не проверяем первые 3 секунды
    rafPending = false;
    const vh = window.innerHeight;
    let changed = false;

    blocks.forEach(b => {
      const rect = b.getBoundingClientRect();
      if (rect.top < vh && rect.bottom > 0) {
        const idx = parseInt(b.dataset.blockIndex, 10);
        if (!blocksSeen.has(idx)) {
          blocksSeen.add(idx);
          b.classList.add('is-read');
          changed = true;
        }
      }
    });

    const newPct = computeScrollPercent();
    if (newPct > maxScrollPercent) { maxScrollPercent = newPct; changed = true; }

    // УДАЛЕН БЛОК noScroll (короткие лекции больше не помечаются прочитанными автоматически)

    if (changed) {
      currentProgress = {
        read: Array.from(blocksSeen).sort((a, b) => a - b),
        total, scrollPercent: maxScrollPercent
      };
      updateProgressUI(maxScrollPercent);
      lastPersistTs = 0;
      persistProgress();

      if (maxScrollPercent >= 100 && !__xpAwardedForRead) {
        __xpAwardedForRead = true;
        if (typeof Achievements !== 'undefined') {
          const user = getCurrentUser();
          if (user && user.email) {
            Achievements.addXP(10, user.email);
            Achievements.checkAchievements(user.email);
          }
        }
      }
    }
  }

  function scheduleCheck() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(checkVisibleBlocks);
  }

  window.__checkVisibleBlocks = checkVisibleBlocks;
  [80, 300, 800, 2000].forEach(t => setTimeout(checkVisibleBlocks, t));

  window.addEventListener('load', () => {
    checkVisibleBlocks();
    setTimeout(checkVisibleBlocks, 100);
    setTimeout(checkVisibleBlocks, 500);
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { checkVisibleBlocks(); setTimeout(checkVisibleBlocks, 200); });
  }

  if (window.ResizeObserver) {
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => scheduleCheck());
    try { resizeObserver.observe(document.body); resizeObserver.observe(lectureContentEl); } catch (e) {}
  }

  if (ioObserver) ioObserver.disconnect();
  ioObserver = new IntersectionObserver((entries) => {
    let hasIntersect = false;
    entries.forEach(entry => { if (entry.isIntersecting) hasIntersect = true; });
    if (hasIntersect) scheduleCheck();
  }, { root: null, threshold: [0, 0.01, 0.1, 0.25, 0.5, 0.75, 1], rootMargin: '200px 0px 200px 0px' });
  blocks.forEach(b => ioObserver.observe(b));

  if (scrollHandler) window.removeEventListener('scroll', scrollHandler);
  scrollHandler = () => scheduleCheck();
  window.addEventListener('scroll', scrollHandler, { passive: true });
  window.addEventListener('scrollend', checkVisibleBlocks, { passive: true });
  window.addEventListener('resize', scheduleCheck);

  window.addEventListener('beforeunload', () => {
    if (maxScrollPercent > 0) {
      const data = { read: [...currentProgress.read], total, scrollPercent: maxScrollPercent };
      if (maxScrollPercent >= 100) data.completedAt = new Date().toISOString();
      saveReadingProgress(lessonId, data, getUserKey());
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { lastPersistTs = 0; persistProgress(); }
  });
}

function showResumePanel(savedProgress, total) {
  const panel = document.getElementById('resume-panel');
  if (!panel) return;
  let firstUnread = 0;
  for (let i = 0; i < total; i++) {
    if (!savedProgress.read.includes(i)) { firstUnread = i; break; }
  }
  let percent = 0;
  if (typeof savedProgress.scrollPercent === 'number') percent = savedProgress.scrollPercent;
  else percent = Math.round((savedProgress.read.length / total) * 100);

  document.getElementById('resume-percent').textContent = percent + '%';
  document.getElementById('resume-block-num').textContent = (firstUnread + 1);
  document.getElementById('resume-block-total').textContent = total;
  setTimeout(() => panel.classList.add('visible'), 700);
}
function dismissResumePanel() {
  const panel = document.getElementById('resume-panel');
  if (panel) panel.classList.remove('visible');
}
function restoreProgress() {
  if (!lastProgress) return;
  const lectureContentEl = document.getElementById('lecture-content');
  const total = currentProgress.total || lectureContentEl.querySelectorAll('.block-anchor').length;

  const readArr = Array.isArray(lastProgress.read) ? [...lastProgress.read] : [];
  currentProgress = {
    read: readArr, total,
    scrollPercent: (typeof lastProgress.scrollPercent === 'number') ? lastProgress.scrollPercent : 0
  };

  lectureContentEl.querySelectorAll('.block-anchor').forEach(b => {
    const idx = parseInt(b.dataset.blockIndex, 10);
    if (currentProgress.read.includes(idx)) b.classList.add('is-read');
  });

  updateProgressUI(currentProgress.scrollPercent);

  let firstUnread = 0;
  for (let i = 0; i < total; i++) { if (!currentProgress.read.includes(i)) { firstUnread = i; break; } }
  const el = document.getElementById('block-' + firstUnread);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.style.transition = 'background 0.6s';
    el.style.background = 'rgba(99, 102, 241, 0.2)';
    setTimeout(() => { el.style.background = ''; }, 1800);
  }

  dismissResumePanel();
  showToast('Прогресс восстановлен!');
  if (window.__checkVisibleBlocks) setTimeout(window.__checkVisibleBlocks, 500);
}
function startFromScratch() {
  const lectureContentEl = document.getElementById('lecture-content');
  const lessonId = new URLSearchParams(window.location.search).get('id');
  const total = lectureContentEl.querySelectorAll('.block-anchor').length;
  currentProgress = { read: [], total, scrollPercent: 0 };
  clearReadingProgress(lessonId, getUserKey());
  lectureContentEl.querySelectorAll('.block-anchor').forEach(el => el.classList.remove('is-read'));
  updateProgressUI(0);
  dismissResumePanel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('Начинаем с начала!');
}

function incrementViews(lessonId) {
  const allLessons = Storage.get('my_lessons', {});
  if (!allLessons[lessonId]) return;
  const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const authorEmail = allLessons[lessonId].authorEmail;
  if (user && authorEmail && user.email === authorEmail) return;
  const userKey = (user && user.email) ? user.email : 'guest';
  const today = localTodayISO();
  const viewKey = `view_counted_${lessonId}_${userKey}_${today}`;
  try { if (localStorage.getItem(viewKey)) return; } catch (e) {}
  allLessons[lessonId].views = (allLessons[lessonId].views || 0) + 1;
  Storage.set('my_lessons', allLessons);
  try { localStorage.setItem(viewKey, '1'); } catch (e) {}
}

function updateFavButton(lessonId) {
  const btn = document.getElementById('fav-btn');
  if (!btn) return;
  if (isFavorite(lessonId)) { btn.textContent = '★'; btn.classList.add('active'); }
  else { btn.textContent = '☆'; btn.classList.remove('active'); }
}
function toggleFavoriteFromLesson(lessonId) {
  const added = toggleFavorite(lessonId);
  showToast(added ? 'Добавлено в избранное' : 'Удалено из избранного');
  updateFavButton(lessonId);
}

function shareLesson() {
  const lessonId = new URLSearchParams(window.location.search).get('id');
  if (!lessonId) return;
  const allLessons = Storage.get('my_lessons', {});
  const lesson = allLessons[lessonId] || {};
  const url = window.location.href;
  if (navigator.share) {
    navigator.share({
      title: lesson.title || 'Лекция',
      text: lesson.subject ? `Лекция: ${lesson.title} (${lesson.subject})` : `Лекция: ${lesson.title || ''}`,
      url
    }).catch(() => {});
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => showToast('Ссылка скопирована!'))
      .catch(() => showToast('Не удалось скопировать ссылку', true));
  } else {
    const tmp = document.createElement('input');
    tmp.value = url;
    document.body.appendChild(tmp);
    tmp.select();
    try { document.execCommand('copy'); showToast('Ссылка скопирована!'); }
    catch (e) { showToast('Не удалось скопировать ссылку', true); }
    document.body.removeChild(tmp);
  }
}

/* ============================================================
   ТЕСТ
   ============================================================ */
let studentFIO = '';
let currentStep = 0;
let userAnswers = [];
let currentSelected = [];
let timerInterval = null;
let testItem = null;
let currentLessonId = null;

function getAttemptNumber(lessonId, userEmail) {
  if (!userEmail) return 1;
  const results = Storage.get('test_results', []).filter(r =>
    r.lessonId === lessonId && r.userEmail === userEmail
  );
  return results.length + 1;
}

function startTestProcess() {
  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  
  // ФИКС БАГА: Запрет теста для неавторизованных и без ФИО
  if (!currentUser) {
    showToast('Для прохождения теста необходимо авторизоваться.', true);
    window.location.href = 'index.html';
    return;
  }
  if (!currentUser.fio) {
    showToast('Пожалуйста, заполните ФИО в профиле.', true);
    return;
  }

  studentFIO = currentUser.fio;
  document.getElementById('fio-start-block').style.display = 'none';
  document.getElementById('test-process-block').style.display = 'block';
  startTimer(testItem.timeLimitMinutes || 0);
  renderStep();
}

function renderStep() {
  const total = testItem.questions.length;
  const q = testItem.questions[currentStep];
  document.getElementById('progress-fill-test').style.width = `${((currentStep + 1) / total) * 100}%`;
  document.getElementById('step-counter-text').textContent = `Вопрос ${currentStep + 1} из ${total}`;

  const progressEl = document.getElementById('test-progress-text');
  if (progressEl) progressEl.textContent = `Отвечено: ${currentStep} из ${total}`;

  document.getElementById('step-question-text').textContent = q.text;

  const optsContainer = document.getElementById('step-options-container');
  optsContainer.innerHTML = '';
  currentSelected = [];

  const nextBtn = document.getElementById('next-btn');
  nextBtn.disabled = true;
  nextBtn.textContent = (currentStep === total - 1) ? 'Завершить тест' : 'Подтвердить ответ';

  if (q.type === 'single' || q.type === 'multiple') renderSingleMultiple(q, optsContainer, nextBtn);
  else if (q.type === 'open') renderOpen(q, optsContainer, nextBtn);
  else if (q.type === 'match') renderMatch(q, optsContainer, nextBtn);
  else if (q.type === 'sort') renderSort(q, optsContainer, nextBtn);
}

function renderSingleMultiple(q, container, nextBtn) {
  q.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<span style="font-weight:bold;">${idx + 1}.</span> ${escapeHtml(opt)}`;
    btn.onclick = () => {
      if (q.type === 'single') {
        document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        currentSelected = [idx];
      } else {
        btn.classList.toggle('selected');
        if (btn.classList.contains('selected')) currentSelected.push(idx);
        else currentSelected = currentSelected.filter(i => i !== idx);
      }
      nextBtn.disabled = currentSelected.length === 0;
    };
    container.appendChild(btn);
  });
}
function renderOpen(q, container, nextBtn) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'open-answer-input';
  input.placeholder = 'Введите ваш ответ...';
  input.autocomplete = 'off';
  input.oninput = () => {
    const val = input.value.trim();
    currentSelected = val ? [val] : [];
    nextBtn.disabled = !val;
  };
  container.appendChild(input);
}
function renderMatch(q, container, nextBtn) {
  const rightOrder = q.right.map((val, i) => ({ val, i }));
  shuffleArray(rightOrder);
  const wrap = document.createElement('div');
  wrap.className = 'match-question';
  const leftCol = document.createElement('div');
  leftCol.className = 'match-col';
  leftCol.innerHTML = `<div class="match-col-title">Левая часть</div>`;
  const rightCol = document.createElement('div');
  rightCol.className = 'match-col';
  rightCol.innerHTML = `<div class="match-col-title">Правая часть</div>`;
  const pairs = {};
  let selectedLeft = null;

  q.left.forEach((leftVal, lIdx) => {
    const el = document.createElement('div');
    el.className = 'match-item selectable';
    el.dataset.left = lIdx;
    el.innerHTML = escapeHtml(leftVal);
    el.onclick = () => {
      leftCol.querySelectorAll('.match-item').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
      selectedLeft = lIdx;
    };
    leftCol.appendChild(el);
  });

  rightOrder.forEach(({ val, i }) => {
    const el = document.createElement('div');
    el.className = 'match-item selectable';
    el.dataset.right = i;
    el.innerHTML = escapeHtml(val);
    el.onclick = () => {
      if (selectedLeft === null) return;
      const existingLeft = Object.keys(pairs).find(k => pairs[k] === i);
      if (existingLeft !== undefined) delete pairs[existingLeft];
      if (pairs[selectedLeft] !== undefined) {
        const oldRight = pairs[selectedLeft];
        const oldRightEl = rightCol.querySelector(`[data-right="${oldRight}"]`);
        if (oldRightEl) {
          oldRightEl.classList.remove('paired');
          const badge = oldRightEl.querySelector('.pair-badge');
          if (badge) badge.remove();
        }
      }
      pairs[selectedLeft] = i;
      el.classList.add('paired');
      el.querySelector('.pair-badge')?.remove();
      const badge = document.createElement('span');
      badge.className = 'pair-badge';
      badge.textContent = String(selectedLeft + 1);
      el.appendChild(badge);
      leftCol.querySelectorAll('.match-item').forEach(x => x.classList.remove('selected'));
      selectedLeft = null;
      const complete = Object.keys(pairs).length === q.left.length;
      currentSelected = Object.keys(pairs).map(k => [parseInt(k, 10), pairs[k]]);
      nextBtn.disabled = !complete;
    };
    rightCol.appendChild(el);
  });

  wrap.appendChild(leftCol);
  wrap.appendChild(rightCol);
  container.appendChild(wrap);
}
function renderSort(q, container, nextBtn) {
  const order = q.items.map((val, i) => ({ val, i }));
  shuffleArray(order);
  const wrap = document.createElement('div');
  wrap.className = 'sort-question';
  let dragEl = null;

  order.forEach(({ val, i }, pos) => {
    const el = document.createElement('div');
    el.className = 'sort-item';
    el.draggable = true;
    el.dataset.origIndex = i;
    el.innerHTML = `
      <span class="sort-handle">⋮⋮</span>
      <span class="sort-pos">${pos + 1}</span>
      <span>${escapeHtml(val)}</span>
    `;
    el.addEventListener('dragstart', (e) => {
      dragEl = el;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      document.querySelectorAll('.sort-item').forEach(x => x.classList.remove('drag-over'));
      updateSortAnswer();
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (el === dragEl) return;
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (!dragEl || dragEl === el) return;
      const parent = el.parentNode;
      const children = Array.from(parent.children);
      const dragIndex = children.indexOf(dragEl);
      const dropIndex = children.indexOf(el);
      if (dragIndex < dropIndex) parent.insertBefore(dragEl, el.nextSibling);
      else parent.insertBefore(dragEl, el);
      Array.from(parent.children).forEach((child, idx) => {
        child.querySelector('.sort-pos').textContent = idx + 1;
      });
    });
    wrap.appendChild(el);
  });

  function updateSortAnswer() {
    const ordered = Array.from(wrap.children).map(el => parseInt(el.dataset.origIndex, 10));
    currentSelected = ordered;
    nextBtn.disabled = false;
  }
  currentSelected = Array.from(wrap.children).map(el => parseInt(el.dataset.origIndex, 10));
  nextBtn.disabled = false;
  container.appendChild(wrap);
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function normalizeAnswer(str) {
  return String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function nextQuestion() {
  const q = testItem.questions[currentStep];
  let answer;
  if (q.type === 'single') answer = currentSelected[0];
  else if (q.type === 'multiple') answer = [...currentSelected].sort((a, b) => a - b);
  else if (q.type === 'open') answer = currentSelected[0];
  else if (q.type === 'match') {
    const result = new Array(q.left.length).fill(-1);
    currentSelected.forEach(([l, r]) => { result[l] = r; });
    answer = result;
  } else if (q.type === 'sort') answer = currentSelected;

  userAnswers.push(answer);
  currentStep++;
  if (currentStep < testItem.questions.length) renderStep();
  else finishTest();
}

function startTimer(minutes) {
  if (!minutes || minutes <= 0) return;
  let secondsLeft = minutes * 60;
  const display = document.getElementById('timer-display');
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  display.textContent = `Осталось времени: ${m}:${s < 10 ? '0' : ''}${s}`;
  timerInterval = setInterval(() => {
    secondsLeft--;
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    display.textContent = `Осталось времени: ${m}:${s < 10 ? '0' : ''}${s}`;
    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
      showToast('Время вышло!');
      finishTest();
    }
  }, 1000);
}

function isAnswerCorrect(q, uAns) {
  if (q.type === 'single') return uAns === q.correct;
  if (q.type === 'multiple') {
    const target = Array.isArray(q.correct) ? [...q.correct].sort((a, b) => a - b) : [];
    const user = Array.isArray(uAns) ? [...uAns].sort((a, b) => a - b) : [];
    return JSON.stringify(user) === JSON.stringify(target);
  }
  if (q.type === 'open') return normalizeAnswer(uAns) === normalizeAnswer(q.answer);
  if (q.type === 'match') {
    if (!Array.isArray(q.correct) || !Array.isArray(uAns)) return false;
    if (q.correct.length !== uAns.length) return false;
    for (let i = 0; i < q.correct.length; i++) if (q.correct[i] !== uAns[i]) return false;
    return true;
  }
  if (q.type === 'sort') {
    if (!Array.isArray(q.correct) || !Array.isArray(uAns)) return false;
    if (q.correct.length !== uAns.length) return false;
    for (let i = 0; i < q.correct.length; i++) if (q.correct[i] !== uAns[i]) return false;
    return true;
  }
  return false;
}

function finishTest() {
  if (timerInterval) clearInterval(timerInterval);
  document.getElementById('test-process-block').style.display = 'none';
  document.getElementById('results-container').style.display = 'block';

  let correctCount = 0;
  testItem.questions.forEach((q, idx) => {
    if (isAnswerCorrect(q, userAnswers[idx])) correctCount++;
  });

  const percent = Math.round((correctCount / testItem.questions.length) * 100);
  const t = testItem.gradeThresholds || { g5: 90, g4: 75, g3: 50 };
  let grade = '2';
  if (percent >= t.g5) grade = '5';
  else if (percent >= t.g4) grade = '4';
  else if (percent >= t.g3) grade = '3';

  document.getElementById('student-name-result').textContent = `Студент: ${studentFIO}`;
  document.getElementById('score-text').textContent = `Правильных ответов: ${correctCount} из ${testItem.questions.length} (${percent}%)`;
  document.getElementById('grade-badge').textContent = `Ваша оценка: ${grade}`;

  const now = new Date();
  const isoDate = localTodayISO();
  const results = Storage.get('test_results', []);

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const userEmail = currentUser ? currentUser.email : '';
  const attemptNumber = getAttemptNumber(currentLessonId, userEmail);

  const existingAttemptInfo = document.getElementById('attempt-info');
  if (existingAttemptInfo) existingAttemptInfo.remove();
  if (testItem.allowRetakes) {
    const info = document.createElement('div');
    info.id = 'attempt-info';
    info.style.cssText = 'font-size:12px; color:var(--text-muted); margin-top:8px; font-weight:600;';
    info.textContent = `Попытка №${attemptNumber}`;
    document.getElementById('grade-badge').insertAdjacentElement('afterend', info);
  }

  results.push({
    lessonId: currentLessonId,
    lessonTitle: testItem.title,
    fio: studentFIO,
    userEmail,
    score: `${correctCount}/${testItem.questions.length}`,
    percent, grade,
    date: now.toLocaleString('ru-RU'),
    isoDate,
    attemptNumber,
    allowRetakesAtTime: !!testItem.allowRetakes
  });

  const MAX_RESULTS = 500;
  if (results.length > MAX_RESULTS) results.splice(0, results.length - MAX_RESULTS);

  Storage.set('test_results', results);

  if (typeof Achievements !== 'undefined' && userEmail) {
    Achievements.addXP(20, userEmail);
    if (percent === 100) Achievements.addXP(30, userEmail);
    Achievements.checkAchievements(userEmail);
  }
}

document.addEventListener('keydown', (e) => {
  if (!testItem) return;
  const testProcess = document.getElementById('test-process-block');
  if (!testProcess || testProcess.style.display === 'none') return;

  const nextBtn = document.getElementById('next-btn');
  if (!nextBtn) return;

  if (e.key === 'Enter') {
    const active = document.activeElement;
    if (active && active.tagName === 'INPUT' && active.classList.contains('open-answer-input')) {
      if (!nextBtn.disabled) { e.preventDefault(); nextQuestion(); }
      return;
    }
    if (!nextBtn.disabled) { e.preventDefault(); nextQuestion(); }
    return;
  }

  const q = testItem.questions[currentStep];
  if (!q) return;
  if (q.type !== 'single' && q.type !== 'multiple') return;

  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= q.options.length) {
    e.preventDefault();
    const btn = document.querySelectorAll('.option-btn')[num - 1];
    if (btn) btn.click();
  }
});

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  currentLessonId = new URLSearchParams(window.location.search).get('id');
  const lessons = Storage.get('my_lessons', {});
  const item = lessons[currentLessonId];
  testItem = item;

  const lectureContentEl = document.getElementById('lecture-content');
  const metaRow = document.getElementById('lesson-meta-row');

  if (!item) {
    document.getElementById('lecture-title').textContent = 'Лекция не найдена';
    const favBtn = document.getElementById('fav-btn');
    const shareBtn = document.getElementById('share-btn');
    if (favBtn) favBtn.style.display = 'none';
    if (shareBtn) shareBtn.style.display = 'none';
    return;
  }

  document.getElementById('lecture-title').textContent = item.title;
  renderLessonContent(lectureContentEl, item);

  let metaHtml = '';
  if (item.subject) metaHtml += `<span class="lesson-subject">${escapeHtml(item.subject)}</span>`;
  metaHtml += `<span class="lesson-views">👁 <b>${item.views || 0}</b> просмотров</span>`;
  metaRow.innerHTML = metaHtml;

  updateFavButton(currentLessonId);
  document.getElementById('fav-btn').setAttribute('onclick', `toggleFavoriteFromLesson('${escapeHtml(currentLessonId)}')`);

  incrementViews(currentLessonId);
  initReadingProgress();

  const hash = window.location.hash;
  if (hash && /^#block-\d+$/.test(hash)) {
    setTimeout(() => {
      const el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
  }

  if (item.hasTest && item.questions && item.questions.length > 0) {
    document.getElementById('test-block').style.display = 'block';
    const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    
    // ФИКС БАГА: Ограничение доступа к тесту
    if (!currentUser) {
      document.getElementById('fio-start-block').innerHTML = `
        <h2 style="margin-top: 0;">Тестирование</h2>
        <p style="color: var(--text-muted);">Для прохождения теста необходимо авторизоваться.</p>
        <a href="index.html" class="btn-submit" style="text-decoration: none; display: inline-block;">Войти на главной</a>
      `;
      document.getElementById('test-process-block').style.display = 'none';
      document.getElementById('results-container').style.display = 'none';
    } else if (!currentUser.fio) {
      document.getElementById('fio-start-block').innerHTML = `
        <h2 style="margin-top: 0;">Тестирование</h2>
        <p style="color: var(--text-muted);">Пожалуйста, заполните ФИО в профиле перед прохождением теста.</p>
        <a href="profile.html" class="btn-submit" style="text-decoration: none; display: inline-block;">Заполнить профиль</a>
      `;
      document.getElementById('test-process-block').style.display = 'none';
      document.getElementById('results-container').style.display = 'none';
    } else {
      const userEmail = currentUser.email;
      const prevResults = Storage.get('test_results', []).filter(r =>
        r.lessonId === currentLessonId && r.userEmail === userEmail
      );

      if (!item.allowRetakes && prevResults.length > 0) {
        const best = prevResults.reduce((a, b) => (a.percent > b.percent ? a : b));
        document.getElementById('fio-start-block').innerHTML = `
          <h2 style="margin-top: 0;">Тестирование</h2>
          <p style="color: var(--text-muted);">Вы уже проходили этот тест. Повторное прохождение не разрешено.</p>
          <div style="padding:16px; background: rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:10px; margin-top:12px; display:inline-block;">
            <div style="font-size:13px; color:var(--text-muted);">Лучший результат</div>
            <div style="font-size:24px; font-weight:700; color:var(--accent-light); margin-top:6px;">${best.percent}% — оценка ${best.grade}</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">${best.date}</div>
          </div>
        `;
      } else {
        const block = document.getElementById('test-block');

        if (item.deadline) {
          const today = localTodayISO();
          if (today > item.deadline) {
            const alert = document.createElement('div');
            alert.style.cssText = 'padding:10px 14px; background: rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); border-radius:8px; color:#f87171; font-weight:600; margin-bottom:16px;';
            alert.textContent = `⏰ Дедлайн теста истёк: ${formatDate(item.deadline)}. Тест можно пройти, но результат будет помечен как просроченный.`;
            block.insertBefore(alert, block.firstChild);
          } else {
            const info = document.createElement('div');
            info.style.cssText = 'padding:8px 12px; background: rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:8px; color:#fbbf24; font-size:13px; font-weight:600; margin-bottom:16px;';
            info.textContent = `⏰ Дедлайн: ${formatDate(item.deadline)}`;
            block.insertBefore(info, block.firstChild);
          }
        }

        if (item.allowRetakes && prevResults.length > 0) {
          const info = document.createElement('div');
          info.style.cssText = 'padding:8px 12px; background: rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.3); border-radius:8px; color:#a5b4fc; font-size:13px; font-weight:600; margin-bottom:16px;';
          info.textContent = `📝 Следующая попытка: №${prevResults.length + 1}. Прошлых: ${prevResults.length}.`;
          block.insertBefore(info, block.firstChild);
        }
      }
    }
  }

  if (typeof Achievements !== 'undefined') {
    const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (currentUser && currentUser.email) {
      Achievements.checkAchievements(currentUser.email);
    }
  }
});