// Employee → Salary section: read-only summary + monthly rating KPI.
// Locked until manager approves for the current month.
(function () {
  const APPROVAL_KEY = (empId, ym) => `salaryApproved:${empId}:${ym}`;

  function currentYm() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  }

  function diffHours(ci, co) {
    if (!ci || !co) return 0;
    const a = new Date(ci).getTime(), b = new Date(co).getTime();
    return (isNaN(a) || isNaN(b) || b <= a) ? 0 : (b - a) / 3600000;
  }

  async function render(root, { employeeId }) {
    root.innerHTML = '';
    root.appendChild(U.el('div', { class: 'page-header' }, [
      U.el('div', {}, [
        U.el('div', { class: 'page-title' }, ['الراتب']),
        U.el('div', { class: 'page-subtitle' }, ['ملخص الراتب الإجمالي والصافي والخصومات والمكافآت.'])
      ])
    ]));

    const ym = currentYm();

    // ── Check manager approval ──
    const approved = localStorage.getItem(APPROVAL_KEY(employeeId, ym)) === '1';
    if (!approved) {
      root.appendChild(U.el('div', {
        style: [
          'display:flex;flex-direction:column;align-items:center;justify-content:center;',
          'padding:80px 20px;text-align:center;',
          'background:linear-gradient(135deg,#f8fafc,#eff6ff);',
          'border:1.5px dashed #bfdbfe;border-radius:20px;margin-top:16px;'
        ].join('')
      }, [
        U.el('div', { style: 'font-size:48px;margin-bottom:16px;' }, ['🔒']),
        U.el('div', { style: 'font-size:18px;font-weight:800;color:#0f172a;margin-bottom:8px;' }, ['شاشة الراتب مقفلة']),
        U.el('div', { style: 'color:#64748b;font-size:14px;max-width:320px;line-height:1.6;' }, [
          'شاشة الراتب لهذا الشهر لم تُفتح بعد. يرجى التواصل مع المدير للموافقة على عرض راتب هذا الشهر.'
        ])
      ]));
      return;
    }

    const summary = await API['salary:summary']({ employee_id: employeeId });

    // ── Fetch data for rating ──
    let pharmacyDailyHours = 0;
    try { const s = await API['settings:get'](); pharmacyDailyHours = s.pharmacy_daily_hours || 0; } catch (_) {}

    const [ymYear, ymMonth] = ym.split('-').map(Number);
    const daysInMonth        = new Date(ymYear, ymMonth, 0).getDate();
    const totalMonthlyHours  = pharmacyDailyHours * daysInMonth;

    let empMonthlyHours = 0;
    try {
      const rows = await API['attendance:listByEmployee']({ employee_id: employeeId, limit: 1000 });
      empMonthlyHours = rows
        .filter((r) => r.date && r.date.startsWith(ym))
        .reduce((s, r) => s + diffHours(r.check_in, r.check_out), 0);
    } catch (_) {}

    let monthlyBase = 0;
    try { const r = await API['settings:getKey']({ key: `incentive_base:${ym}` }); monthlyBase = Number(r.value) || 0; } catch (_) {}

    let penaltyPoints = 0, bonusPoints = 0;
    try {
      const all = await API['appliedPolicies:listByEmployee']({ employee_id: employeeId, limit: 1000 });
      all.filter((p) => p.date && p.date.startsWith(ym)).forEach((p) => {
        if (p.type === 'penalty') penaltyPoints += Number(p.points) || 0;
        else if (p.type === 'bonus') bonusPoints += Number(p.points) || 0;
      });
    } catch (_) {}

    // ── New rating formula ──
    // R = empMonthlyHours / totalMonthlyHours
    // A = monthlyBase (الحافز الأساسي الشهري)
    // S = penaltyPoints - bonusPoints (صافي النقاط)
    // monthlyRating = ((R * A) - S) / (R * A)
    const R = totalMonthlyHours ? empMonthlyHours / totalMonthlyHours : 0;
    const A = monthlyBase;
    const S = penaltyPoints - bonusPoints;
    const RA = R * A;
    const monthlyRating = RA > 0 ? +((RA - S) / RA).toFixed(3) : 0;
    const grade = gradeInfo(monthlyRating);

    const ratingHint = totalMonthlyHours && A
      ? `R=${(R * 100).toFixed(1)}% × A=${U.fmtMoney(A)} — S=${S >= 0 ? '+' : ''}${S}`
      : 'يرجى ضبط ساعات العمل والحافز الأساسي في الإعدادات';

    // ── KPI: التقييم الشهري ──
    root.appendChild(U.el('div', { class: 'kpi-section-label' }, ['⭐ التقييم الشهري']));
    const ratingGrid = U.el('div', { class: 'stats-grid', style: 'margin-bottom:18px;' });
    ratingGrid.appendChild(ratingKpiCard(grade, ratingHint));
    ratingGrid.appendChild(kpiCard('⏱ ساعات الشهر',   U.fmtNumber(empMonthlyHours) + ' س', 'neutral'));
    ratingGrid.appendChild(kpiCard('📉 نقاط الخصم',    penaltyPoints.toFixed(2),  penaltyPoints > 0 ? 'negative' : 'positive'));
    ratingGrid.appendChild(kpiCard('🎁 نقاط المكافأة', bonusPoints.toFixed(2),    bonusPoints  > 0 ? 'positive' : 'neutral'));
    root.appendChild(ratingGrid);

    // ── Salary stats ──
    const stats = U.el('div', { class: 'stats-grid' });
    stats.appendChild(stat('إجمالي السلف', U.fmtMoney(summary.advances) + ' ج.م', 'negative'));
    stats.appendChild(stat('صافي الراتب',  U.fmtMoney(summary.net)      + ' ج.م', 'neutral'));
    root.appendChild(stats);

    // ── تحديث تلقائي للـ KPI كل 30 ثانية لرصد تغييرات المدير فوراً ──
    if (root._salaryPoll) { clearInterval(root._salaryPoll); root._salaryPoll = null; }
    root._salaryPoll = setInterval(async () => {
      if (!root.isConnected) { clearInterval(root._salaryPoll); root._salaryPoll = null; return; }
      await render(root, { employeeId });
    }, 30000);
  }

  function stat(label, value, cls) {
    return U.el('div', { class: 'stat-card' }, [
      U.el('div', { class: 'stat-label' }, [label]),
      U.el('div', { class: 'stat-value ' + cls }, [value])
    ]);
  }

  function kpiCard(label, value, cls, sub) {
    const card = U.el('div', { class: 'stat-card kpi-card ' + cls });
    card.appendChild(U.el('div', { class: 'stat-label' }, [label]));
    card.appendChild(U.el('div', { class: 'stat-value kpi-value ' + cls }, [value]));
    if (sub) card.appendChild(U.el('div', { class: 'kpi-sub' }, [sub]));
    return card;
  }

  /* ---------- تقييم شهري: حروف + ألوان ---------- */
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
    card.appendChild(U.el('div', { class: 'stat-label', style: `color:${g.color};` }, ['⭐ التقييم الشهري']));
    card.appendChild(U.el('div', {
      class: 'stat-value kpi-value',
      style: `color:${g.color};font-size:2rem;font-weight:800;letter-spacing:2px;`
    }, [g.grade]));
    if (hint) card.appendChild(U.el('div', { class: 'kpi-sub', style: `color:${g.color};opacity:.75;` }, [hint]));
    return card;
  }

  window.EmployeeSalary = { render };
})();
