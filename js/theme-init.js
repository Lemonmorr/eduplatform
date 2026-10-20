/* ============================================================
   THEME-INIT — синхронная установка темы до отрисовки
   ============================================================ */
(function () {
  try {
    if (localStorage.getItem('theme') === 'light') {
      document.documentElement.classList.add('light-theme');
    }
  } catch (e) { /* приватный режим — игнорируем */ }
})();