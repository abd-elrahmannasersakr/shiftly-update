
/* ===== Splash screen ===== */
(function () {
  const el = document.getElementById('splashScreen');
  if (!el) return;
  setTimeout(() => {
    el.classList.add('splash-hiding');
    setTimeout(() => { el.style.display = 'none'; }, 600);
  }, 2400);
})();

// Main app: routing, sidebar rendering, role-based views (driven by Auth).
(function () {
  const state = {
    currentSection: null,
    currentEmployeeOpen: null
  };

  const employeeNav = [
    { key: 'attendance', label: 'الحضور والانصراف', icon: '⏱' },
    { key: 'salary',     label: 'الراتب',           icon: '💰' },
    { key: 'advances',   label: 'السلف',            icon: '💸' },
    { key: 'messages',   label: 'الرسائل',          icon: '✉' },
    { key: 'archive',    label: 'الأرشيف',          icon: '🗂' }
  ];

  const managerNav = [
    { key: 'employees',  label: 'الموظفون',          icon: '👥' },
    { key: 'policies',   label: 'السياسات',          icon: '📋' },
    { key: 'incentives', label: 'الحوافز',           icon: '💰' },
    { key: 'archive',    label: 'الأرشيف والنسخ',   icon: '🗂' }
  ];

  function getNav() {
    if (!Auth.isEmployee()) return managerNav;
    const user = Auth.getUser();
    if (!user || !user.employee || !user.employee.visible_emp_tabs) return employeeNav;
    const visible = user.employee.visible_emp_tabs.split(',').map((s) => s.trim()).filter(Boolean);
    return employeeNav.filter((item) => visible.includes(item.key));
  }

  function renderSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = '';
    const title = U.el('div', { class: 'nav-title' }, [
      Auth.isEmployee() ? 'قائمة الموظف' : 'قائمة المدير'
    ]);
    sidebar.appendChild(title);

    getNav().forEach((item) => {
      const btn = U.el('button', {
        class: 'nav-item' + (state.currentSection === item.key ? ' active' : ''),
        onclick: () => navigate(item.key)
      }, [
        U.el('span', { class: 'nav-icon' }, [item.icon]),
        U.el('span', { id: item.key === 'messages' ? 'sidebar-messages-label' : '' }, [item.label])
      ]);
      sidebar.appendChild(btn);
    });

    sidebar.appendChild(U.el('div', { class: 'sidebar-footer' }, [
      'الإصدار 1.1 — Offline'
    ]));
  }

  function updateMessagesBadge(count) {
    const label = document.getElementById('sidebar-messages-label');
    if (!label) return;

    // Remove existing badge
    const existingBadge = document.getElementById('messages-badge');
    if (existingBadge) existingBadge.remove();

    if (count > 0) {
      const badge = U.el('span', {
        id: 'messages-badge',
        style: 'background:#dc2626;color:white;border-radius:50%;padding:2px 7px;font-size:11px;font-weight:700;min-width:20px;text-align:center;'
      }, [String(count)]);
      label.parentElement.style.position = 'relative';
      label.parentElement.appendChild(badge);
    }
  }

  function clearMessagesBadge() {
    updateMessagesBadge(0);
  }

  function navigate(section) {
    state.currentSection = section;
    state.currentEmployeeOpen = null;
    // Clear messages badge when navigating to messages
    if (section === 'messages') {
      clearMessagesBadge();
    }
    renderSidebar();
    renderContent();
  }

  function renderContent() {
    const content = document.getElementById('content');
    content.innerHTML = '';
    const user = Auth.getUser();
    if (!user) return;

    if (user.role === 'employee') {
      if (!user.employee_id) {
        content.appendChild(noEmployeesView('حسابك غير مرتبط بسجل موظف. يرجى التواصل مع المدير.'));
        return;
      }
      const map = {
        attendance: window.EmployeeAttendance,
        salary:     window.EmployeeSalary,
        advances:   window.EmployeeAdvances,
        messages:   window.EmployeeMessages,
        archive:    window.EmployeeArchive
      };
      const view = map[state.currentSection];
      if (view) view.render(content, { employeeId: user.employee_id });
      else placeholder(content);
    } else {
      if (state.currentSection === 'policies') {
        window.ManagerPolicies.render(content);
      } else if (state.currentSection === 'incentives') {
        window.ManagerIncentives.render(content);
      } else if (state.currentSection === 'archive') {
        window.ManagerArchive.render(content);
      } else if (state.currentEmployeeOpen) {
        window.ManagerDashboard.render(content, {
          employeeId: state.currentEmployeeOpen,
          onBack: () => { state.currentEmployeeOpen = null; renderContent(); }
        });
      } else {
        window.ManagerEmployees.render(content, {
          onOpen: (id) => { state.currentEmployeeOpen = id; renderContent(); }
        });
      }
    }
  }

  function placeholder(content) {
    content.appendChild(U.el('div', { class: 'empty-state' }, [
      U.el('h2', {}, ['اختر قسماً']),
      U.el('p', {}, ['اختر قسماً من القائمة الجانبية للبدء.'])
    ]));
  }

  function noEmployeesView(msg) {
    return U.el('div', { class: 'empty-state' }, [
      U.el('h2', {}, ['تنبيه']),
      U.el('p', {}, [msg])
    ]);
  }

  function renderUserPill() {
    const user = Auth.getUser();
    if (!user) return;
    document.getElementById('userName').textContent = user.employee ? user.employee.name : user.username;
    const tag = document.getElementById('userRoleTag');
    if (user.role === 'manager') {
      tag.textContent = 'مدير';
      tag.className = 'role-tag manager';
    } else {
      tag.textContent = user.employee && user.employee.role ? user.employee.role : 'موظف';
      tag.className = 'role-tag employee';
    }
  }

  function initSidebarToggle() {
    const btn = document.getElementById('sidebarToggleBtn');
    const sidebar = document.getElementById('sidebar');
    if (!btn || !sidebar) return;
    btn.addEventListener('click', function () {
      sidebar.classList.toggle('collapsed');
      btn.title = sidebar.classList.contains('collapsed') ? 'توسيع القائمة' : 'طي القائمة';
      btn.textContent = sidebar.classList.contains('collapsed') ? '▶' : '☰';
    });
  }

  /* ===== Manager inactivity timeout — 3 دقائق إجمالاً ===== */
  const IDLE_MS = 3 * 60 * 1000;
  let idleTimer = null;

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function() {
      if (Auth.isManager()) {
        U.toast('تم تسجيل الخروج تلقائياً بسبب عدم النشاط', 'warning');
        setTimeout(function() { Auth.logout(); }, 800);
      }
    }, IDLE_MS);
  }

  function startIdleWatcher() {
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(function(ev) {
      document.addEventListener(ev, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();
  }

  function stopIdleWatcher() {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  function showUnreadMsgPopup(count) {
    const existing = document.getElementById('unreadMsgPopup');
    if (existing) existing.remove();
    const popup = document.createElement('div');
    popup.id = 'unreadMsgPopup';
    popup.style.cssText = 'position:fixed;bottom:24px;left:24px;z-index:9999;background:#1e40af;color:#fff;border-radius:14px;padding:16px 22px;box-shadow:0 8px 30px rgba(0,0,0,.25);display:flex;align-items:center;gap:14px;max-width:320px;';
    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:1.8rem;flex-shrink:0;';
    icon.textContent = '✉️';
    const txt = document.createElement('div');
    txt.style.cssText = 'flex:1;';
    txt.innerHTML = '<div style="font-weight:700;font-size:15px;margin-bottom:4px;">رسائل جديدة</div><div style="font-size:13px;opacity:.9;">لديك ' + count + ' رسالة غير مقروءة</div>';
    const viewBtn = document.createElement('button');
    viewBtn.style.cssText = 'background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;flex-shrink:0;';
    viewBtn.textContent = 'عرض';
    viewBtn.onclick = () => { popup.remove(); state.currentSection = 'messages'; renderSidebar(); renderContent(); };
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'background:none;border:none;color:#fff;cursor:pointer;font-size:22px;flex-shrink:0;opacity:.75;line-height:1;padding:0 2px;';
    closeBtn.textContent = '×';
    closeBtn.onclick = () => popup.remove();
    popup.appendChild(icon); popup.appendChild(txt); popup.appendChild(viewBtn); popup.appendChild(closeBtn);
    document.body.appendChild(popup);
    setTimeout(() => { if (popup.parentNode) { popup.style.transition = 'opacity .4s'; popup.style.opacity = '0'; setTimeout(() => popup.remove(), 400); } }, 7000);
  }

  function onLogin(user) {
    window.ThemeSystem.loadUserTheme(user.id, user.role);
    state.currentSection = user.role === 'employee' ? 'attendance' : 'employees';
    state.currentEmployeeOpen = null;
    renderUserPill();
    renderSidebar();
    renderContent();
    initSidebarToggle();
    initThemeBtn(user.id);
    if (user.role === 'employee' && user.employee_id) {
      setTimeout(async () => {
        try {
          const msgs = await API['messages:listByEmployee']({ employee_id: user.employee_id, limit: 100 });
          const unread = msgs.filter((m) => !m.read);
          if (unread.length > 0) {
            updateMessagesBadge(unread.length);
            showUnreadMsgPopup(unread.length);
          }
        } catch (_) {}
      }, 1200);
    }
    const cpBtn = document.getElementById('changePasswordBtn');
    if (cpBtn) cpBtn.style.display = user.role === 'manager' ? '' : 'none';
    if (user.role === 'manager') startIdleWatcher();
  }

  function onLogout() {
    stopIdleWatcher();
    state.currentSection = null;
    state.currentEmployeeOpen = null;
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('sidebarToggleBtn');
    if (sidebar) sidebar.classList.remove('collapsed');
    if (btn) { btn.textContent = '\u2630'; btn.title = 'طي القائمة'; }
    const cpBtn = document.getElementById('changePasswordBtn');
    if (cpBtn) cpBtn.style.display = 'none';
  }

  function initThemeBtn(userId) {
    const btn = document.getElementById('themePickerBtn');
    if (!btn) return;
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => window.ThemeSystem.openThemePicker(userId));
  }

  window.App = { onLogin, onLogout, updateMessagesBadge, clearMessagesBadge };
})();


/* ===== Color Theme System ===== */
(function () {
  const THEMES = [
    { id: 'blue',     name: 'أزرق',        accent: '#2563eb', accentDark: '#1d4ed8', accentLight: '#eff6ff', accentBorder: '#bfdbfe', sidebarFrom: '#0f172a', sidebarTo: '#1e293b',   sidebarBgFrom: 'rgba(239,246,255,0.97)', sidebarBgTo: 'rgba(219,234,254,0.95)', sidebarBorder: 'rgba(191,219,254,0.75)', sidebarText: '#1e40af', sidebarMuted: '#93c5fd' },
    { id: 'green',    name: 'أخضر',        accent: '#059669', accentDark: '#047857', accentLight: '#ecfdf5', accentBorder: '#a7f3d0', sidebarFrom: '#064e3b', sidebarTo: '#065f46',   sidebarBgFrom: 'rgba(236,253,245,0.97)', sidebarBgTo: 'rgba(209,250,229,0.95)', sidebarBorder: 'rgba(167,243,208,0.75)', sidebarText: '#065f46', sidebarMuted: '#6ee7b7' },
    { id: 'purple',   name: 'بنفسجي',      accent: '#7c3aed', accentDark: '#6d28d9', accentLight: '#f5f3ff', accentBorder: '#c4b5fd', sidebarFrom: '#2e1065', sidebarTo: '#3b0764',   sidebarBgFrom: 'rgba(245,243,255,0.97)', sidebarBgTo: 'rgba(237,233,254,0.95)', sidebarBorder: 'rgba(196,181,253,0.75)', sidebarText: '#4c1d95', sidebarMuted: '#a78bfa' },
    { id: 'orange',   name: 'برتقالي',     accent: '#ea580c', accentDark: '#c2410c', accentLight: '#fff7ed', accentBorder: '#fed7aa', sidebarFrom: '#431407', sidebarTo: '#7c2d12',   sidebarBgFrom: 'rgba(255,247,237,0.97)', sidebarBgTo: 'rgba(255,237,213,0.95)', sidebarBorder: 'rgba(254,215,170,0.75)', sidebarText: '#7c2d12', sidebarMuted: '#fdba74' },
    { id: 'teal',     name: 'تيل',         accent: '#0d9488', accentDark: '#0f766e', accentLight: '#f0fdfa', accentBorder: '#99f6e4', sidebarFrom: '#042f2e', sidebarTo: '#134e4a',   sidebarBgFrom: 'rgba(240,253,250,0.97)', sidebarBgTo: 'rgba(204,251,241,0.95)', sidebarBorder: 'rgba(153,246,228,0.75)', sidebarText: '#134e4a', sidebarMuted: '#5eead4' },
    { id: 'rose',     name: 'وردي',        accent: '#e11d48', accentDark: '#be123c', accentLight: '#fff1f2', accentBorder: '#fecdd3', sidebarFrom: '#4c0519', sidebarTo: '#881337',   sidebarBgFrom: 'rgba(255,241,242,0.97)', sidebarBgTo: 'rgba(255,228,230,0.95)', sidebarBorder: 'rgba(254,205,211,0.75)', sidebarText: '#881337', sidebarMuted: '#fda4af' },
    { id: 'amber',    name: 'ذهبي',        accent: '#d97706', accentDark: '#b45309', accentLight: '#fffbeb', accentBorder: '#fde68a', sidebarFrom: '#1c1917', sidebarTo: '#292524',   sidebarBgFrom: 'rgba(255,251,235,0.97)', sidebarBgTo: 'rgba(254,243,199,0.95)', sidebarBorder: 'rgba(253,230,138,0.75)', sidebarText: '#78350f', sidebarMuted: '#fbbf24' },
    { id: 'indigo',   name: 'نيلي',        accent: '#4338ca', accentDark: '#3730a3', accentLight: '#eef2ff', accentBorder: '#c7d2fe', sidebarFrom: '#1e1b4b', sidebarTo: '#312e81',   sidebarBgFrom: 'rgba(238,242,255,0.97)', sidebarBgTo: 'rgba(224,231,255,0.95)', sidebarBorder: 'rgba(199,210,254,0.75)', sidebarText: '#3730a3', sidebarMuted: '#a5b4fc' },
    { id: 'cyan',     name: 'سماوي',       accent: '#0891b2', accentDark: '#0e7490', accentLight: '#ecfeff', accentBorder: '#a5f3fc', sidebarFrom: '#083344', sidebarTo: '#164e63',   sidebarBgFrom: 'rgba(236,254,255,0.97)', sidebarBgTo: 'rgba(207,250,254,0.95)', sidebarBorder: 'rgba(165,243,252,0.75)', sidebarText: '#164e63', sidebarMuted: '#67e8f9' },
    { id: 'emerald',  name: 'زمردي',       accent: '#10b981', accentDark: '#059669', accentLight: '#ecfdf5', accentBorder: '#6ee7b7', sidebarFrom: '#022c22', sidebarTo: '#064e3b',   sidebarBgFrom: 'rgba(236,253,245,0.97)', sidebarBgTo: 'rgba(167,243,208,0.92)', sidebarBorder: 'rgba(110,231,183,0.75)', sidebarText: '#065f46', sidebarMuted: '#34d399' },
    { id: 'crimson',  name: 'قرمزي',       accent: '#dc2626', accentDark: '#b91c1c', accentLight: '#fef2f2', accentBorder: '#fca5a5', sidebarFrom: '#450a0a', sidebarTo: '#7f1d1d',   sidebarBgFrom: 'rgba(254,242,242,0.97)', sidebarBgTo: 'rgba(254,226,226,0.95)', sidebarBorder: 'rgba(252,165,165,0.75)', sidebarText: '#7f1d1d', sidebarMuted: '#f87171' },
    { id: 'lime',     name: 'ليموني',      accent: '#65a30d', accentDark: '#4d7c0f', accentLight: '#f7fee7', accentBorder: '#bef264', sidebarFrom: '#1a2e05', sidebarTo: '#365314',   sidebarBgFrom: 'rgba(247,254,231,0.97)', sidebarBgTo: 'rgba(217,249,157,0.92)', sidebarBorder: 'rgba(190,242,100,0.75)', sidebarText: '#365314', sidebarMuted: '#a3e635' },
    { id: 'fuchsia',  name: 'فوشيا',       accent: '#c026d3', accentDark: '#a21caf', accentLight: '#fdf4ff', accentBorder: '#f0abfc', sidebarFrom: '#4a044e', sidebarTo: '#701a75',   sidebarBgFrom: 'rgba(253,244,255,0.97)', sidebarBgTo: 'rgba(250,232,255,0.95)', sidebarBorder: 'rgba(240,171,252,0.75)', sidebarText: '#701a75', sidebarMuted: '#e879f9' },
    { id: 'sky',      name: 'سكاي',        accent: '#0284c7', accentDark: '#0369a1', accentLight: '#f0f9ff', accentBorder: '#bae6fd', sidebarFrom: '#082f49', sidebarTo: '#0c4a6e',   sidebarBgFrom: 'rgba(240,249,255,0.97)', sidebarBgTo: 'rgba(224,242,254,0.95)', sidebarBorder: 'rgba(186,230,253,0.75)', sidebarText: '#0369a1', sidebarMuted: '#38bdf8' },
    { id: 'brown',    name: 'كاراميل',     accent: '#92400e', accentDark: '#78350f', accentLight: '#fffbeb', accentBorder: '#fde68a', sidebarFrom: '#1c0a00', sidebarTo: '#3c1a0a',   sidebarBgFrom: 'rgba(255,251,235,0.97)', sidebarBgTo: 'rgba(254,235,200,0.95)', sidebarBorder: 'rgba(253,211,155,0.75)', sidebarText: '#78350f', sidebarMuted: '#d97706' },
    { id: 'pink',      name: 'بينك',        accent: '#db2777', accentDark: '#be185d', accentLight: '#fdf2f8', accentBorder: '#fbcfe8', sidebarFrom: '#500724', sidebarTo: '#831843',   sidebarBgFrom: 'rgba(253,242,248,0.97)', sidebarBgTo: 'rgba(252,231,243,0.95)', sidebarBorder: 'rgba(251,207,232,0.75)', sidebarText: '#831843', sidebarMuted: '#f472b6' },
    { id: 'slate',     name: 'فولاذي',      accent: '#475569', accentDark: '#334155', accentLight: '#f8fafc', accentBorder: '#cbd5e1', sidebarFrom: '#0f172a', sidebarTo: '#1e293b',   sidebarBgFrom: 'rgba(248,250,252,0.97)', sidebarBgTo: 'rgba(241,245,249,0.95)', sidebarBorder: 'rgba(203,213,225,0.75)', sidebarText: '#334155', sidebarMuted: '#94a3b8' },
    { id: 'cobalt',    name: 'كوبالت',      accent: '#1740a1', accentDark: '#0f2d7a', accentLight: '#eef1fb', accentBorder: '#a9baf5', sidebarFrom: '#07102e', sidebarTo: '#101d52',   sidebarBgFrom: 'rgba(238,241,251,0.97)', sidebarBgTo: 'rgba(218,226,248,0.95)', sidebarBorder: 'rgba(169,186,245,0.75)', sidebarText: '#1740a1', sidebarMuted: '#7b97e8' },
    { id: 'coral',     name: 'كورال',       accent: '#f2614a', accentDark: '#d94532', accentLight: '#fff4f2', accentBorder: '#fdb5ab', sidebarFrom: '#3d0d07', sidebarTo: '#6b1a10',   sidebarBgFrom: 'rgba(255,244,242,0.97)', sidebarBgTo: 'rgba(255,228,224,0.95)', sidebarBorder: 'rgba(253,181,171,0.75)', sidebarText: '#6b1a10', sidebarMuted: '#f89285' },
    { id: 'gold',      name: 'ذهب ملكي',    accent: '#b8860b', accentDark: '#9a6f09', accentLight: '#fffdf0', accentBorder: '#f5d97c', sidebarFrom: '#1a1100', sidebarTo: '#2e1e00',   sidebarBgFrom: 'rgba(255,253,240,0.97)', sidebarBgTo: 'rgba(254,248,204,0.95)', sidebarBorder: 'rgba(245,217,124,0.75)', sidebarText: '#7a5800', sidebarMuted: '#d4a820' },
    { id: 'forest',    name: 'أخضر غابة',   accent: '#2d6a4f', accentDark: '#1b4332', accentLight: '#f0faf4', accentBorder: '#95d5b2', sidebarFrom: '#081c15', sidebarTo: '#1b4332',   sidebarBgFrom: 'rgba(240,250,244,0.97)', sidebarBgTo: 'rgba(212,242,224,0.95)', sidebarBorder: 'rgba(149,213,178,0.75)', sidebarText: '#1b4332', sidebarMuted: '#74c69d' },
    { id: 'navy',      name: 'نيفي',        accent: '#1e3a6e', accentDark: '#142952', accentLight: '#eef2f9', accentBorder: '#9fb3d8', sidebarFrom: '#060d1a', sidebarTo: '#0d1f3c',   sidebarBgFrom: 'rgba(238,242,249,0.97)', sidebarBgTo: 'rgba(214,222,240,0.95)', sidebarBorder: 'rgba(159,179,216,0.75)', sidebarText: '#1e3a6e', sidebarMuted: '#6b8dc4' },
    { id: 'wine',      name: 'نبيذي',       accent: '#722f37', accentDark: '#5a2029', accentLight: '#fdf2f3', accentBorder: '#e8adb2', sidebarFrom: '#1a0509', sidebarTo: '#380a10',   sidebarBgFrom: 'rgba(253,242,243,0.97)', sidebarBgTo: 'rgba(248,220,222,0.95)', sidebarBorder: 'rgba(232,173,178,0.75)', sidebarText: '#5a2029', sidebarMuted: '#c0737a' },
    { id: 'mint2',     name: 'نعناع',       accent: '#00897b', accentDark: '#00695c', accentLight: '#e8f5f4', accentBorder: '#80cbc4', sidebarFrom: '#002622', sidebarTo: '#00403a',   sidebarBgFrom: 'rgba(232,245,244,0.97)', sidebarBgTo: 'rgba(200,234,232,0.95)', sidebarBorder: 'rgba(128,203,196,0.75)', sidebarText: '#00695c', sidebarMuted: '#4db6ac' }
  ];

  function getThemeKey(userId) { return `userTheme:${userId || 'default'}`; }

  function applyTheme(themeId) {
    const t = THEMES.find((x) => x.id === themeId) || THEMES[0];
    const root = document.documentElement;
    root.style.setProperty('--accent', t.accent);
    root.style.setProperty('--accent-dark', t.accentDark);
    root.style.setProperty('--accent-light', t.accentLight);
    root.style.setProperty('--accent-border', t.accentBorder);
    root.style.setProperty('--sidebar-from', t.sidebarFrom);
    root.style.setProperty('--sidebar-to', t.sidebarTo);
    root.style.setProperty('--sidebar-bg-from', t.sidebarBgFrom);
    root.style.setProperty('--sidebar-bg-to', t.sidebarBgTo);
    root.style.setProperty('--sidebar-border', t.sidebarBorder);
    root.style.setProperty('--sidebar-text', t.sidebarText);
    root.style.setProperty('--sidebar-muted', t.sidebarMuted);
  }

  function saveUserTheme(userId, themeId) {
    localStorage.setItem(getThemeKey(userId), themeId);
    applyTheme(themeId);
  }

  const BG_THEMES = [
    { id: 'gray',      name: 'رمادي فاتح',    bg: '#f1f5f9' },
    { id: 'white',     name: 'أبيض ناصع',     bg: '#ffffff' },
    { id: 'cream',     name: 'كريمي دافئ',    bg: '#fdfbf7' },
    { id: 'blue',      name: 'أزرق فاتح',     bg: '#eff6ff' },
    { id: 'green',     name: 'أخضر فاتح',     bg: '#f0fdf4' },
    { id: 'purple',    name: 'بنفسجي فاتح',   bg: '#faf5ff' },
    { id: 'rose',      name: 'وردي فاتح',     bg: '#fff1f2' },
    { id: 'amber',     name: 'ذهبي فاتح',     bg: '#fffbeb' },
    { id: 'teal',      name: 'فيروزي فاتح',   bg: '#f0fdfa' },
    { id: 'sky',       name: 'سماوي فاتح',    bg: '#f0f9ff' },
    { id: 'lime',      name: 'ليموني فاتح',   bg: '#f7fee7' },
    { id: 'pink',      name: 'زهري فاتح',     bg: '#fdf2f8' },
    { id: 'peach',     name: 'خوخي',          bg: '#fff7ed' },
    { id: 'mint',      name: 'نعناعي',        bg: '#ecfdf5' },
    { id: 'lavender',  name: 'خزامى',         bg: '#eef2ff' },
    { id: 'sandstone', name: 'رملي',          bg: '#faf7f2' },
    { id: 'cloud',     name: 'سحابي',         bg: '#f6f8fb' },
    { id: 'blush',     name: 'خد الورد',      bg: '#fff5f7' },
    { id: 'sage',      name: 'أخضر مريمية',   bg: '#f4f8f4' },
    { id: 'ivory',     name: 'عاجي',          bg: '#fffff0' },
    { id: 'misty',     name: 'ضبابي',         bg: '#f0f4f8' },
    { id: 'apricot',   name: 'مشمشي',         bg: '#fff3e8' },
    { id: 'pearl',     name: 'لؤلؤي',         bg: '#f9f9f7' },
    { id: 'powder',    name: 'بودرة زرقاء',   bg: '#e8f4f8' },
    { id: 'linen',     name: 'كتاني',         bg: '#faf0e6' }
  ];

  function getBgKey(userId) { return `userBgTheme:${userId || 'default'}`; }

  function applyContentBg(bgId) {
    const opt = BG_THEMES.find((o) => o.id === bgId) || BG_THEMES[0];
    let styleEl = document.getElementById('content-bg-override');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'content-bg-override';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `.content { background: ${opt.bg} !important; }`;
  }

  function loadUserTheme(userId, role) {
    const savedAccent = localStorage.getItem(getThemeKey(userId));
    const defaultTheme = (!savedAccent) ? (role === 'employee' ? 'green' : 'blue') : savedAccent;
    if (!savedAccent) localStorage.setItem(getThemeKey(userId), defaultTheme);
    applyTheme(defaultTheme);

    const savedBg = localStorage.getItem(getBgKey(userId));
    if (savedBg) applyContentBg(savedBg);

    return defaultTheme;
  }

  function openThemePicker(userId) {
    const currentTheme = localStorage.getItem(getThemeKey(userId)) || 'blue';
    const currentBg    = localStorage.getItem(getBgKey(userId)) || 'gray';

    // Section 1: Accent color grid (4 columns)
    const sectionLabel1 = U.el('div', {
      style: 'font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding:0 2px;'
    }, ['لون التابات والسايدبار']);
    const grid = U.el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:0 0 20px;max-height:320px;overflow-y:auto;' });

    THEMES.forEach((t) => {
      const isActive = t.id === currentTheme;
      const btn = U.el('button', {
        style: [
          `background:${t.accent};`,
          'border:none;border-radius:12px;padding:14px 6px;cursor:pointer;',
          'display:flex;flex-direction:column;align-items:center;gap:5px;',
          `box-shadow:${isActive ? '0 0 0 3px white,0 0 0 5px ' + t.accent : '0 2px 8px rgba(0,0,0,0.15)'};`,
          'transition:all .15s ease;color:white;font-family:inherit;'
        ].join(''),
        onclick: () => {
          localStorage.setItem(getThemeKey(userId), t.id);
          applyTheme(t.id);
          U.closeModal();
          U.toast('تم تغيير اللون إلى ' + t.name, 'success');
        }
      }, [
        U.el('div', { style: 'width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;' }, [isActive ? '✔' : '']),
        U.el('div', { style: 'font-size:11px;font-weight:700;' }, [t.name])
      ]);
      grid.appendChild(btn);
    });

    // Section 2: Content background grid (5 columns)
    const divider = U.el('div', { style: 'border-top:1px solid #e2e8f0;margin:4px 0 18px;' });
    const sectionLabel2 = U.el('div', {
      style: 'font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding:0 2px;'
    }, ['لون خلفية المحتوى']);
    const bgGrid = U.el('div', { style: 'display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding-bottom:8px;max-height:260px;overflow-y:auto;' });

    BG_THEMES.forEach((opt) => {
      const isActive = opt.id === currentBg;
      const isDark   = opt.id === 'dark';
      const btn = U.el('button', {
        style: [
          `background:${opt.bg};`,
          'border:2px solid;',
          `border-color:${isActive ? '#2563eb' : '#e2e8f0'};`,
          'border-radius:10px;padding:10px 4px;cursor:pointer;',
          'display:flex;flex-direction:column;align-items:center;gap:4px;',
          `box-shadow:${isActive ? '0 0 0 3px rgba(37,99,235,0.25)' : '0 1px 4px rgba(0,0,0,0.08)'};`,
          'transition:all .15s ease;font-family:inherit;'
        ].join(''),
        onclick: () => {
          localStorage.setItem(getBgKey(userId), opt.id);
          applyContentBg(opt.id);
          U.closeModal();
          U.toast('تم تغيير خلفية المحتوى', 'success');
        }
      }, [
        U.el('div', { style: `width:28px;height:28px;border-radius:6px;background:${opt.bg};border:1px solid ${isDark ? '#334155' : '#e2e8f0'};display:flex;align-items:center;justify-content:center;font-size:13px;` }, [isActive ? '✔' : '']),
        U.el('div', { style: `font-size:10px;font-weight:600;color:${isDark ? '#94a3b8' : '#334155'};` }, [opt.name])
      ]);
      bgGrid.appendChild(btn);
    });

    U.showModal({
      title: 'إعدادات المظهر',
      body: U.el('div', {}, [
        U.el('div', { style: 'font-size:13px;color:#64748b;margin-bottom:16px;' }, ['الإعدادات محفوظة لحسابك فقط ولا تؤثر على الآخرين.']),
        sectionLabel1,
        grid,
        divider,
        sectionLabel2,
        bgGrid
      ]),
      footer: [U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إغلاق'])]
    });
  }

  window.ThemeSystem = { loadUserTheme, saveUserTheme, openThemePicker, applyTheme, applyContentBg };
})();
