// Manager → Employees list with cards (total hours + net salary).
(function () {
  /* ---------- localStorage helpers ---------- */
  function currentYm() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  }
  function saveNum(key, val) { try { localStorage.setItem(key, String(val)); } catch (_) {} }
  const PERSONAL_KEY = (id, ym) => `personalTarget:${id}:${ym}`;
  const BRANCH_KEY   = (ym)     => `branchTarget:${ym}`;

  /* ---------- tab definitions ---------- */
  const MGR_TAB_KEYS   = ['messages', 'cleaning', 'revenue', 'policies', 'exit', 'salary'];
  const MGR_TAB_LABELS = {
    messages: 'الرسائل', cleaning: 'المهام الشهرية', revenue: 'الإيرادات والحضور',
    policies: 'السياسات', exit: 'إذن الخروج', salary: 'الراتب'
  };
  const EMP_TAB_KEYS   = ['attendance', 'salary', 'advances', 'messages', 'archive'];
  const EMP_TAB_LABELS = {
    attendance: 'الحضور والانصراف', salary: 'الراتب',
    advances: 'السلف', messages: 'الرسائل', archive: 'الأرشيف'
  };

  /* ---------- render ---------- */
  async function render(root, { onOpen }) {
    root.innerHTML = '';

    const header = U.el('div', { class: 'page-header' }, [
      U.el('div', {}, [
        U.el('div', { class: 'page-title' }, ['إدارة الموظفين']),
        U.el('div', { class: 'page-subtitle' }, ['عرض، إضافة، وحذف الموظفين. اضغط على البطاقة لفتح لوحة التحكم.'])
      ]),
      U.el('button', { class: 'btn', onclick: () => openAddModal(refresh) }, ['+ إضافة موظف'])
    ]);
    root.appendChild(header);

    const grid = U.el('div', { class: 'employee-grid' });
    root.appendChild(grid);

    let allRows = [];

    async function refresh() {
      allRows = await API['salary:summaryAll']();
      for (const row of allRows) {
        row.user = await API['auth:userForEmployee']({ employee_id: row.employee.id });
      }
      renderGrid(grid, allRows, refresh, onOpen);
    }
    refresh();
  }

  function renderGrid(grid, rows, refresh, onOpen) {
    grid.innerHTML = '';
    if (!rows.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h2>لا يوجد موظفون</h2><p>اضغط على "إضافة موظف" لبدء استخدام النظام.</p></div>';
      return;
    }
    rows.forEach(({ employee, summary, user }) => {
      const card = U.el('div', { class: 'employee-card', onclick: () => onOpen(employee.id) });

      const actions = U.el('div', { class: 'actions' });
      actions.appendChild(U.el('button', {
        class: 'btn-icon',
        title: 'تعديل بيانات الموظف',
        onclick: (e) => { e.stopPropagation(); openEditModal(employee, refresh); }
      }, ['✏']));
      actions.appendChild(U.el('button', {
        class: 'btn-icon',
        title: 'تعديل بيانات الدخول',
        onclick: (e) => { e.stopPropagation(); openCredentialsModal(employee, user, refresh); }
      }, ['🔑']));
      actions.appendChild(U.el('button', {
        class: 'btn-icon danger',
        title: 'حذف',
        onclick: (e) => {
          e.stopPropagation();
          U.confirmDialog(`هل تريد حذف الموظف "${employee.name}" مع جميع بياناته؟`, async () => {
            try {
              await API['employees:delete']({ id: employee.id });
              U.toast('تم الحذف', 'success');
              refresh();
            } catch (e) { U.toast(e.message, 'error'); }
          });
        }
      }, ['🗑']));
      card.appendChild(actions);

      // Avatar icon
      const avatarEl = U.el('div', { class: 'avatar' });
      avatarEl.innerHTML = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
      card.appendChild(avatarEl);

      card.appendChild(U.el('div', { class: 'name' }, [employee.name]));
      if (employee.role) {
        card.appendChild(U.el('div', { class: 'role' }, [employee.role]));
      }
      if (user && user.username) {
        card.appendChild(U.el('span', { class: 'username-tag' }, ['👤 ' + user.username]));
      } else {
        card.appendChild(U.el('span', { class: 'username-tag', style: 'background:#fef3c7;color:#92400e;' },
          ['⚠ بدون حساب دخول']));
      }

      // Incentive / fixed check-in badges
      const badgeRow = U.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;' });
      if (employee.has_incentive === 0) {
        badgeRow.appendChild(U.el('span', {
          style: 'font-size:10px;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:8px;border:1px solid #fde68a;'
        }, ['بدون حافز']));
      }
      if (employee.has_fixed_checkin === 0) {
        badgeRow.appendChild(U.el('span', {
          style: 'font-size:10px;background:#f0f9ff;color:#0369a1;padding:2px 8px;border-radius:8px;border:1px solid #bae6fd;'
        }, ['دوام مرن']));
      }
      if (badgeRow.children.length) card.appendChild(badgeRow);

      const stats = U.el('div', { class: 'stats' });
      stats.appendChild(U.el('div', { class: 'stat' }, [
        U.el('div', { class: 'l' }, ['إجمالي الساعات']),
        U.el('div', { class: 'v' }, [U.fmtNumber(summary.hours) + ' س'])
      ]));
      stats.appendChild(U.el('div', { class: 'stat text-right' }, [
        U.el('div', { class: 'l' }, ['صافي الراتب']),
        U.el('div', { class: 'v', style: 'color:#059669' }, [U.fmtMoney(summary.net)])
      ]));
      card.appendChild(stats);
      grid.appendChild(card);
    });
  }

  /* ---------- helper: tab visibility checkboxes section ---------- */
  function buildTabVisibilitySection(form, existingMgrTabs, existingEmpTabs) {
    const mgrChecks = {};
    const empChecks = {};

    form.appendChild(U.el('div', { class: 'divider' }));
    form.appendChild(U.el('div', { style: 'font-size:13px;font-weight:700;color:#334155;margin-bottom:10px;' }, ['التبويبات المرئية']));

    form.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:6px;' }, [
      'تبويبات لوحة المدير لهذا الموظف:'
    ]));
    const mgrGrid = U.el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;' });
    MGR_TAB_KEYS.forEach((k) => {
      const isChecked = existingMgrTabs ? existingMgrTabs.includes(k) : true;
      const chk = U.el('input', { type: 'checkbox', id: 'mgrchk_' + k });
      chk.checked = isChecked;
      mgrChecks[k] = chk;
      mgrGrid.appendChild(U.el('label', {
        style: 'display:flex;align-items:center;gap:6px;cursor:pointer;background:#f8fafc;padding:5px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:13px;'
      }, [chk, MGR_TAB_LABELS[k]]));
    });
    form.appendChild(mgrGrid);

    form.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:6px;' }, [
      'تبويبات الموظف في لوحته الخاصة:'
    ]));
    const empGrid = U.el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;' });
    EMP_TAB_KEYS.forEach((k) => {
      const isChecked = existingEmpTabs ? existingEmpTabs.includes(k) : true;
      const chk = U.el('input', { type: 'checkbox', id: 'empchk_' + k });
      chk.checked = isChecked;
      empChecks[k] = chk;
      empGrid.appendChild(U.el('label', {
        style: 'display:flex;align-items:center;gap:6px;cursor:pointer;background:#f8fafc;padding:5px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:13px;'
      }, [chk, EMP_TAB_LABELS[k]]));
    });
    form.appendChild(empGrid);

    return {
      getVisibleMgr: () => MGR_TAB_KEYS.filter((k) => mgrChecks[k].checked).join(','),
      getVisibleEmp: () => EMP_TAB_KEYS.filter((k) => empChecks[k].checked).join(',')
    };
  }

  function openAddModal(refresh) {
    const form = U.el('div');
    const name     = U.el('input', { type: 'text',     class: 'form-control', placeholder: 'مثال: أحمد محمد' });
    const roleInp  = U.el('input', { type: 'text',     class: 'form-control', placeholder: 'مثال: صيدلاني، محاسب، مندوب...' });
    U.applyArabicInput(name);
    U.applyArabicInput(roleInp);
    const hourly   = U.el('input', { type: 'number',   class: 'form-control', placeholder: '0', min: '0', step: '0.01' });
    const username = U.el('input', { type: 'text',     class: 'form-control', placeholder: 'مثال: ahmed', autocomplete: 'off' });
    const password = U.el('input', { type: 'password', class: 'form-control', placeholder: 'لا يقل عن 4 أحرف', autocomplete: 'new-password' });
    const personal = U.el('input', { type: 'number',   class: 'form-control', placeholder: '0.00', min: '0', step: '0.01' });
    const branch   = U.el('input', { type: 'number',   class: 'form-control', placeholder: '0.00', min: '0', step: '0.01' });

    const checkInTime = U.el('input', { type: 'time', class: 'form-control', value: '09:00' });

    // has_incentive toggle
    const hasIncentiveChk = U.el('input', { type: 'checkbox' });
    hasIncentiveChk.checked = true;

    // has_fixed_checkin toggle
    const hasFixedCheckinChk = U.el('input', { type: 'checkbox' });
    hasFixedCheckinChk.checked = true;

    // Hide/show check-in time based on fixed checkin toggle
    const checkInGroup = group('وقت الحضور المجدول', checkInTime, 'يُستخدم لحساب التأخير التلقائي');
    hasFixedCheckinChk.addEventListener('change', () => {
      checkInGroup.style.display = hasFixedCheckinChk.checked ? '' : 'none';
    });

    form.appendChild(group('الاسم *', name));
    form.appendChild(group('المسمى الوظيفي', roleInp, 'يظهر بجانب الاسم في شاشة الدخول'));
    form.appendChild(group('سعر الساعة', hourly));

    // Options section
    form.appendChild(U.el('div', { class: 'divider' }));
    form.appendChild(U.el('div', { style: 'font-size:13px;font-weight:700;color:#334155;margin-bottom:10px;' }, ['خيارات الموظف']));
    form.appendChild(U.el('label', {
      style: 'display:flex;align-items:center;gap:10px;cursor:pointer;background:#f0fdf4;padding:8px 12px;border-radius:8px;border:1px solid #bbf7d0;margin-bottom:8px;font-size:13px;'
    }, [hasIncentiveChk, U.el('div', {}, [
      U.el('div', { style: 'font-weight:700;color:#065f46;' }, ['تفعيل الحافز لهذا الموظف']),
      U.el('div', { style: 'font-size:11px;color:#6b7280;' }, ['إلغاء التحديد يعني أن هذا الموظف لا يحصل على حافز'])
    ])]));
    form.appendChild(U.el('label', {
      style: 'display:flex;align-items:center;gap:10px;cursor:pointer;background:#f0f9ff;padding:8px 12px;border-radius:8px;border:1px solid #bae6fd;margin-bottom:14px;font-size:13px;'
    }, [hasFixedCheckinChk, U.el('div', {}, [
      U.el('div', { style: 'font-weight:700;color:#0369a1;' }, ['دوام بوقت ثابت']),
      U.el('div', { style: 'font-size:11px;color:#6b7280;' }, ['إلغاء التحديد = دوام مرن (لا يُحسب تأخير)'])
    ])]));
    form.appendChild(checkInGroup);

    form.appendChild(U.el('div', { class: 'divider' }));
    form.appendChild(U.el('div', { class: 'muted mb-3' }, ['أهداف الشهر الحالي']));
    const targetGrid = U.el('div', { class: 'form-grid' });
    targetGrid.appendChild(group('التارجت الشخصي', personal, 'هدف المبيعات الشخصي للموظف'));
    targetGrid.appendChild(group('التارجت الفرعي',  branch,   'هدف مبيعات الفرع الإجمالي'));
    form.appendChild(targetGrid);

    form.appendChild(U.el('div', { class: 'divider' }));
    form.appendChild(U.el('div', { class: 'muted mb-3' }, ['بيانات تسجيل الدخول للموظف']));
    const credGrid = U.el('div', { class: 'form-grid' });
    credGrid.appendChild(group('اسم المستخدم *', username));
    credGrid.appendChild(group('كلمة المرور *', password));
    form.appendChild(credGrid);

    const tabVis = buildTabVisibilitySection(form, null, null);

    U.showModal({
      title: 'إضافة موظف جديد',
      body: form,
      footer: [
        U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إلغاء']),
        U.el('button', {
          class: 'btn',
          onclick: async () => {
            try {
              const result = await API['employees:create']({
                name: name.value,
                role: roleInp.value.trim(),
                hourly_rate: hourly.value,
                base_salary: 0,
                incentive_percentage: 0,
                has_incentive: hasIncentiveChk.checked ? 1 : 0,
                has_fixed_checkin: hasFixedCheckinChk.checked ? 1 : 0,
                check_in_time: hasFixedCheckinChk.checked ? (checkInTime.value || '09:00') : '09:00',
                username: username.value,
                password: password.value,
                visible_mgr_tabs: tabVis.getVisibleMgr(),
                visible_emp_tabs: tabVis.getVisibleEmp()
              });
              const ym = currentYm();
              const newId = result && result.id;
              if (newId) {
                const pVal = Number(personal.value) || 0;
                const bVal = Number(branch.value)   || 0;
                if (pVal) saveNum(PERSONAL_KEY(newId, ym), pVal);
                if (bVal) saveNum(BRANCH_KEY(ym), bVal);
              }
              U.closeModal();
              U.toast('تمت إضافة الموظف وإنشاء حساب الدخول', 'success');
              refresh();
            } catch (e) { U.toast(e.message, 'error'); }
          }
        }, ['حفظ'])
      ]
    });
  }

  function openEditModal(employee, refresh) {
    const ym = currentYm();
    const nameInp    = U.el('input', { type: 'text',   class: 'form-control', value: employee.name || '', placeholder: 'اسم الموظف' });
    const roleInp    = U.el('input', { type: 'text',   class: 'form-control', value: employee.role || '', placeholder: 'مثال: صيدلاني، محاسب، مندوب...' });
    const hourlyInp  = U.el('input', { type: 'number', class: 'form-control', value: employee.hourly_rate || '0', min: '0', step: '0.01', placeholder: '0.00' });
    const checkInTimeInp = U.el('input', { type: 'time', class: 'form-control', value: employee.check_in_time || '09:00' });

    function loadNumLocal(key) {
      try { const v = localStorage.getItem(key); return v !== null ? Number(v) || 0 : 0; } catch (_) { return 0; }
    }
    const personalInp = U.el('input', { type: 'number', class: 'form-control', min: '0', step: '0.01', placeholder: '0.00',
      value: loadNumLocal(PERSONAL_KEY(employee.id, ym)) || '' });
    const branchInp   = U.el('input', { type: 'number', class: 'form-control', min: '0', step: '0.01', placeholder: '0.00',
      value: loadNumLocal(BRANCH_KEY(ym)) || '' });

    // has_incentive toggle
    const hasIncentiveChk = U.el('input', { type: 'checkbox' });
    hasIncentiveChk.checked = employee.has_incentive !== 0;

    // has_fixed_checkin toggle
    const hasFixedCheckinChk = U.el('input', { type: 'checkbox' });
    hasFixedCheckinChk.checked = employee.has_fixed_checkin !== 0;

    const checkInGroup = group('وقت الحضور المجدول', checkInTimeInp, 'يُستخدم لحساب التأخير التلقائي');
    checkInGroup.style.display = hasFixedCheckinChk.checked ? '' : 'none';
    hasFixedCheckinChk.addEventListener('change', () => {
      checkInGroup.style.display = hasFixedCheckinChk.checked ? '' : 'none';
    });

    const form = U.el('div');
    form.appendChild(group('الاسم *', nameInp));
    form.appendChild(group('المسمى الوظيفي', roleInp, 'يظهر بجانب الاسم في شاشة الدخول'));
    form.appendChild(group('سعر الساعة (ج.م)', hourlyInp));

    // Options section
    form.appendChild(U.el('div', { class: 'divider' }));
    form.appendChild(U.el('div', { style: 'font-size:13px;font-weight:700;color:#334155;margin-bottom:10px;' }, ['خيارات الموظف']));
    form.appendChild(U.el('label', {
      style: 'display:flex;align-items:center;gap:10px;cursor:pointer;background:#f0fdf4;padding:8px 12px;border-radius:8px;border:1px solid #bbf7d0;margin-bottom:8px;font-size:13px;'
    }, [hasIncentiveChk, U.el('div', {}, [
      U.el('div', { style: 'font-weight:700;color:#065f46;' }, ['تفعيل الحافز لهذا الموظف']),
      U.el('div', { style: 'font-size:11px;color:#6b7280;' }, ['إلغاء التحديد يعني أن هذا الموظف لا يحصل على حافز'])
    ])]));
    form.appendChild(U.el('label', {
      style: 'display:flex;align-items:center;gap:10px;cursor:pointer;background:#f0f9ff;padding:8px 12px;border-radius:8px;border:1px solid #bae6fd;margin-bottom:14px;font-size:13px;'
    }, [hasFixedCheckinChk, U.el('div', {}, [
      U.el('div', { style: 'font-weight:700;color:#0369a1;' }, ['دوام بوقت ثابت']),
      U.el('div', { style: 'font-size:11px;color:#6b7280;' }, ['إلغاء التحديد = دوام مرن (لا يُحسب تأخير)'])
    ])]));
    form.appendChild(checkInGroup);

    form.appendChild(U.el('div', { class: 'divider' }));
    form.appendChild(U.el('div', { class: 'muted mb-3' }, ['أهداف الشهر الحالي']));
    const targetGrid = U.el('div', { class: 'form-grid' });
    targetGrid.appendChild(group('التارجت الشخصي', personalInp, 'هدف المبيعات الشخصي للموظف'));
    targetGrid.appendChild(group('التارجت الفرعي',  branchInp,  'هدف مبيعات الفرع الإجمالي'));
    form.appendChild(targetGrid);

    const existingMgrTabs = employee.visible_mgr_tabs ? employee.visible_mgr_tabs.split(',').filter(Boolean) : null;
    const existingEmpTabs = employee.visible_emp_tabs ? employee.visible_emp_tabs.split(',').filter(Boolean) : null;
    const tabVis = buildTabVisibilitySection(form, existingMgrTabs, existingEmpTabs);

    U.showModal({
      title: 'تعديل بيانات الموظف — ' + employee.name,
      body: form,
      footer: [
        U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إلغاء']),
        U.el('button', {
          class: 'btn',
          onclick: async () => {
            try {
              if (!nameInp.value.trim()) throw new Error('الاسم مطلوب');
              await API['employees:update']({
                id:               employee.id,
                name:             nameInp.value.trim(),
                role:             roleInp.value.trim(),
                hourly_rate:      Number(hourlyInp.value) || 0,
                has_incentive:    hasIncentiveChk.checked ? 1 : 0,
                has_fixed_checkin: hasFixedCheckinChk.checked ? 1 : 0,
                check_in_time:    hasFixedCheckinChk.checked ? (checkInTimeInp.value || '09:00') : '09:00',
                visible_mgr_tabs: tabVis.getVisibleMgr(),
                visible_emp_tabs: tabVis.getVisibleEmp()
              });
              const pVal = Number(personalInp.value) || 0;
              const bVal = Number(branchInp.value)   || 0;
              saveNum(PERSONAL_KEY(employee.id, ym), pVal);
              saveNum(BRANCH_KEY(ym), bVal);
              U.closeModal();
              U.toast('تم تحديث بيانات الموظف', 'success');
              refresh();
            } catch (e) { U.toast(e.message, 'error'); }
          }
        }, ['حفظ التعديلات'])
      ]
    });
  }

  function openCredentialsModal(employee, user, refresh) {
    const form = U.el('div');
    const username = U.el('input', {
      type: 'text', class: 'form-control', autocomplete: 'off',
      value: user && user.username ? user.username : ''
    });
    const password = U.el('input', {
      type: 'password', class: 'form-control', autocomplete: 'new-password',
      placeholder: 'كلمة مرور جديدة (4 أحرف على الأقل)'
    });
    form.appendChild(U.el('div', { class: 'muted mb-3' }, [
      `تعديل بيانات الدخول للموظف: ${employee.name}`
    ]));
    form.appendChild(group('اسم المستخدم *', username));
    form.appendChild(group('كلمة المرور *', password));

    U.showModal({
      title: user ? 'تعديل بيانات الدخول' : 'إنشاء حساب دخول',
      body: form,
      footer: [
        U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إلغاء']),
        U.el('button', {
          class: 'btn',
          onclick: async () => {
            try {
              await API['auth:resetEmployeeCredentials']({
                employee_id: employee.id,
                username: username.value,
                password: password.value
              });
              U.closeModal();
              U.toast('تم تحديث بيانات الدخول', 'success');
              refresh();
            } catch (e) { U.toast(e.message, 'error'); }
          }
        }, ['حفظ'])
      ]
    });
  }

  function group(label, control, hint) {
    const items = [
      U.el('label', { class: 'form-label' }, [label]),
      control
    ];
    if (hint) items.push(U.el('div', { class: 'muted mt-2' }, [hint]));
    return U.el('div', { class: 'form-group' }, items);
  }

  window.ManagerEmployees = { render };
})();
