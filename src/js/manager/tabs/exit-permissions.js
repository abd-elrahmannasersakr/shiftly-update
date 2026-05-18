// Manager tab: exit/return actual records — manager decides deduct or not.
(function () {
  async function render(root, { employee, selectedYm }) {
    root.innerHTML = '';

    root.appendChild(U.el('div', { class: 'rev-header' }, [
      U.el('div', { class: 'rev-header-eyebrow' }, ['تسجيل الخروج والدخول'],),
      U.el('div', { class: 'rev-header-title' }, ['سجل الخروج والدخول'])
    ]));

    root.appendChild(U.el('div', {
      style: 'margin-bottom:14px;padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;font-size:13px;color:#92400e;'
    }, ['💡 هذا النظام يسجل الخروج والدخول الفعليين للموظف. المدير يختار هل يخصم من الوقت أم لا بناءً على الملاحظات المكتوبة.']));

    const refreshBtn = U.el('button', {
      class: 'btn btn-sm btn-secondary',
      style: 'margin-bottom:14px;',
      onclick: () => loadAndRender()
    }, ['🔄 تحديث']);
    root.appendChild(refreshBtn);

    const container = U.el('div');
    root.appendChild(container);

    async function loadAndRender() {
      container.innerHTML = '<div class="muted" style="padding:20px;">جاري التحميل...</div>';
      try {
        let rows = [];
        if (employee) {
          rows = await API['exitPermissions:listByEmployee']({ employee_id: employee.id, limit: 200 });
          rows = rows.map((r) => ({ ...r, employee_name: employee.name }));
        } else {
          rows = await API['exitPermissions:listAll']({ limit: 300 });
        }

        container.innerHTML = '';

        if (!rows.length) {
          container.innerHTML = '<div class="empty-state" style="padding:60px 20px;text-align:center;"><h3 style="color:#6b7280;">لا يوجد سجل خروج أو دخول</h3></div>';
          return;
        }

        // Today stats
        const today     = new Date().toISOString().slice(0, 10);
        const todayRows = rows.filter((r) => r.requested_at && r.requested_at.startsWith(today));
        const exitCount = todayRows.filter((r) => r.type === 'exit').length;
        const retCount  = todayRows.filter((r) => r.type === 'return').length;
        const pendingCount = todayRows.filter((r) => r.status === 'pending').length;
        const deductedCount = todayRows.filter((r) => r.status === 'deducted' || r.status === 'approved').length;

        const statsGrid = U.el('div', { class: 'stats-grid', style: 'margin-bottom:20px;' });
        statsGrid.appendChild(kpi('🚪 خروج اليوم',   String(exitCount),    'negative'));
        statsGrid.appendChild(kpi('↩ دخول اليوم',    String(retCount),     'positive'));
        statsGrid.appendChild(kpi('⏳ بانتظار القرار', String(pendingCount), 'neutral'));
        statsGrid.appendChild(kpi('💸 تم الخصم',      String(deductedCount), 'negative'));
        container.appendChild(statsGrid);

        // Group by day
        const byDay = {};
        rows.forEach((r) => {
          const day = r.requested_at ? r.requested_at.slice(0, 10) : 'unknown';
          if (!byDay[day]) byDay[day] = [];
          byDay[day].push(r);
        });

        const sortedDays = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

        sortedDays.forEach((day) => {
          const dayRows = byDay[day];
          const isToday = day === today;

          const dayCard = U.el('div', { class: 'card', style: 'margin-bottom:14px;padding:0;overflow:hidden;' });

          const dayHeader = U.el('div', {
            style: `display:flex;align-items:center;gap:10px;padding:12px 16px;
                    background:${isToday ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : '#f8fafc'};
                    border-bottom:1px solid #e5e7eb;`
          }, [
            U.el('span', { style: 'font-size:15px;font-weight:700;color:' + (isToday ? '#1d4ed8' : '#374151') },
              [isToday ? '📅 اليوم — ' + fmtDayLabel(day) : '📅 ' + fmtDayLabel(day)]),
            U.el('span', { style: 'margin-right:auto;font-size:12px;color:#6b7280;background:#e5e7eb;border-radius:20px;padding:2px 10px;' },
              [dayRows.length + ' سجل'])
          ]);
          dayCard.appendChild(dayHeader);

          const pairs = buildPairs(dayRows);

          const tbl   = U.el('table', { class: 'table', style: 'margin:0;' });
          const thead = U.el('thead');
          thead.innerHTML = `<tr style="background:#f9fafb;">
            <th>الموظف</th>
            <th>🚪 وقت الخروج</th>
            <th>↩ وقت الدخول</th>
            <th>⏱ المدة</th>
            <th>الملاحظات</th>
            <th>الحالة</th>
            <th>قرار المدير</th>
          </tr>`;
          tbl.appendChild(thead);

          const tbody = U.el('tbody');
          pairs.forEach((pair) => {
            const tr = U.el('tr');

            // Employee name
            const tdName = U.el('td');
            tdName.innerHTML = `<strong>${escHtml(pair.exit ? pair.exit.employee_name : (pair.ret ? pair.ret.employee_name : '—'))}</strong>`;
            tr.appendChild(tdName);

            // Exit time
            const tdExit = U.el('td');
            tdExit.innerHTML = pair.exit
              ? `<span style="color:#dc2626;font-weight:600;">${fmtTime(pair.exit.requested_at)}</span>`
              : '<span class="muted">—</span>';
            tr.appendChild(tdExit);

            // Return time
            const tdRet = U.el('td');
            tdRet.innerHTML = pair.ret
              ? `<span style="color:#059669;font-weight:600;">${fmtTime(pair.ret.requested_at)}</span>`
              : '<span class="muted">—</span>';
            tr.appendChild(tdRet);

            // Duration
            const tdDur = U.el('td');
            if (pair.exit && pair.ret) {
              const ms  = new Date(pair.ret.requested_at) - new Date(pair.exit.requested_at);
              const min = Math.round(ms / 60000);
              const h   = Math.floor(min / 60), m = min % 60;
              tdDur.innerHTML = `<span style="color:#7c3aed;font-weight:600;">${h ? h + 'س ' : ''}${m}د</span>`;
            } else if (pair.exit && !pair.ret) {
              tdDur.innerHTML = '<span style="color:#f59e0b;font-size:12px;">لم يعد بعد</span>';
            } else {
              tdDur.innerHTML = '<span class="muted">—</span>';
            }
            tr.appendChild(tdDur);

            // Notes (mandatory, show prominently)
            const tdNotes = U.el('td', { style: 'max-width:180px;' });
            const exitNotes = pair.exit && pair.exit.notes ? pair.exit.notes : '';
            const retNotes  = pair.ret  && pair.ret.notes  ? pair.ret.notes  : '';
            let notesHtml = '';
            if (exitNotes) notesHtml += `<div style="font-size:12px;color:#374151;background:#fef9c3;border-radius:4px;padding:2px 6px;margin-bottom:3px;">🚪 ${escHtml(exitNotes)}</div>`;
            if (retNotes)  notesHtml += `<div style="font-size:12px;color:#374151;background:#dcfce7;border-radius:4px;padding:2px 6px;">↩ ${escHtml(retNotes)}</div>`;
            tdNotes.innerHTML = notesHtml || '<span class="muted" style="font-size:11px;">—</span>';
            tr.appendChild(tdNotes);

            // Status
            const tdStatus = U.el('td');
            if (pair.exit) tdStatus.innerHTML = statusBadge(pair.exit.status);
            else if (pair.ret) tdStatus.innerHTML = statusBadge(pair.ret.status);
            tr.appendChild(tdStatus);

            // Manager decision: deduct or no-deduct (only for pending exit)
            const tdAction = U.el('td', { style: 'white-space:nowrap;' });

            const isPending = pair.exit && pair.exit.status === 'pending';
            const isDecided = pair.exit && (pair.exit.status === 'deducted' || pair.exit.status === 'approved' || pair.exit.status === 'rejected' || pair.exit.status === 'not_deducted');

            if (isPending && pair.ret) {
              const deductBtn = U.el('button', {
                class: 'btn btn-sm btn-danger',
                style: 'margin-left:5px;font-size:11.5px;padding:6px 10px;',
                onclick: async () => {
                  try {
                    const result = await API['exitPermissions:approve']({ id: pair.exit.id });
                    const hrs = result && result.hours_out    != null ? result.hours_out.toFixed(2)    : '—';
                    const amt = result && result.deducted_amount != null ? result.deducted_amount.toFixed(2) : '—';
                    U.toast(`💸 تم الخصم — ${hrs} ساعة (${amt} ج.م)`, 'warning');
                    loadAndRender();
                  } catch (e) { U.toast(e.message, 'error'); }
                }
              }, ['💸 خصم من الوقت']);

              const noDeductBtn = U.el('button', {
                class: 'btn btn-sm btn-success',
                style: 'font-size:11.5px;padding:6px 10px;',
                onclick: async () => {
                  try {
                    await API['exitPermissions:reject']({ id: pair.exit.id });
                    U.toast('✔ بدون خصم', 'success');
                    loadAndRender();
                  } catch (e) { U.toast(e.message, 'error'); }
                }
              }, ['✔ بدون خصم']);

              tdAction.appendChild(deductBtn);
              tdAction.appendChild(noDeductBtn);
            } else if (isPending && !pair.ret) {
              tdAction.innerHTML = '<span style="color:#f59e0b;font-size:12px;">⏳ لم يسجل الدخول بعد</span>';
            } else if (isDecided) {
              const decided = pair.exit.status === 'deducted' || pair.exit.status === 'approved'
                ? '<span style="color:#dc2626;font-size:12px;">💸 تم الخصم</span>'
                : '<span style="color:#059669;font-size:12px;">✔ بدون خصم</span>';
              tdAction.innerHTML = decided;
            } else {
              tdAction.innerHTML = '<span class="muted" style="font-size:12px;">—</span>';
            }

            tr.appendChild(tdAction);
            tbody.appendChild(tr);
          });

          tbl.appendChild(tbody);
          dayCard.appendChild(tbl);
          container.appendChild(dayCard);
        });

      } catch (e) {
        container.innerHTML = `<div class="muted" style="padding:20px;color:#dc2626;">خطأ: ${e.message}</div>`;
      }
    }

    loadAndRender();
  }

  function buildPairs(dayRows) {
    const exits   = dayRows.filter((r) => r.type === 'exit');
    const returns = dayRows.filter((r) => r.type === 'return');
    const paired  = new Set();
    const pairs   = [];

    exits.forEach((ex) => {
      const empId = ex.employee_id;
      const ret   = returns.find((r) => r.employee_id === empId && !paired.has(r.id));
      if (ret) paired.add(ret.id);
      pairs.push({ exit: ex, ret: ret || null });
    });

    returns.forEach((r) => {
      if (!paired.has(r.id)) pairs.push({ exit: null, ret: r });
    });

    return pairs;
  }

  function kpi(label, value, cls) {
    return U.el('div', { class: 'stat-card kpi-card ' + cls }, [
      U.el('div', { class: 'stat-label' }, [label]),
      U.el('div', { class: 'stat-value kpi-value ' + cls }, [value])
    ]);
  }

  function statusBadge(status) {
    const map = {
      pending:     '<span class="badge badge-info">⏳ بانتظار القرار</span>',
      noted:       '<span class="badge badge-gray">مُلاحَظ</span>',
      approved:    '<span class="badge badge-danger">💸 تم الخصم</span>',
      deducted:    '<span class="badge badge-danger">💸 تم الخصم</span>',
      rejected:    '<span class="badge badge-success">✔ بدون خصم</span>',
      not_deducted:'<span class="badge badge-success">✔ بدون خصم</span>'
    };
    return map[status] || `<span class="badge badge-gray">${escHtml(status)}</span>`;
  }

  function fmtDayLabel(day) {
    const d = new Date(day + 'T12:00:00');
    if (isNaN(d)) return day;
    return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  }

  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.MgrTabExitPermissions = { render };
})();
