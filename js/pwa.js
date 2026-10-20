/* ============================================================
   PWA — регистрация Service Worker и кнопка "Установить"
   ============================================================ */

(function () {
  'use strict';

  /* ---------- Регистрация SW ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { scope: './' })
        .then(reg => {
          console.log('[PWA] SW зарегистрирован:', reg.scope);

          // Проверяем обновления раз в час
          setInterval(() => reg.update(), 60 * 60 * 1000);
        })
        .catch(err => {
          console.warn('[PWA] SW регистрация не удалась:', err);
        });
    });

    // Обновление: если есть новый SW — активируем после согласия
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  /* ---------- beforeinstallprompt ---------- */
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    hideInstallBanner();
    deferredPrompt = null;
    if (typeof showToast === 'function') showToast('📱 Приложение установлено!');
  });

  /* ---------- Баннер установки ---------- */
  function showInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.className = 'pwa-install-banner';
    banner.innerHTML = `
      <div class="pwa-install-icon">📱</div>
      <div class="pwa-install-info">
        <div class="pwa-install-title">Установить EduPlatform</div>
        <div class="pwa-install-subtitle">Открывать как приложение, работать офлайн</div>
      </div>
      <div class="pwa-install-actions">
        <button type="button" class="pwa-install-btn-close" onclick="window.__pwaHideBanner()">Позже</button>
        <button type="button" class="pwa-install-btn-go" onclick="window.__pwaInstall()">Установить</button>
      </div>
    `;
    document.body.appendChild(banner);

    requestAnimationFrame(() => banner.classList.add('visible'));

    // Автоскрытие через 30 секунд
    setTimeout(() => hideInstallBanner(), 30000);
  }

  function hideInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (!banner) return;
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 300);
  }

  window.__pwaHideBanner = hideInstallBanner;

  window.__pwaInstall = async function () {
    if (!deferredPrompt) {
      hideInstallBanner();
      return;
    }
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    console.log('[PWA] Ответ пользователя:', choice.outcome);
    deferredPrompt = null;
    hideInstallBanner();
  };

  /* ---------- Индикатор офлайн ---------- */
  function updateOnlineStatus() {
    const existing = document.getElementById('offline-indicator');
    if (navigator.onLine) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;

    const ind = document.createElement('div');
    ind.id = 'offline-indicator';
    ind.className = 'offline-indicator';
    ind.textContent = '📡 Нет подключения — работаем офлайн';
    document.body.appendChild(ind);
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  document.addEventListener('DOMContentLoaded', updateOnlineStatus);
})();