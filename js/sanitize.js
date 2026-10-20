/* ============================================================
   SANITIZE — очистка HTML от rich-editor
   ============================================================ */

(function () {
  const ALLOWED_TAGS = new Set([
    'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
    'H2', 'H3', 'H4', 'P', 'BR', 'UL', 'OL', 'LI',
    'A', 'SPAN', 'DIV', 'BLOCKQUOTE', 'CODE', 'PRE'
  ]);

  const BAD_PROTOCOLS = /^(javascript|vbscript|data):/i;

  function sanitizeRichHtml(html) {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = String(html);

    // Сначала убираем опасные теги целиком
    temp.querySelectorAll(
      'script, style, iframe, object, embed, form, input, button, textarea, select, link, meta'
    ).forEach(el => el.remove());

    // Обходим всех потомков
    const walker = document.createTreeWalker(temp, NodeFilter.SHOW_ELEMENT);
    const toReplace = [];

    let node = walker.currentNode;
    while (node) {
      if (node !== temp && !ALLOWED_TAGS.has(node.tagName)) {
        // Неразрешённый тег — заменяем на его текст
        toReplace.push(node);
      } else if (node !== temp) {
        // Чистим атрибуты
        [...node.attributes].forEach(attr => {
          const name = attr.name.toLowerCase();
          const value = attr.value;

          if (name.startsWith('on')) { node.removeAttribute(attr.name); return; }
          if (name === 'style')       { node.removeAttribute(attr.name); return; }

          if (name === 'href') {
            if (BAD_PROTOCOLS.test(value.trim())) {
              node.removeAttribute('href');
            } else {
              node.setAttribute('rel', 'noopener noreferrer');
              node.setAttribute('target', '_blank');
            }
            return;
          }

          if (name !== 'href' && name !== 'class' && name !== 'rel' && name !== 'target') {
            node.removeAttribute(attr.name);
          }
        });
      }
      node = walker.nextNode();
    }

    toReplace.forEach(el => {
      const text = document.createTextNode(el.textContent || '');
      el.replaceWith(text);
    });

    return temp.innerHTML;
  }

  function looksLikeHtml(str) {
    if (!str) return false;
    return /<[a-z][\s\S]*>/i.test(str);
  }

  // Экспорт в window
  window.sanitizeRichHtml = sanitizeRichHtml;
  window.looksLikeHtml = looksLikeHtml;
})();