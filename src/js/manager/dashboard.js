// Manager → Employee dashboard.
// Shared month strip + live today display sit here so ALL tabs respond to the
// same selected month without each tab managing its own navigation.
(function () {
  const AR_MONTHS = [
    'يناير','فبراير','مارس','أبريل','مايو','يونيو',
    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
  ];

  function ymKey(year, monthIdx) {
    return `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
  }

  // 12 chips from the most-recent April (fiscal year start).
  function buildMonthList() {
    const today = new Date();
    const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    const list = [];
    for (let i = 0; i < 12; i++) {
      const m = (3 + i) % 12;
      const y = fyStartYear + Math.floor((3 + i) / 12);
      list.push({ ym: ymKey(y, m), label: AR_MONTHS[m] + ' ' + y });
    }
    const todayYm = ymKey(today.getFullYear(), today.getMonth());
    list.forEach((it) => { it.future = it.ym > todayYm; });
    return { list, defaultYm: todayYm };
  }

  function fmtToday() {
    return new Date().toLocaleDateString('ar-EG', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  // Default tabs that are always available
  const ALL_TABS = [
    { key: 'messages',  label: 'الرسائل',          render: (contentEl, employee, selectedYm) => window.MgrTabMessages.render(contentEl, { employee, selectedYm }) },
    { key: 'cleaning',  label: 'المهام الشهرية',     render: (contentEl, employee, selectedYm) => window.MgrTabCleaning.render(contentEl, { employee, selectedYm }) },
    { key: 'revenue',   label: 'الإيرادات والحضور', render: (contentEl, employee, selectedYm) => window.MgrTabRevenue.render(contentEl, { employee, selectedYm }) },
    { key: 'policies',  label: 'السياسات',          render: (contentEl, employee, selectedYm) => window.MgrTabPolicies.render(contentEl, { employee, selectedYm }) },
    { key: 'exit',      label: 'إذن الخروج',        render: (contentEl, employee, selectedYm) => window.MgrTabExitPermissions.render(contentEl, { employee, selectedYm }) },
    { key: 'salary',    label: 'الراتب',            render: (contentEl, employee, selectedYm) => window.MgrTabSalary.render(contentEl, { employee, selectedYm }) }
  ];
  const DEFAULT_TAB_KEYS = ALL_TABS.map((t) => t.key);

  async function render(root, { employeeId, onBack }) {
    root.innerHTML = '';
    const employee = await API['employees:get']({ id: employeeId });
    if (!employee) {
      root.appendChild(U.el('div', { class: 'empty-state' }, [
        U.el('h2', {}, ['الموظف غير موجود']),
        U.el('button', { class: 'btn mt-3', onclick: onBack }, ['رجوع'])
      ]));
      return;
    }

    // Determine which tabs to show based on employee's visible_mgr_tabs
    let visibleKeys;
    if (employee.visible_mgr_tabs && employee.visible_mgr_tabs.trim()) {
      visibleKeys = employee.visible_mgr_tabs.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      visibleKeys = DEFAULT_TAB_KEYS;
    }
    const tabs = ALL_TABS.filter((t) => visibleKeys.includes(t.key));

    const { list: months, defaultYm } = buildMonthList();
    let selectedYm = months.find((m) => m.ym === defaultYm) ? defaultYm : months[0].ym;

    /* ── Today badge (auto-updates every minute) ── */
    const todayBadge = U.el('div', { class: 'today-badge' }, [
      U.el('span', { class: 'today-icon' }, ['📅']),
      U.el('span', { class: 'today-text' }, [fmtToday()])
    ]);
    let _timer = setInterval(() => {
      const span = todayBadge.querySelector('.today-text');
      if (span) span.textContent = fmtToday();
    }, 60000);
    // Clean up timer if the root is removed from DOM
    const _obs = new MutationObserver(() => {
      if (!document.body.contains(root)) {
        clearInterval(_timer);
        _obs.disconnect();
      }
    });
    _obs.observe(document.body, { childList: true, subtree: true });

    /* ── Page header ── */
    const header = U.el('div', { class: 'page-header dashboard-header' }, [
      U.el('div', { class: 'dashboard-header-main' }, [
        U.el('div', { class: 'flex-row mb-2' }, [
          U.el('button', { class: 'btn btn-secondary btn-sm', onclick: onBack }, ['→ رجوع']),
          U.el('div', { class: 'page-title', style: 'margin-right:8px;' }, [employee.name])
        ]),
        U.el('div', { class: 'page-subtitle' }, [employee.role || 'بدون مسمى وظيفي'])
      ]),
      todayBadge
    ]);
    root.appendChild(header);

    /* ── Month strip ── */
    const stripWrap = U.el('div', { class: 'month-strip-wrap' });
    const strip = U.el('div', { class: 'month-strip' });
    stripWrap.appendChild(strip);
    root.appendChild(stripWrap);

    function renderStrip() {
      strip.innerHTML = '';
      months.forEach((m) => {
        strip.appendChild(U.el('button', {
          class: 'month-chip'
            + (m.ym === selectedYm ? ' active' : '')
            + (m.future ? ' future' : ''),
          onclick: () => {
            if (m.future) return;
            selectedYm = m.ym;
            renderStrip();
            renderActive();
          }
        }, [m.label]));
      });
    }

    /* ── Tab bar ── */
    const tabsBar = U.el('div', { class: 'tabs' });
    const contentEl = U.el('div', { class: 'tab-panel' });
    let active = tabs.length > 0 ? tabs[0].key : '';

    function refreshTabs() {
      tabsBar.innerHTML = '';
      tabs.forEach((t) => {
        tabsBar.appendChild(U.el('button', {
          class: 'tab' + (active === t.key ? ' active' : ''),
          onclick: () => { active = t.key; refreshTabs(); renderActive(); }
        }, [t.label]));
      });
    }

    function renderActive() {
      const t = tabs.find((x) => x.key === active);
      if (t) t.render(contentEl, employee, selectedYm);
      else {
        contentEl.innerHTML = '';
        contentEl.appendChild(U.el('div', { class: 'empty-state' }, [
          U.el('p', {}, ['لا توجد تبويبات مُفعَّلة لهذا الموظف.'])
        ]));
      }
    }

    renderStrip();
    refreshTabs();
    root.appendChild(tabsBar);
    root.appendChild(contentEl);
    renderActive();
  }

  window.ManagerDashboard = { render };
})();
