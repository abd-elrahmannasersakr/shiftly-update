// Public policies panel — accessible from login screen without authentication.
// Also wires up the manager "change password" button in the topbar.
(function () {
  /* ── Policies overlay ─────────────────────────────────────────────── */
  const overlay  = document.getElementById('policiesOverlay');
  const content  = document.getElementById('policiesContent');
  const openBtn  = document.getElementById('viewPoliciesBtn');
  const closeBtn = document.getElementById('closePoliciesBtn');

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtNum(n) {
    return Number(n || 0).toLocaleString('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  async function loadPolicies() {
    content.innerHTML = '<div class="policies-loading">جاري التحميل...</div>';
    try {
      // Use window.API (the wrapped bridge defined in api.js) — returns data directly.
      const policies = await window.API['policies:list']();
      if (!policies || !policies.length) {
        content.innerHTML = '<div class="policies-empty">لا توجد سياسات مُضافة حتى الآن.</div>';
        return;
      }
      const bonuses   = policies.filter((p) => p.type === 'bonus');
      const penalties = policies.filter((p) => p.type !== 'bonus');
      let html = '';
      if (bonuses.length) {
        html += '<div class="pol-section-label pol-bonus-label">المكافآت</div><div class="pol-list">';
        bonuses.forEach((p) => {
          html += `<div class="pol-item pol-item-bonus">
            <div class="pol-item-name">${escapeHtml(p.name)}</div>
            <div class="pol-item-pts bonus-pts">+ ${fmtNum(p.points)} نقطة</div>
          </div>`;
        });
        html += '</div>';
      }
      if (penalties.length) {
        html += '<div class="pol-section-label pol-penalty-label">العقوبات</div><div class="pol-list">';
        penalties.forEach((p) => {
          html += `<div class="pol-item pol-item-penalty">
            <div class="pol-item-name">${escapeHtml(p.name)}</div>
            <div class="pol-item-pts penalty-pts">&#8722; ${fmtNum(p.points)} نقطة</div>
          </div>`;
        });
        html += '</div>';
      }
      content.innerHTML = html;
    } catch (e) {
      content.innerHTML = `<div class="policies-empty">تعذّر تحميل السياسات: ${escapeHtml(e.message)}</div>`;
    }
  }

  function openOverlay()  { overlay.classList.remove('hidden'); loadPolicies(); }
  function closeOverlay() { overlay.classList.add('hidden'); content.innerHTML = ''; }

  if (openBtn)  openBtn.addEventListener('click', openOverlay);
  if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
  if (overlay)  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) closeOverlay();
  });
})();
