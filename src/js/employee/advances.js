// Employee → Advances section: add advance + history.
(function () {
  async function render(root, { employeeId }) {
    root.innerHTML = '';
    root.appendChild(U.el('div', { class: 'page-header' }, [
      U.el('div', {}, [
        U.el('div', { class: 'page-title' }, ['السلف']),
        U.el('div', { class: 'page-subtitle' }, ['تسجيل سلفة جديدة وعرض السجل الكامل.'])
      ])
    ]));

    const formCard = U.el('div', { class: 'card' });
    formCard.appendChild(U.el('div', { class: 'card-title' }, ['تسجيل سلفة جديدة']));
    const grid = U.el('div', { class: 'form-grid' });
    const amount = U.el('input', { type: 'number', class: 'form-control', placeholder: 'المبلغ', step: '0.01', min: '0' });
    const date = U.el('input', { type: 'date', class: 'form-control', value: U.todayISO() });
    const notes = U.el('textarea', { class: 'form-control', placeholder: 'ملاحظات (اختياري)' });

    grid.appendChild(group('المبلغ', amount));
    grid.appendChild(group('التاريخ', date));
    grid.appendChild(group('ملاحظات', notes));
    formCard.appendChild(grid);

    const submitBtn = U.el('button', {
      class: 'btn mt-3',
      onclick: async () => {
        try {
          await API['advances:create']({
            employee_id: employeeId,
            amount: amount.value,
            date: date.value,
            notes: notes.value
          });
          amount.value = ''; notes.value = '';
          U.toast('تم تسجيل السلفة', 'success');
          refresh();
        } catch (e) { U.toast(e.message, 'error'); }
      }
    }, ['حفظ']);
    formCard.appendChild(submitBtn);
    U.makeCollapsible(formCard, true);
    root.appendChild(formCard);

    const histCard = U.el('div', { class: 'card' });
    histCard.appendChild(U.el('div', { class: 'card-title' }, ['سجل السلف']));
    const histBody = U.el('div');
    histCard.appendChild(histBody);
    U.makeCollapsible(histCard, false);
    root.appendChild(histCard);

    async function refresh() {
      const rows = await API['advances:listByEmployee']({ employee_id: employeeId, limit: 200 });
      renderHistory(histBody, rows);
    }
    refresh();
  }

  function group(label, control) {
    return U.el('div', { class: 'form-group' }, [
      U.el('label', { class: 'form-label' }, [label]),
      control
    ]);
  }

  function renderHistory(root, rows) {
    root.innerHTML = '';
    if (!rows.length) { root.innerHTML = '<div class="empty" style="padding:40px;text-align:center;color:#9ca3af;">لا يوجد سلف مسجلة</div>'; return; }
    const total = rows.reduce((s, r) => s + r.amount, 0);
    root.appendChild(U.el('div', { class: 'flex-between mb-3' }, [
      U.el('div', { class: 'muted' }, [`عدد السجلات: ${rows.length}`]),
      U.el('div', { class: 'muted' }, [`الإجمالي: ${U.fmtMoney(total)} ج.م`])
    ]));
    const wrap = U.el('div', { class: 'table-wrap' });
    const tbl = U.el('table', { class: 'table' });
    tbl.innerHTML = `
      <thead><tr><th>التاريخ</th><th>المبلغ</th><th>الملاحظات</th></tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${U.fmtDate(r.date)}</td>
            <td>${U.fmtMoney(r.amount)} ج.م</td>
            <td>${r.notes || '-'}</td>
          </tr>`).join('')}
      </tbody>`;
    wrap.appendChild(tbl);
    root.appendChild(wrap);
  }

  window.EmployeeAdvances = { render };
})();
