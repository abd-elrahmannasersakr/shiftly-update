// Manager dashboard tab: monthly tasks status - KPI only (completed tasks).
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
  function getDaysInMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    const todayStr = new Date().toISOString().slice(0, 10);
    const daysInMonth = new Date(y, m, 0).getDate();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${ym}-${String(d).padStart(2, '0')}`;
      if (ds > todayStr) break;
      days.push(ds);
    }
    return days;
  }

  async function render(root, { employee, selectedYm }) {
    const ym = selectedYm || currentYm();
    root.innerHTML = '';

    root.appendChild(U.el('div', { class: 'rev-header' }, [
      U.el('div', { class: 'rev-header-eyebrow' }, ['الشهر المعروض']),
      U.el('div', { class: 'rev-header-title' }, [ymLabel(ym)])
    ]));

    const statsCard = U.el('div', { class: 'card' });
    statsCard.appendChild(U.el('div', { class: 'card-title' }, [
      U.el('span', {}, ['🧹 ملخص المهام الشهرية']),
      U.el('span', { class: 'card-subtitle-pill' }, [ymLabel(ym)])
    ]));
    const statsGrid = U.el('div', { class: 'stats-grid' });
    statsCard.appendChild(statsGrid);
    U.makeCollapsible(statsCard, true);
    root.appendChild(statsCard);

    const listCard = U.el('div', { class: 'card' });
    listCard.appendChild(U.el('div', { class: 'card-title' }, [
      U.el('span', {}, ['📋 سجل المهام المكتملة']),
      U.el('span', { class: 'card-subtitle-pill' }, [ymLabel(ym)])
    ]));
    const listBody = U.el('div');
    listCard.appendChild(listBody);
    U.makeCollapsible(listCard, false);
    root.appendChild(listCard);

    // API returns only completed tasks (status = 'done') due to KPI filter
    const rows = await API['cleaning:monthly']({ employee_id: employee.id, month: ym });
    const allDays = getDaysInMonth(ym);
    const totalDays = allDays.length;

    // Stats: show only completed tasks count and percentage
    const completedCount = rows.length;
    const percentage = totalDays > 0 ? Math.round((completedCount / totalDays) * 100) : 0;

    renderStats(statsGrid, completedCount, totalDays, percentage);
    renderList(listBody, rows);
  }

  function renderStats(root, completedCount, totalDays, percentage) {
    root.innerHTML = '';
    const notDone = totalDays - completedCount;
    root.appendChild(stat('تمت المهمة', completedCount, 'positive'));
    root.appendChild(stat('لم تتم المهمة', notDone, 'negative'));
    root.appendChild(stat('نسبة الإنجاز', percentage + '%', percentage >= 80 ? 'positive' : (percentage >= 50 ? 'neutral' : 'negative')));
  }

  function stat(label, value, cls) {
    return U.el('div', { class: 'stat-card' }, [
      U.el('div', { class: 'stat-label' }, [label]),
      U.el('div', { class: 'stat-value ' + cls }, [String(value)])
    ]);
  }

  function renderList(root, rows) {
    root.innerHTML = '';
    if (!rows.length) {
      root.innerHTML = '<div class="empty-row">لا توجد مهام مكتملة مسجلة لهذا الشهر.</div>';
      return;
    }
    const wrap = U.el('div', { class: 'table-wrap' });
    const tbl = U.el('table', { class: 'table' });
    tbl.innerHTML = `
      <thead><tr><th>التاريخ</th><th>الحالة</th><th>الملاحظات</th></tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${U.fmtDate(r.date)}</td>
            <td>${U.statusBadge(r.status)}</td>
            <td>${r.notes || '—'}</td>
          </tr>`).join('')}
      </tbody>`;
    wrap.appendChild(tbl);
    root.appendChild(wrap);
  }

  window.MgrTabCleaning = { render };
})();
