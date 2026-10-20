/* ============================================================
   FAVORITES — избранное
   ============================================================ */

function getFavorites() {
  return Storage.get('favorites', {});
}
function saveFavorites(favs) {
  Storage.set('favorites', favs);
}
function isFavorite(lessonId) {
  const favs = getFavorites();
  return (favs[getUserKey()] || []).includes(lessonId);
}
function getMyFavCount() {
  return (getFavorites()[getUserKey()] || []).length;
}
function toggleFavorite(lessonId) {
  const favs = getFavorites();
  const key = getUserKey();
  if (!favs[key]) favs[key] = [];
  const idx = favs[key].indexOf(lessonId);

  if (idx > -1) {
    favs[key].splice(idx, 1);
    saveFavorites(favs);
    return false;
  }

  favs[key].push(lessonId);
  saveFavorites(favs);

  // Проверка значков (например «Коллекционер» — 5 лайков)
  if (typeof Achievements !== 'undefined') {
    Achievements.checkAchievements(key);
  }

  return true;
}
function toggleFavoriteFromCatalog(lessonId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const added = toggleFavorite(lessonId);
  showToast(added ? 'Добавлено в избранное' : 'Удалено из избранного');
  if (typeof renderCatalog === 'function') renderCatalog();
}