// Local SVG icon system — no internet required.
// Monkey-patches window.U.el so every emoji string is auto-replaced with an inline SVG.
(function () {
  // SVG inner content (24×24 viewBox, stroke-based, no external deps)
  const S = {
    // nav / sidebar
    '⏱': '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/><line x1="9" y1="3" x2="8" y2="1"/><line x1="15" y1="3" x2="16" y2="1"/>',
    '💰': '<circle cx="12" cy="12" r="9"/><path d="M14.5 9h-5a1.5 1.5 0 000 3h5a1.5 1.5 0 010 3H9"/><line x1="12" y1="6" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="18"/>',
    '💸': '<rect x="2" y="7" width="20" height="13" rx="2"/><line x1="6" y1="7" x2="8" y2="4"/><line x1="18" y1="7" x2="16" y2="4"/><circle cx="12" cy="13" r="3"/>',
    '✉':  '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    '📨': '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    '🗂': '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
    '👥': '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
    '📋': '<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>',
    // action buttons
    '✏':  '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    '🗑': '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>',
    '👤': '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    // status / misc
    '✅': '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    '⚠':  '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    '🎯': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    '💾': '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    '📊': '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    '💡': '<line x1="12" y1="22" x2="12" y2="18"/><path d="M9 18h6"/><path d="M12 2a7 7 0 017 7c0 2.5-1.33 4.69-3.33 5.9V17H8.33V14.9C6.33 13.69 5 11.5 5 9a7 7 0 017-7z"/>',
    '📄': '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    '📅': '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    '🚪': '<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 20V9l5-7"/><circle cx="16" cy="13" r="1"/>',
    '🧹': '<path d="M21 3L9 15"/><path d="M12 6L6.8 17.8a1 1 0 001.4 1.4L18 14"/>',
    '📒': '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
    '💵': '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M2 10h2M20 10h2M2 14h2M20 14h2"/>',
    '💳': '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    '🧮': '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/>',
    '🔄': '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>',
    '🏪': '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    '📉': '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
    '🎁': '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>',
    '🔑': '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
    '✔':  '<polyline points="20 6 9 17 4 12"/>',
    '✗':  '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    '→':  '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    // topbar
    '☰':  '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
    '⏻':  '<path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
    '▶':  '<polygon points="5 3 19 12 5 21 5 3"/>',
    '▼':  '<polyline points="6 9 12 15 18 9"/>',
    '▶':  '<polyline points="9 6 15 12 9 18"/>',
  };

  function svgEl(inner, cls) {
    const w = document.createElement('span');
    w.className = 'ui-icon' + (cls ? ' ' + cls : '');
    w.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
    return w;
  }

  function patchChild(c) {
    if (typeof c !== 'string') return c;
    const t = c.trim();
    if (S[t]) return svgEl(S[t]);
    return c;
  }

  // Patch U.el to intercept emoji text children
  const _el = window.U.el;
  window.U.el = function (tag, attrs, children) {
    if (Array.isArray(children)) {
      children = children.map(patchChild);
    } else if (typeof children === 'string') {
      children = patchChild(children);
    }
    return _el(tag, attrs, children);
  };

  // Also patch topbar buttons in index.html (static HTML, not via U.el)
  document.addEventListener('DOMContentLoaded', function () {
    // Replace text content of icon-btn elements with SVG
    document.querySelectorAll('.icon-btn, .btn-icon').forEach(function (btn) {
      var t = btn.textContent.trim();
      if (S[t]) {
        btn.innerHTML = '';
        btn.appendChild(svgEl(S[t]));
      }
    });
    // Sidebar toggle keeps its own logic but we also cover initial state
  });

  window._IC = svgEl;
  window._ICONS = S;
})();
