// Manager (admin-only) dashboard tab: salary — with comprehensive KPIs grouped and collapsible.
(function () {
  const AR_MONTHS = [
    'يناير','فبراير','مارس','أبريل','مايو','يونيو',
    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
  ];
  function ymLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    return `${AR_MONTHS[m - 1]} ${y}`;
  }
  function currentYm() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  }

  const SHEET_KEY      = (id, ym) => `salarySheet:${id}:${ym}`;
  const SP_SHEET_KEY   = (id, ym) => `sheetPersonal:${id}:${ym}`;
  const SB_SHEET_KEY   = (id, ym) => `sheetBranch:${id}:${ym}`;
  const APPROVAL_KEY   = (id, ym) => `salaryApproved:${id}:${ym}`;
  const PERIODS_KEY    = (id, ym) => `salaryPeriods:${id}:${ym}`;
  const KPI_VIS_KEY    = (id)     => `kpiVisibility:${id}`;

  function loadJSON(key, fallback) {
    try { const r = localStorage.getItem(key); if (r) return JSON.parse(r); } catch (_) {}
    return fallback;
  }
  function saveJSON(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {} }
  function loadNum(key) {
    try { const v = localStorage.getItem(key); return v !== null ? Number(v) || 0 : null; } catch (_) { return null; }
  }
  function saveNum(key, val) { try { localStorage.setItem(key, String(val)); } catch (_) {} }

  // Default KPI visibility: all groups visible
  const DEFAULT_KPI_VIS = {
    attendance: true,
    revenues:   true,
    targets:    true,
    salary:     true,
    net:        true
  };

  function getKpiVis(employeeId) {
    return Object.assign({}, DEFAULT_KPI_VIS, loadJSON(KPI_VIS_KEY(employeeId), {}));
  }
  function saveKpiVis(employeeId, vis) {
    saveJSON(KPI_VIS_KEY(employeeId), vis);
  }

  function diffHours(ci, co) {
    if (!ci || !co) return 0;
    let a = new Date(ci).getTime(), b = new Date(co).getTime();
    if (isNaN(a) || isNaN(b)) return 0;
    if (b <= a) b += 86400000; // crossed midnight
    return (b - a) / 3600000;
  }
  async function monthlyHoursFor(employeeId, ym) {
    const rows = await API['attendance:listByEmployee']({ employee_id: employeeId, limit: 1000 });
    return rows.filter((r) => r.date && r.date.startsWith(ym))
               .reduce((s, r) => s + diffHours(r.check_in, r.check_out), 0);
  }

  function group(label, control, hint) {
    const items = [U.el('label', { class: 'form-label' }, [label]), control];
    if (hint) items.push(U.el('div', { class: 'muted mt-2' }, [hint]));
    return U.el('div', { class: 'form-group' }, items);
  }

  /* ---------- collapsible KPI group ---------- */
  function kpiGroupWrapper(label, cards, defaultOpen) {
    const isOpen = { v: defaultOpen !== false };
    const arrowEl = U.el('span', { class: 'sheet-collapse-arrow', style: 'margin-left:6px;' }, [isOpen.v ? '▼' : '▶']);
    const header = U.el('div', {
      class: 'kpi-group-header',
      style: 'display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 12px;background:linear-gradient(90deg,var(--accent-light),transparent);border-radius:10px;margin-bottom:8px;border:1px solid var(--accent-border);user-select:none;',
      onclick: () => {
        isOpen.v = !isOpen.v;
        arrowEl.textContent = isOpen.v ? '▼' : '▶';
        content.style.display = isOpen.v ? '' : 'none';
      }
    }, [arrowEl, U.el('span', { style: 'font-size:12px;font-weight:700;color:var(--accent-dark);letter-spacing:.3px;' }, [label])]);

    const content = U.el('div', { class: 'stats-grid kpi-grid-wide', style: 'margin-bottom:4px;' });
    if (!isOpen.v) content.style.display = 'none';
    cards.forEach((c) => content.appendChild(c));

    const wrapper = U.el('div', { style: 'margin-bottom:16px;' });
    wrapper.appendChild(header);
    wrapper.appendChild(content);
    return wrapper;
  }

  /* ---------- KPI visibility settings modal ---------- */
  function openKpiSettingsModal(employeeId, onSave) {
    const vis = getKpiVis(employeeId);
    const groups = [
      { key: 'attendance', label: 'الحضور والتقييم' },
      { key: 'revenues',   label: 'الإيرادات' },
      { key: 'targets',    label: 'الأهداف الشهرية' },
      { key: 'salary',     label: 'الراتب والخصومات' },
      { key: 'net',        label: 'صافي الراتب التقديري' }
    ];
    const checks = {};
    const body = U.el('div');
    body.appendChild(U.el('div', { class: 'muted mb-3' }, ['اختر مجموعات KPI التي تظهر في تبويب الراتب لهذا الموظف.']));
    groups.forEach((g) => {
      const chk = U.el('input', { type: 'checkbox' });
      chk.checked = vis[g.key] !== false;
      checks[g.key] = chk;
      body.appendChild(U.el('label', {
        style: 'display:flex;align-items:center;gap:10px;cursor:pointer;background:#f8fafc;padding:8px 12px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:8px;font-size:13px;font-weight:600;'
      }, [chk, g.label]));
    });
    U.showModal({
      title: 'إعدادات مؤشرات الأداء (KPI)',
      body,
      footer: [
        U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إلغاء']),
        U.el('button', {
          class: 'btn',
          onclick: () => {
            const newVis = {};
            groups.forEach((g) => { newVis[g.key] = checks[g.key].checked; });
            saveKpiVis(employeeId, newVis);
            U.closeModal();
            U.toast('تم حفظ إعدادات المؤشرات', 'success');
            if (onSave) onSave();
          }
        }, ['حفظ'])
      ]
    });
  }

  async function render(root, { employee, selectedYm }) {
    const ym = selectedYm || currentYm();
    root.innerHTML = '';

    // Header row with KPI settings button
    const headerRow = U.el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;' });
    headerRow.appendChild(U.el('div', { class: 'rev-header', style: 'margin-bottom:0;' }, [
      U.el('div', { class: 'rev-header-eyebrow' }, ['الشهر المعروض']),
      U.el('div', { class: 'rev-header-title' }, [ymLabel(ym)])
    ]));
    const kpiSettingsBtn = U.el('button', {
      class: 'btn btn-secondary btn-sm',
      style: 'margin-top:8px;',
      onclick: () => openKpiSettingsModal(employee.id, () => render(root, { employee, selectedYm }))
    }, ['إعدادات المؤشرات (KPI)']);
    headerRow.appendChild(kpiSettingsBtn);
    root.appendChild(headerRow);

    const summary = await API['salary:summary']({ employee_id: employee.id });

    let monthlyBase = 0;
    try { const r = await API['settings:getKey']({ key: `incentive_base:${ym}` }); monthlyBase = Number(r.value) || 0; } catch (_) {}

    let pharmacyDailyHours = 0;
    try { const s = await API['settings:get'](); pharmacyDailyHours = s.pharmacy_daily_hours || 0; } catch (_) {}
    const [ymYear, ymMonth] = ym.split('-').map(Number);
    const daysInMonth       = new Date(ymYear, ymMonth, 0).getDate();
    const totalMonthlyHours = pharmacyDailyHours * daysInMonth;
    const empMonthlyHours   = await monthlyHoursFor(employee.id, ym);

    let penaltyPoints = 0, bonusPoints = 0;
    let allPolicies = [];
    try {
      allPolicies = await API['appliedPolicies:listByEmployee']({ employee_id: employee.id, limit: 1000 });
      allPolicies.filter((p) => p.date && p.date.startsWith(ym)).forEach((p) => {
        if (p.type === 'penalty') penaltyPoints += Number(p.points) || 0;
        else if (p.type === 'bonus') bonusPoints += Number(p.points) || 0;
      });
    } catch (_) {}

    let totalDeductions = 0, totalBonuses = 0;
    try {
      const adjs = await API['adjustments:listByEmployee']({ employee_id: employee.id, limit: 1000 });
      adjs.filter((a) => a.date && a.date.startsWith(ym)).forEach((a) => {
        if (a.type === 'deduction') totalDeductions += Number(a.amount) || 0;
        else if (a.type === 'bonus') totalBonuses += Number(a.amount) || 0;
      });
    } catch (_) {}

    let totalAdvances = 0;
    try {
      const advs = await API['advances:listByEmployee']({ employee_id: employee.id, limit: 1000 });
      advs.filter((a) => a.date && a.date.startsWith(ym)).forEach((a) => {
        totalAdvances += Number(a.amount) || 0;
      });
    } catch (_) {}

    const periods = loadJSON(PERIODS_KEY(employee.id, ym), {
      p1: { cash: '', credit: '' }, p2: { cash: '', credit: '' }
    });
    const totalCash   = (Number(periods.p1.cash) || 0) + (Number(periods.p2.cash) || 0);
    const totalCredit = (Number(periods.p1.credit) || 0) + (Number(periods.p2.credit) || 0);
    const totalRevenues = totalCash + totalCredit;

    const personalTarget = loadNum(SP_SHEET_KEY(employee.id, ym)) || 0;
    const branchTarget   = loadNum(SB_SHEET_KEY(employee.id, ym)) || 0;

    const R  = totalMonthlyHours ? empMonthlyHours / totalMonthlyHours : 0;
    const A  = monthlyBase;
    const S  = penaltyPoints - bonusPoints;
    const RA = R * A;
    const monthlyRating = RA > 0 ? +((RA - S) / RA).toFixed(3) : 0;
    const grade = gradeInfo(monthlyRating);
    const basicIncentive = +RA.toFixed(2);

    // Check if employee has incentive enabled
    const hasIncentive = employee.has_incentive !== 0;

    // Net salary estimate
    const hourlyRate = Number(employee.hourly_rate) || 0;
    const hoursPay   = +(empMonthlyHours * hourlyRate).toFixed(2);
    const netSalary  = +(hoursPay + (hasIncentive ? basicIncentive : 0) + personalTarget + branchTarget + totalBonuses - totalDeductions - totalAdvances).toFixed(2);

    // KPI visibility
    const vis = getKpiVis(employee.id);

    root.appendChild(U.el('div', { class: 'kpi-section-label' }, ['مؤشرات الأداء الشهرية (KPI)']));

    // Group 1: الحضور والتقييم
    if (vis.attendance !== false) {
      root.appendChild(kpiGroupWrapper('الحضور والتقييم', [
        kpiCard('إجمالي الساعات', U.fmtNumber(empMonthlyHours) + ' س', 'neutral',
          totalMonthlyHours ? `من أصل ${U.fmtNumber(totalMonthlyHours)} س` : 'حدد ساعات اليومية في الإعدادات'),
        ratingKpiCard(grade,
          totalMonthlyHours && A
            ? `R=${(R * 100).toFixed(1)}% × A=${U.fmtMoney(A)} — S=${S >= 0 ? '+' : ''}${S}`
            : 'حدد ساعات العمل والحافز في الإعدادات'
        )
      ], true));
    }

    // Group 2: الإيرادات
    if (vis.revenues !== false) {
      const revenueParent = kpiCard('إجمالي الإيرادات', U.fmtMoney(totalRevenues) + ' ج.م', totalRevenues > 0 ? 'positive' : 'neutral', 'إيرادات الفترتين (كاش + آجل)');
      const cashCard   = kpiCard('إجمالي الكاش',  U.fmtMoney(totalCash)   + ' ج.م', 'neutral', 'مجموع كاش الفترتين');
      const creditCard = kpiCard('إجمالي الآجل', U.fmtMoney(totalCredit) + ' ج.م', 'neutral', 'مجموع آجل الفترتين');
      root.appendChild(kpiGroupWrapper('الإيرادات', [revenueParent, cashCard, creditCard], true));
    }

    // Group 3: الأهداف
    if (vis.targets !== false) {
      root.appendChild(kpiGroupWrapper('الأهداف الشهرية', [
        kpiCard('التارجت الشخصي', U.fmtMoney(personalTarget) + ' ج.م', personalTarget > 0 ? 'positive' : 'neutral', 'هدف المبيعات الشخصي'),
        kpiCard('التارجت الفرعي', U.fmtMoney(branchTarget)   + ' ج.م', branchTarget   > 0 ? 'positive' : 'neutral', 'هدف مبيعات الفرع')
      ], true));
    }

    // Group 4: الراتب والخصومات
    if (vis.salary !== false) {
      const incentiveCards = hasIncentive
        ? [kpiCard('الحافز الأساسي', U.fmtMoney(basicIncentive) + ' ج.م', basicIncentive >= 0 ? 'positive' : 'negative', '(R × A) محسوب من ساعات الشهر فقط')]
        : [kpiCard('الحافز الأساسي', 'غير مفعّل', 'neutral', 'الحافز معطّل لهذا الموظف')];
      root.appendChild(kpiGroupWrapper('الراتب والخصومات', [
        ...incentiveCards,
        kpiCard('إجمالي الخصومات', U.fmtMoney(totalDeductions) + ' ج.م', totalDeductions > 0 ? 'negative' : 'neutral', 'خصومات الشهر من سجل الخصومات'),
        kpiCard('إجمالي المكافآت',  U.fmtMoney(totalBonuses)   + ' ج.م', totalBonuses   > 0 ? 'positive' : 'neutral', 'مكافآت الشهر من سجل التعديلات'),
        kpiCard('إجمالي السلف',     U.fmtMoney(totalAdvances)  + ' ج.م', totalAdvances  > 0 ? 'negative' : 'neutral', 'إجمالي السلف لهذا الشهر')
      ], false));
    }

    // Group 5: صافي الراتب التقديري
    if (vis.net !== false) {
      root.appendChild(kpiGroupWrapper('صافي الراتب التقديري', [
        kpiCard('راتب الساعات', U.fmtMoney(hoursPay) + ' ج.م', 'neutral', `${U.fmtNumber(empMonthlyHours)} س × ${U.fmtMoney(hourlyRate)} ج.م`),
        kpiCard('صافي الراتب', U.fmtMoney(netSalary) + ' ج.م', netSalary >= 0 ? 'positive' : 'negative',
          'ساعات + ' + (hasIncentive ? 'حافز + ' : '') + 'أهداف + مكافآت − خصومات − سلف')
      ], true));
    }

    // Approval card
    const approvalCard = buildApprovalCard(employee.id, ym);
    root.appendChild(approvalCard);

    // Sheet trigger card
    const sheetCard = U.el('div', { class: 'card sheet-trigger-card' });
    sheetCard.appendChild(U.el('div', { class: 'sheet-trigger-row' }, [
      U.el('div', { class: 'sheet-trigger-info' }, [
        U.el('div', { class: 'sheet-trigger-title' }, ['شيت الراتب الشهري']),
        U.el('div', { class: 'sheet-trigger-sub' }, [
          'افتح الشيت لإدخال الساعات الإضافية والتارجت ومراجعة الصافي.'
        ])
      ]),
      U.el('button', {
        class: 'btn sheet-trigger-btn',
        onclick: () => openSalarySheet(employee, summary, ym, () => render(root, { employee, selectedYm }))
      }, ['فتح شيت الراتب — ' + ymLabel(ym)])
    ]));
    root.appendChild(sheetCard);

    // Advances log
    const advCard = U.el('div', { class: 'card' });
    advCard.appendChild(U.el('div', { class: 'card-title' }, [
      U.el('span', {}, ['سجل السلف']),
      U.el('span', { class: 'card-subtitle-pill' }, [ymLabel(ym)])
    ]));
    const advBody = U.el('div');
    advCard.appendChild(advBody);
    U.makeCollapsible(advCard, true);
    root.appendChild(advCard);

    async function loadAdvances() {
      try {
        const all = await API['advances:listByEmployee']({ employee_id: employee.id, limit: 500 });
        const rows = all.filter((r) => r.date && r.date.startsWith(ym));
        renderAdvances(advBody, rows, loadAdvances);
      } catch (e) {
        advBody.innerHTML = `<div class="muted" style="padding:16px;color:#dc2626;">${e.message}</div>`;
      }
    }
    loadAdvances();
  }

  function buildApprovalCard(employeeId, ym) {
    const key = APPROVAL_KEY(employeeId, ym);
    const card = U.el('div', { class: 'card', style: 'margin-bottom:16px;' });
    card.appendChild(U.el('div', { class: 'card-title' }, [
      U.el('span', {}, ['إذن عرض الراتب للموظف']),
      U.el('span', { class: 'card-subtitle-pill' }, [ymLabel(ym)])
    ]));
    const statusEl   = U.el('div', { style: 'font-size:14px;font-weight:600;margin-bottom:14px;' });
    const btnApprove = U.el('button', { class: 'btn btn-success' }, ['الموافقة على عرض الراتب']);
    const btnRevoke  = U.el('button', { class: 'btn btn-danger', style: 'margin-right:10px;' }, ['إلغاء الموافقة']);
    function syncUI() {
      const approved = localStorage.getItem(key) === '1';
      if (approved) {
        statusEl.innerHTML  = '<span style="color:#059669;">✔ الراتب مُتاح للموظف هذا الشهر</span>';
        btnApprove.style.display = 'none';
        btnRevoke.style.display  = '';
      } else {
        statusEl.innerHTML  = '<span style="color:#dc2626;">✗ الراتب مقفل — الموظف لا يستطيع رؤيته</span>';
        btnApprove.style.display = '';
        btnRevoke.style.display  = 'none';
      }
    }
    btnApprove.addEventListener('click', () => { localStorage.setItem(key, '1'); U.toast('تم فتح شاشة الراتب للموظف', 'success'); syncUI(); });
    btnRevoke.addEventListener('click',  () => { localStorage.removeItem(key); U.toast('تم إغلاق شاشة الراتب', 'warning'); syncUI(); });
    const actions = U.el('div', { class: 'btn-row' });
    actions.appendChild(btnApprove);
    actions.appendChild(btnRevoke);
    card.appendChild(statusEl);
    card.appendChild(actions);
    syncUI();
    return card;
  }

  async function openSalarySheet(employee, summary, ym, onSaved) {
    const monthlyHours = await monthlyHoursFor(employee.id, ym);
    const saved        = loadJSON(SHEET_KEY(employee.id, ym), { overtime: '', overtimeDays: '' });
    const rate         = Number(employee.hourly_rate) || 0;
    const advance      = Number(summary.advances) || 0;
    const hasIncentive = employee.has_incentive !== 0;

    let monthlyBase = 0;
    try { const r = await API['settings:getKey']({ key: `incentive_base:${ym}` }); monthlyBase = Number(r.value) || 0; } catch (_) {}

    let pharmacyDailyHours = 0;
    try { const s = await API['settings:get'](); pharmacyDailyHours = s.pharmacy_daily_hours || 0; } catch (_) {}

    const [ymYear, ymMonth] = ym.split('-').map(Number);
    const daysInMonth       = new Date(ymYear, ymMonth, 0).getDate();
    const totalMonthlyHours = pharmacyDailyHours * daysInMonth;

    let penaltyPoints = 0, bonusPoints = 0;
    try {
      const allPolicies   = await API['appliedPolicies:listByEmployee']({ employee_id: employee.id, limit: 1000 });
      const monthPolicies = allPolicies.filter((p) => p.date && p.date.startsWith(ym));
      for (const p of monthPolicies) {
        if (p.type === 'penalty') penaltyPoints += Number(p.points) || 0;
        else if (p.type === 'bonus') bonusPoints += Number(p.points) || 0;
      }
    } catch (_) {}

    const savedSheetPersonal = loadNum(SP_SHEET_KEY(employee.id, ym));
    const savedSheetBranch   = loadNum(SB_SHEET_KEY(employee.id, ym));

    // Incentive is based on monthly hours ONLY (without overtime)
    function calcIncentive(baseHours) {
      if (!hasIncentive) return 0;
      if (!totalMonthlyHours || !monthlyBase) return 0;
      const R = baseHours / totalMonthlyHours;
      return +(R * monthlyBase).toFixed(2);
    }

    const monthlyInput   = roInput(U.fmtNumber(monthlyHours) + ' س');
    const totalInput     = roInput('0.00 س');
    const advanceInput   = roInput(U.fmtMoney(advance) + ' ج.م');
    const hoursPayInput  = roInput('0.00 ج.م');
    const netInput       = roInput('0.00 ج.م', 'sheet-input-net');
    const incentiveInput = roInput(
      hasIncentive ? (U.fmtMoney(calcIncentive(monthlyHours)) + ' ج.م') : 'غير مفعّل',
      'sheet-input-incentive'
    );

    const avgDailyHours = daysInMonth > 0 ? +(monthlyHours / daysInMonth).toFixed(4) : 0;
    const overtimeDaysInput = U.el('input', {
      type: 'number', min: '0', max: '31', step: '1', class: 'form-control',
      placeholder: '0', value: saved.overtimeDays || '', style: 'width:110px;'
    });
    const overtimeInput = U.el('input', {
      type: 'number', min: '0', step: '0.01', class: 'form-control',
      placeholder: '0.00', value: saved.overtime || ''
    });
    const overtimeWrapper = U.el('div', { style: 'display:flex;gap:10px;align-items:flex-start;' }, [
      U.el('div', { style: 'flex:0 0 auto;' }, [
        U.el('div', { class: 'muted', style: 'font-size:11px;margin-bottom:4px;' }, ['عدد الأيام الإضافية']),
        overtimeDaysInput
      ]),
      U.el('div', { style: 'flex:1;' }, [
        U.el('div', { class: 'muted', style: 'font-size:11px;margin-bottom:4px;' }, ['الساعات (يدوي أو تلقائي)']),
        overtimeInput
      ])
    ]);
    const personalInput = U.el('input', {
      type: 'number', min: '0', step: '0.01', class: 'form-control sheet-input-target-edit',
      placeholder: '0.00',
      value: savedSheetPersonal !== null ? String(savedSheetPersonal) : ''
    });
    const branchInput = U.el('input', {
      type: 'number', min: '0', step: '0.01', class: 'form-control sheet-input-target-edit',
      placeholder: '0.00',
      value: savedSheetBranch !== null ? String(savedSheetBranch) : ''
    });

    function recalc() {
      const ot       = Number(overtimeInput.value) || 0;
      const personal = Number(personalInput.value) || 0;
      const branch   = Number(branchInput.value)   || 0;
      const total    = monthlyHours + ot;
      // Incentive is based on base monthly hours ONLY (without overtime)
      const inc      = calcIncentive(monthlyHours);
      const hoursPay = +(total * rate).toFixed(2);
      const net      = +(hoursPay + inc + personal + branch - advance).toFixed(2);
      totalInput.value     = U.fmtNumber(total) + ' س';
      hoursPayInput.value  = U.fmtMoney(hoursPay) + ' ج.م';
      incentiveInput.value = hasIncentive ? (U.fmtMoney(inc) + ' ج.م') : 'غير مفعّل';
      netInput.value       = U.fmtMoney(net) + ' ج.م';
    }

    let _saving = false;
    function saveSheet() {
      if (_saving) return;
      _saving = true;
      setTimeout(() => { _saving = false; }, 1000);
      const ot       = Number(overtimeInput.value) || 0;
      const personal = Number(personalInput.value) || 0;
      const branch   = Number(branchInput.value)   || 0;
      const total    = monthlyHours + ot;
      // Incentive calculated from base monthly hours (no overtime)
      const inc      = calcIncentive(monthlyHours);
      const net      = +(total * rate + inc + personal + branch - advance).toFixed(2);
      saveNum(SP_SHEET_KEY(employee.id, ym), personal);
      saveNum(SB_SHEET_KEY(employee.id, ym), branch);
      saveJSON(SHEET_KEY(employee.id, ym), { overtime: overtimeInput.value, overtimeDays: overtimeDaysInput.value, net });
      U.toast('تم حفظ شيت الراتب', 'success');
      U.closeModal();
      if (onSaved) onSaved();
    }

    overtimeDaysInput.addEventListener('input', () => {
      const d = Number(overtimeDaysInput.value) || 0;
      if (d > 0 && avgDailyHours > 0) overtimeInput.value = String(+(avgDailyHours * d).toFixed(2));
      recalc();
    });
    overtimeInput.addEventListener('input', recalc);
    personalInput.addEventListener('input', recalc);
    branchInput.addEventListener('input',   recalc);
    recalc();

    const incentiveHint = !hasIncentive
      ? 'الحافز معطّل لهذا الموظف'
      : (totalMonthlyHours && monthlyBase
          ? `الحافز (${U.fmtMoney(monthlyBase)}) × نسبة الساعات الشهرية فقط (بدون أوفرتايم)`
          : 'يرجى ضبط ساعات العمل اليومية والحافز الأساسي');

    const body = U.el('div', { class: 'salary-sheet' });
    body.appendChild(U.el('div', { class: 'sheet-meta' }, [
      metaCell('الموظف', employee.name),
      metaCell('الشهر', ymLabel(ym)),
      metaCell('سعر الساعة', U.fmtMoney(rate) + ' ج.م'),
      metaCell('إجمالي ساعات الشهر', totalMonthlyHours ? U.fmtNumber(totalMonthlyHours) + ' س' : 'غير محدد')
    ]));
    body.appendChild(sheetRow('ساعات العمل الشهرية', monthlyInput, 'محسوبة تلقائياً من سجل الحضور لهذا الشهر'));
    body.appendChild(sheetRow('ساعات إضافية (Overtime)', overtimeWrapper, `متوسط يومي: ${U.fmtNumber(avgDailyHours)} س — الأوفرتايم يُضاف للراتب فقط، لا يدخل في حساب الحافز`));
    body.appendChild(sheetRow('إجمالي الساعات', totalInput, 'الشهرية + الإضافية (الحافز يُحسب من الشهرية فقط)'));
    body.appendChild(sheetRow('راتب الساعات (ساعات × سعر الساعة)', hoursPayInput, 'إجمالي الساعات × سعر الساعة محسوب تلقائياً'));
    body.appendChild(collapsibleSection('الأهداف الشهرية', [
      sheetRow('التارجت الشخصي', personalInput, 'يمكن تعديله هنا'),
      sheetRow('التارجت الفرعي',  branchInput,  'يمكن تعديله هنا')
    ], true));
    body.appendChild(collapsibleSection('حساب الراتب', [
      sheetRow('الحافز الأساسي (محسوب تلقائياً)', incentiveInput, incentiveHint),
      sheetRow('السلفة (Advance)', advanceInput, 'مجمع تلقائياً من سجل السلف'),
      sheetRow('صافي الراتب (Net Salary)', netInput, '(إجمالي الساعات × سعر الساعة) + الحافز + التارجت − السلفة', true)
    ], true));

    U.showModal({
      title: 'شيت الراتب — ' + employee.name + ' — ' + ymLabel(ym),
      body,
      footer: [
        U.el('button', { class: 'btn', onclick: saveSheet }, ['حفظ الشيت']),
        U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إغلاق'])
      ]
    });
  }

  function collapsibleSection(label, rows, defaultOpen) {
    const wrapper = U.el('div', { class: 'sheet-collapse-wrapper' });
    const header  = U.el('div', { class: 'sheet-section-label sheet-section-toggle' });
    const arrow   = U.el('span', { class: 'sheet-collapse-arrow' }, [defaultOpen ? '▼' : '▶']);
    header.appendChild(arrow);
    header.appendChild(U.el('span', {}, [label]));
    const content = U.el('div', { class: 'sheet-collapse-content' });
    if (!defaultOpen) content.style.display = 'none';
    rows.forEach((r) => content.appendChild(r));
    header.addEventListener('click', () => {
      const isOpen = content.style.display !== 'none';
      content.style.display = isOpen ? 'none' : '';
      arrow.textContent = isOpen ? '▶' : '▼';
      header.classList.toggle('collapsed', isOpen);
    });
    wrapper.appendChild(header);
    wrapper.appendChild(content);
    return wrapper;
  }

  function renderAdvances(root, rows, onRefresh) {
    root.innerHTML = '';
    if (!rows.length) {
      root.innerHTML = '<div class="empty-row">لا توجد سلف مسجلة لهذا الشهر.</div>';
      return;
    }
    const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    root.appendChild(U.el('div', { class: 'flex-between mb-3', style: 'padding:0 4px' }, [
      U.el('span', { class: 'muted' }, [`${rows.length} سجل`]),
      U.el('strong', { style: 'color:#dc2626;' }, ['إجمالي: ' + U.fmtMoney(total) + ' ج.م'])
    ]));
    const wrap = U.el('div', { class: 'table-wrap' });
    const tbl  = U.el('table', { class: 'table' });
    tbl.innerHTML = `<thead><tr>
      <th>التاريخ</th><th>المبلغ</th><th>الملاحظات</th><th></th>
    </tr></thead>`;
    const tbody = U.el('tbody');
    rows.forEach((r) => {
      const tr = U.el('tr');
      tr.innerHTML = `
        <td>${U.fmtDate(r.date)}</td>
        <td><strong style="color:#dc2626;">${U.fmtMoney(r.amount)} ج.م</strong></td>
        <td>${r.notes || '<span class="muted">—</span>'}</td>`;
      const td = U.el('td');
      td.appendChild(U.el('button', {
        class: 'btn-icon danger', title: 'حذف السلفة',
        onclick: () => U.confirmDialog('هل تريد حذف هذه السلفة؟', async () => {
          try {
            await API['advances:delete']({ id: r.id });
            U.toast('تم حذف السلفة', 'success');
            onRefresh();
          } catch (e) { U.toast(e.message, 'error'); }
        })
      }, ['🗑']));
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    root.appendChild(wrap);
  }

  function metaCell(label, value) {
    return U.el('div', {}, [
      U.el('div', { class: 'sheet-meta-label' }, [label]),
      U.el('div', { class: 'sheet-meta-value' }, [value])
    ]);
  }
  function sheetRow(label, input, hint, highlight) {
    return U.el('div', { class: 'sheet-row' + (highlight ? ' highlight' : '') }, [
      U.el('div', { class: 'sheet-label-col' }, [
        U.el('div', { class: 'sheet-label' }, [label]),
        hint ? U.el('div', { class: 'sheet-hint' }, [hint]) : ''
      ]),
      U.el('div', { class: 'sheet-input-col' }, [input])
    ]);
  }
  function roInput(value, extraClass) {
    return U.el('input', {
      type: 'text', readonly: true,
      class: 'form-control sheet-input-readonly ' + (extraClass || ''), value
    });
  }
  function kpiCard(label, value, cls, sub) {
    const card = U.el('div', { class: 'stat-card kpi-card ' + cls });
    card.appendChild(U.el('div', { class: 'stat-label' }, [label]));
    card.appendChild(U.el('div', { class: 'stat-value kpi-value ' + cls }, [value]));
    if (sub) card.appendChild(U.el('div', { class: 'kpi-sub' }, [sub]));
    return card;
  }
  function gradeInfo(r) {
    if (r >= 1.0)  return { grade: 'A+', color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' };
    if (r >= 0.9)  return { grade: 'A',  color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' };
    if (r >= 0.8)  return { grade: 'B+', color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' };
    if (r >= 0.7)  return { grade: 'B',  color: '#1e40af', bg: '#dbeafe', border: '#93c5fd' };
    if (r >= 0.5)  return { grade: 'C+', color: '#1e40af', bg: '#dbeafe', border: '#93c5fd' };
    if (r >= 0.3)  return { grade: 'C',  color: '#1e40af', bg: '#dbeafe', border: '#93c5fd' };
    if (r >= 0.0)  return { grade: 'D',  color: '#92400e', bg: '#fef3c7', border: '#fcd34d' };
    return           { grade: 'F',  color: '#7f1d1d', bg: '#fee2e2', border: '#fca5a5' };
  }
  function ratingKpiCard(g, hint) {
    const card = U.el('div', {
      class: 'stat-card kpi-card',
      style: `background:${g.bg};border:1.5px solid ${g.border};`
    });
    card.appendChild(U.el('div', { class: 'stat-label', style: `color:${g.color};` }, ['التقييم الشهري']));
    card.appendChild(U.el('div', {
      class: 'stat-value kpi-value',
      style: `color:${g.color};font-size:2rem;font-weight:800;letter-spacing:2px;`
    }, [g.grade]));
    if (hint) card.appendChild(U.el('div', { class: 'kpi-sub', style: `color:${g.color};opacity:.75;` }, [hint]));
    return card;
  }

  window.MgrTabSalary = { render };
})();
