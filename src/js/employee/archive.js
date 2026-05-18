// Employee -> Archive: browse any past month's data (read-only).
(function () {
  const AR_MONTHS = [
    'يناير','فبراير','مارس','أبريل','مايو','يونيو',
    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
  ];

  function buildMonths() {
    const now  = new Date();
    const list = [];
    for (let i = 0; i < 24; i++) {
      const d  = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      list.push({ ym, label: AR_MONTHS[d.getMonth()] + ' ' + d.getFullYear() });
    }
    return list;
  }

  function ymLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    return `${AR_MONTHS[m - 1]} ${y}`;
  }

  async function render(root, { employeeId }) {
    root.innerHTML = '';

    root.appendChild(U.el('div', { class: 'page-header' }, [
      U.el('div', {}, [
        U.el('div', { class: 'page-title' }, ['🗂 الأرشيف']),
        U.el('div', { class: 'page-subtitle' }, ['استعراض بيانات الأشهر السابقة — للقراءة فقط.'])
      ])
    ]));

    const months = buildMonths();
    let selectedYm = months[0].ym;

    const stripWrap = U.el('div', { class: 'month-strip-wrap' });
    const strip     = U.el('div', { class: 'month-strip' });
    stripWrap.appendChild(strip);
    root.appendChild(stripWrap);

    const content = U.el('div');
    root.appendChild(content);

    function renderStrip() {
      strip.innerHTML = '';
      months.forEach((m) => {
        strip.appendChild(U.el('button', {
          class: 'month-chip' + (m.ym === selectedYm ? ' active' : ''),
          onclick: () => { selectedYm = m.ym; renderStrip(); loadMonth(); }
        }, [m.label]));
      });
    }

    async function loadMonth() {
      content.innerHTML = '<div class="muted" style="padding:24px;text-align:center;">⏳ جاري التحميل...</div>';
      try {
        const data = await API['archive:employeeMonth']({ employee_id: employeeId, ym: selectedYm });
        renderMonth(content, data, selectedYm);
      } catch (e) {
        content.innerHTML = `<div class="muted" style="padding:24px;color:#dc2626;">${e.message}</div>`;
      }
    }

    renderStrip();
    loadMonth();
  }

  function renderMonth(root, data, ym) {
    root.innerHTML = '';

    const label = ymLabel(ym);

    root.appendChild(U.el('div', { class: 'rev-header' }, [
      U.el('div', { class: 'rev-header-eyebrow' }, ['الشهر المحدد']),
      U.el('div', { class: 'rev-header-title' }, [label])
    ]));

    // Stats — removed total revenues per request
    const statsGrid = U.el('div', { class: 'stats-grid' });
    statsGrid.appendChild(stat('ساعات الشهر', U.fmtNumber(data.totalHours) + ' س', 'neutral'));
    statsGrid.appendChild(stat('إجمالي السلف', U.fmtMoney(data.totalAdvances) + ' ج.م', 'negative'));
    statsGrid.appendChild(stat('سجلات الحضور', String(data.attendance.length), 'neutral'));
    root.appendChild(statsGrid);

    // Attendance card
    const attCard = U.el('div', { class: 'card' });
    attCard.appendChild(U.el('div', { class: 'card-title' }, [
      U.el('span', {}, ['⏱ سجل الحضور']),
      U.el('span', { class: 'card-subtitle-pill' }, [label])
    ]));
    attCard.appendChild(buildAttTable(data.attendance));
    U.makeCollapsible(attCard, true);
    root.appendChild(attCard);

    // Advances card
    const advCard = U.el('div', { class: 'card' });
    advCard.appendChild(U.el('div', { class: 'card-title' }, [
      U.el('span', {}, ['💸 السلف']),
      U.el('span', { class: 'card-subtitle-pill' }, [label])
    ]));
    advCard.appendChild(buildAdvTable(data.advances));
    U.makeCollapsible(advCard, true);
    root.appendChild(advCard);

    // Cleaning card
    const clnCard = U.el('div', { class: 'card' });
    clnCard.appendChild(U.el('div', { class: 'card-title' }, [
      U.el('span', {}, ['🧹 المهام الشهرية']),
      U.el('span', { class: 'card-subtitle-pill' }, [label])
    ]));
    clnCard.appendChild(buildCleanTable(data.cleaning));
    U.makeCollapsible(clnCard, false);
    root.appendChild(clnCard);

    // Policies card
    const polCard = U.el('div', { class: 'card' });
    polCard.appendChild(U.el('div', { class: 'card-title' }, [
      U.el('span', {}, ['📋 السياسات المطبّقة']),
      U.el('span', { class: 'card-subtitle-pill' }, [label])
    ]));
    polCard.appendChild(buildPolTable(data.policies));
    U.makeCollapsible(polCard, false);
    root.appendChild(polCard);
  }

  function buildAttTable(rows) {
    if (!rows.length) return empty('لا يوجد سجل حضور لهذا الشهر.');
    const wrap = U.el('div', { class: 'table-wrap' });
    const tbl  = U.el('table', { class: 'table' });
    tbl.innerHTML = `
      <thead><tr><th>التاريخ</th><th>الوردية</th><th>الحضور</th><th>الانصراف</th><th>الساعات</th></tr></thead>
      <tbody>
        ${rows.map((r) => {
          const hrs = diffH(r.check_in, r.check_out);
          return `<tr>
            <td>${U.fmtDate(r.date)}</td>
            <td>${r.shift === 1 ? 'الأولى' : 'الثانية'}</td>
            <td>${r.check_in  ? U.fmtTime(r.check_in)  : '—'}</td>
            <td>${r.check_out ? U.fmtTime(r.check_out) : '—'}</td>
            <td>${hrs > 0 ? U.fmtNumber(hrs) + ' س' : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>`;
    wrap.appendChild(tbl);
    return wrap;
  }

  function buildAdvTable(rows) {
    if (!rows.length) return empty('لا توجد سلف لهذا الشهر.');
    const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const wrap = U.el('div');
    wrap.appendChild(U.el('div', { class: 'flex-between mb-3', style: 'padding:0 4px' }, [
      U.el('span', { class: 'muted' }, [`${rows.length} سجل`]),
      U.el('strong', { style: 'color:#dc2626;' }, ['الإجمالي: ' + U.fmtMoney(total) + ' ج.م'])
    ]));
    const tw = U.el('div', { class: 'table-wrap' });
    const tbl = U.el('table', { class: 'table' });
    tbl.innerHTML = `
      <thead><tr><th>التاريخ</th><th>المبلغ</th><th>الملاحظات</th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr>
          <td>${U.fmtDate(r.date)}</td>
          <td><strong style="color:#dc2626;">${U.fmtMoney(r.amount)} ج.م</strong></td>
          <td>${r.notes || '—'}</td>
        </tr>`).join('')}
      </tbody>`;
    tw.appendChild(tbl);
    wrap.appendChild(tw);
    return wrap;
  }

  function buildCleanTable(rows) {
    if (!rows.length) return empty('لا يوجد سجل مهام لهذا الشهر.');
    const wrap = U.el('div', { class: 'table-wrap' });
    const tbl  = U.el('table', { class: 'table' });
    tbl.innerHTML = `
      <thead><tr><th>التاريخ</th><th>الحالة</th><th>الملاحظات</th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr>
          <td>${U.fmtDate(r.date)}</td>
          <td>${U.statusBadge(r.status)}</td>
          <td>${r.notes || '—'}</td>
        </tr>`).join('')}
      </tbody>`;
    wrap.appendChild(tbl);
    return wrap;
  }

  function buildPolTable(rows) {
    if (!rows.length) return empty('لا توجد سياسات مطبّقة لهذا الشهر.');
    const wrap = U.el('div', { class: 'table-wrap' });
    const tbl  = U.el('table', { class: 'table' });
    tbl.innerHTML = `
      <thead><tr><th>التاريخ</th><th>السياسة</th><th>النوع</th><th>النقاط</th></tr></thead>
      <tbody>
        ${rows.map((r) => {
          const sign  = r.type === 'bonus' ? '+' : '−';
          const color = r.type === 'bonus' ? '#059669' : '#dc2626';
          const badge = r.type === 'bonus'
            ? '<span class="badge badge-success">مكافأة</span>'
            : '<span class="badge badge-danger">عقوبة</span>';
          return `<tr>
            <td>${U.fmtDate(r.date)}</td>
            <td>${escHtml(r.policy_name || '')}</td>
            <td>${badge}</td>
            <td><strong style="color:${color}">${sign}${U.fmtNumber(r.points)}</strong></td>
          </tr>`;
        }).join('')}
      </tbody>`;
    wrap.appendChild(tbl);
    return wrap;
  }

  function stat(label, value, cls) {
    return U.el('div', { class: 'stat-card ' + cls }, [
      U.el('div', { class: 'stat-label' }, [label]),
      U.el('div', { class: 'stat-value ' + cls }, [value])
    ]);
  }

  function empty(msg) {
    return U.el('div', { class: 'empty-row' }, [msg]);
  }

  function diffH(ci, co) {
    if (!ci || !co) return 0;
    const a = new Date(ci).getTime(), b = new Date(co).getTime();
    return (isNaN(a) || isNaN(b) || b <= a) ? 0 : +((b - a) / 3600000).toFixed(2);
  }

  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.EmployeeArchive = { render };
})();
