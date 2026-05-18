// Manager → Policies (points-based rewards & penalties; NOT money).
(function () {
  async function render(root) {
    root.innerHTML = '';

    const header = U.el('div', { class: 'page-header' }, [
      U.el('div', {}, [
        U.el('div', { class: 'page-title' }, ['السياسات (نظام النقاط)'])
      ]),
      U.el('div', { class: 'flex-row' }, [
        U.el('button', {
          class: 'btn btn-secondary',
          onclick: () => openAssignModal(refresh)
        }, ['👤 تطبيق سياسة على موظف']),
        U.el('button', { class: 'btn', onclick: () => openModal(null, refresh) }, ['+ إضافة سياسة'])
      ])
    ]);
    root.appendChild(header);

    const card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'card-title' }, ['📋 قائمة السياسات']));
    const tableWrap = U.el('div', { class: 'table-wrap' });
    card.appendChild(tableWrap);
    U.makeCollapsible(card, true);
    root.appendChild(card);

    async function refresh() {
      const rows = await API['policies:list']();
      tableWrap.innerHTML = '';
      const table = U.el('table', { class: 'table' });
      table.innerHTML = `
        <thead><tr>
          <th>#</th><th>الاسم</th><th>النوع</th><th>النقاط</th><th>الإجراءات</th>
        </tr></thead>
      `;
      const tbody = U.el('tbody');
      if (!rows.length) {
        tbody.innerHTML = `<tr><td class="empty" colspan="5">لا توجد سياسات. أضف أول سياسة للبدء.</td></tr>`;
      } else {
        rows.forEach((p, i) => {
          const tr = U.el('tr');
          const typeBadge = p.type === 'bonus'
            ? '<span class="badge badge-success">+ مكافأة</span>'
            : '<span class="badge badge-danger">− عقوبة</span>';
          const sign = p.type === 'bonus' ? '+' : '−';
          const ptsClass = p.type === 'bonus' ? 'positive' : 'negative';
          tr.innerHTML = `
            <td>${i + 1}</td>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td>${typeBadge}</td>
            <td><strong style="color:${p.type === 'bonus' ? '#059669' : '#dc2626'}">${sign} ${U.fmtNumber(p.points)} نقطة</strong></td>
          `;
          const td = U.el('td');
          td.appendChild(U.el('button', {
            class: 'btn-icon', title: 'تعديل',
            onclick: () => openModal(p, refresh)
          }, ['✏']));
          td.appendChild(U.el('button', {
            class: 'btn-icon danger', title: 'حذف',
            onclick: () => U.confirmDialog(`حذف السياسة "${p.name}"؟`, async () => {
              try { await API['policies:delete']({ id: p.id }); U.toast('تم الحذف', 'success'); refresh(); }
              catch (e) { U.toast(e.message, 'error'); }
            })
          }, ['🗑']));
          tr.appendChild(td);
          tbody.appendChild(tr);
        });
      }
      table.appendChild(tbody);
      tableWrap.appendChild(table);
    }
    refresh();
  }

  function openModal(policy, refresh) {
    const isEdit = !!policy;
    const name = U.el('input', {
      type: 'text', class: 'form-control', placeholder: 'مثال: تأخير، حضور ممتاز',
      value: policy ? policy.name : ''
    });
    const type = U.el('select', { class: 'form-control' }, [
      U.el('option', { value: 'bonus' }, ['مكافأة (+)']),
      U.el('option', { value: 'penalty' }, ['عقوبة (−)'])
    ]);
    type.value = policy ? policy.type : 'bonus';
    const points = U.el('input', {
      type: 'number', class: 'form-control', min: '0.01', step: '0.01',
      placeholder: 'مثال: 5',
      value: policy ? policy.points : ''
    });

    const body = U.el('div');
    body.appendChild(group('اسم السياسة *', name));
    const grid = U.el('div', { class: 'form-grid' });
    grid.appendChild(group('النوع *', type));
    grid.appendChild(group('عدد النقاط *', points));
    body.appendChild(grid);

    U.showModal({
      title: isEdit ? 'تعديل السياسة' : 'إضافة سياسة جديدة',
      body,
      footer: [
        U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إلغاء']),
        U.el('button', {
          class: 'btn',
          onclick: async () => {
            try {
              const payload = { name: name.value, type: type.value, points: points.value };
              if (isEdit) await API['policies:update']({ id: policy.id, ...payload });
              else await API['policies:create'](payload);
              U.closeModal();
              U.toast(isEdit ? 'تم التحديث' : 'تمت الإضافة', 'success');
              refresh();
            } catch (e) { U.toast(e.message, 'error'); }
          }
        }, [isEdit ? 'تحديث' : 'حفظ'])
      ]
    });
  }

  // Modal: assign an existing policy to a chosen employee.
  // Uses the existing `appliedPolicies:apply` IPC + applied_policies table —
  // (functionally identical to the suggested employee_policies table).
  async function openAssignModal(refresh) {
    let employees = [];
    let policies = [];
    try {
      [employees, policies] = await Promise.all([
        API['employees:list'](),
        API['policies:list']()
      ]);
    } catch (e) { U.toast(e.message, 'error'); return; }

    if (!employees.length) { U.toast('لا يوجد موظفون. أضف موظفاً أولاً.', 'warning'); return; }
    if (!policies.length)  { U.toast('لا توجد سياسات. أضف سياسة أولاً.', 'warning'); return; }

    const empSel = U.el('select', { class: 'form-control' },
      employees.map((e) => U.el('option', { value: e.id }, [e.name]))
    );
    const polSel = U.el('select', { class: 'form-control' },
      policies.map((p) => U.el('option', { value: p.id }, [
        `${p.type === 'bonus' ? '+' : '−'} ${p.name} (${U.fmtNumber(p.points)} نقطة)`
      ]))
    );
    const date  = U.el('input', { type: 'date', class: 'form-control', value: U.todayISO() });
    const notes = U.el('input', { type: 'text', class: 'form-control', placeholder: 'ملاحظات (اختياري)' });

    const body = U.el('div');
    body.appendChild(group('الموظف *', empSel));
    body.appendChild(group('السياسة *', polSel));
    const grid = U.el('div', { class: 'form-grid' });
    grid.appendChild(group('التاريخ', date));
    grid.appendChild(group('ملاحظات', notes));
    body.appendChild(grid);

    U.showModal({
      title: 'تطبيق سياسة على موظف',
      body,
      footer: [
        U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إلغاء']),
        U.el('button', {
          class: 'btn',
          onclick: async () => {
            try {
              await API['appliedPolicies:apply']({
                employee_id: Number(empSel.value),
                policy_id:   Number(polSel.value),
                date:        date.value,
                notes:       notes.value
              });
              U.closeModal();
              U.toast('تم تطبيق السياسة على الموظف', 'success');
              refresh();
            } catch (e) { U.toast(e.message, 'error'); }
          }
        }, ['تطبيق'])
      ]
    });
  }

  function group(label, control) {
    return U.el('div', { class: 'form-group' }, [
      U.el('label', { class: 'form-label' }, [label]), control
    ]);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.ManagerPolicies = { render };
})();
