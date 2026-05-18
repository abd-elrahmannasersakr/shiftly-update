// Manager → Incentives: pharmacy hours + per-month incentive base for each fiscal month.
(function () {
  const AR_MONTHS = [
    'يناير','فبراير','مارس','أبريل','مايو','يونيو',
    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
  ];

  // Generate 12 fiscal-year months starting from April of the current fiscal year.
  function fiscalMonths() {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // April = month 3
    const months = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(y, 3 + i); // start from April (month index 3)
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      months.push({ ym: `${d.getFullYear()}-${mm}`, label: AR_MONTHS[d.getMonth()] + ' ' + d.getFullYear() });
    }
    return months;
  }

  async function render(root) {
    root.innerHTML = '';
    root.appendChild(U.el('div', { class: 'page-header' }, [
      U.el('div', {}, [
        U.el('div', { class: 'page-title' }, ['الحوافز']),
        U.el('div', { class: 'page-subtitle' }, [
          'إعدادات ساعات العمل والحافز الأساسي — حافز مختلف لكل شهر في السنة.'
        ])
      ])
    ]));

    const body = U.el('div');
    root.appendChild(body);

    async function refresh() {
      body.innerHTML = '';
      const data = await API['incentives:summary']();
      const monthBases = await API['settings:getMonthBases']();

      // ---- Section 1: Pharmacy Working Hours — collapsible, open ----
      const sec1 = U.el('div', { class: 'card' });
      sec1.appendChild(U.el('div', { class: 'card-title' }, ['⏱ ساعات عمل الصيدلية']));

      const dailyInput = U.el('input', {
        type: 'number', class: 'form-control', min: '0', step: '0.5',
        value: data.settings.pharmacy_daily_hours || 0,
        placeholder: 'مثال: 8'
      });
      const monthlyDisplay = U.el('input', {
        type: 'text', class: 'form-control', readonly: true,
        style: 'background:#f8fafc;font-weight:700;color:#0f172a;',
        value: U.fmtNumber(data.monthly_hours) + ' ساعة'
      });

      dailyInput.addEventListener('input', () => {
        const v = Number(dailyInput.value) || 0;
        monthlyDisplay.value = U.fmtNumber(v * data.days_in_month) + ' ساعة';
      });

      const grid1 = U.el('div', { class: 'form-grid' });
      grid1.appendChild(group('ساعات العمل اليومية', dailyInput));
      grid1.appendChild(group(`الإجمالي الشهري (${data.days_in_month} يوم) — للقراءة فقط`, monthlyDisplay));
      sec1.appendChild(grid1);
      sec1.appendChild(U.el('div', { class: 'card-actions' }, [
        U.el('button', {
          class: 'btn',
          onclick: async () => {
            try {
              await API['settings:update']({ pharmacy_daily_hours: dailyInput.value });
              U.toast('تم حفظ ساعات العمل', 'success');
              refresh();
            } catch (e) { U.toast(e.message, 'error'); }
          }
        }, ['💾 حفظ ساعات العمل'])
      ]));
      U.makeCollapsible(sec1, true);
      body.appendChild(sec1);

      // ---- Section 2: Per-month Incentive Base — collapsible, closed ----
      const sec2 = U.el('div', { class: 'card' });
      sec2.appendChild(U.el('div', { class: 'card-title' }, [
        '💰 الحافز الأساسي — لكل شهر',
        U.el('span', { class: 'card-subtitle-pill' }, ['12 شهراً — السنة الحالية'])
      ]));
      sec2.appendChild(U.el('div', { class: 'muted mb-4' }, [
        'حدد قيمة الحافز الأساسي لكل شهر على حدة. حافز كل موظف = الحافز الأساسي × نسبة الموظف.'
      ]));

      const months = fiscalMonths();

      const monthInputs = {};
      const mgrid = U.el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;padding:18px;background:#fafbff;border:1px solid #e5e7eb;border-radius:14px;' });
      months.forEach(({ ym, label }) => {
        const inp = U.el('input', {
          type: 'number', class: 'form-control', min: '0', step: '0.01',
          placeholder: '0.00',
          value: monthBases[ym] !== undefined ? monthBases[ym] : ''
        });
        monthInputs[ym] = inp;
        const grp = U.el('div', {}, [
          U.el('label', { class: 'form-label', style: 'margin-bottom:6px' }, [label]),
          inp
        ]);
        mgrid.appendChild(grp);
      });
      sec2.appendChild(mgrid);

      sec2.appendChild(U.el('div', { class: 'card-actions mt-3' }, [
        U.el('button', {
          class: 'btn btn-success',
          onclick: async () => {
            try {
              const saveOps = Object.entries(monthInputs).map(([ym, inp]) =>
                API['settings:setKey']({ key: `incentive_base:${ym}`, value: inp.value || '0' })
              );
              await Promise.all(saveOps);
              U.toast('تم حفظ جميع الحوافز الشهرية', 'success');
              refresh();
            } catch (e) { U.toast(e.message, 'error'); }
          }
        }, ['💾 حفظ جميع الحوافز الشهرية'])
      ]));
      U.makeCollapsible(sec2, false);
      body.appendChild(sec2);

      // ---- Section 3: Per-employee summary — collapsible, open ----
      const sec3 = U.el('div', { class: 'card' });
      sec3.appendChild(U.el('div', { class: 'card-title' }, [
        '👥 الموظفون — نسبة الحافز والنقاط'
      ]));

      // Filter only employees WITH incentive (has_incentive = 1)
      const employeesWithIncentive = data.employees.filter((row) => row.employee.has_incentive === 1);

      const tableWrap = U.el('div', { class: 'table-wrap' });
      const table = U.el('table', { class: 'table' });
      table.innerHTML = `
        <thead><tr>
          <th>الموظف</th>
          <th>نسبة الحافز</th>
          <th>إجمالي النقاط</th>
        </tr></thead>
      `;
      const tbody = U.el('tbody');

      if (!employeesWithIncentive.length) {
        tbody.innerHTML = `<tr><td class="empty" colspan="3">لا يوجد موظفون ذوو حافز.</td></tr>`;
      } else {
        employeesWithIncentive.forEach((row) => {
          const tr = U.el('tr');
          const pct = row.incentive_percentage;
          const pctText = (pct * 100).toFixed(1).replace(/\.0$/, '') + '%';
          const pointsSign = row.points.total_points > 0 ? '+' : '';
          tr.innerHTML = `
            <td><strong>${escapeHtml(row.employee.name)}</strong>
                <div class="muted">${escapeHtml(row.employee.role || '')}</div></td>
            <td><span class="badge badge-info">${pctText}</span></td>
            <td><strong style="color:${row.points.total_points >= 0 ? '#059669' : '#dc2626'}">${pointsSign}${U.fmtNumber(row.points.total_points)} نقطة</strong></td>
          `;
          tbody.appendChild(tr);
        });
      }
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      sec3.appendChild(tableWrap);
      if (employeesWithIncentive.length > 0) {
        sec3.appendChild(U.el('div', {
          style: 'font-size:11px;color:#94a3b8;padding:10px 14px;border-top:1px solid #f3f4f6;'
        }, [`يظهر ${employeesWithIncentive.length} موظف ذا حافز من أصل ${data.employees.length} موظف`]));
      }
      U.makeCollapsible(sec3, true);
      body.appendChild(sec3);

      // ---- Section 4: Role Labels (Login Screen) ----
      const sec4 = U.el('div', { class: 'card' });
      sec4.appendChild(U.el('div', { class: 'card-title' }, ['🏷️ تسميات الأدوار في شاشة الدخول']));
      sec4.appendChild(U.el('div', { class: 'muted mb-4' }, [
        'تحكم في الكلمة التي تظهر بجانب اسم المدير والموظفين في قائمة الاختيار عند الدخول.'
      ]));

      const mgrLabelInp = U.el('input', {
        type: 'text', class: 'form-control',
        placeholder: 'مثال: مدير، رئيس، صاحب العمل',
        value: (data.settings && data.settings.manager_role_label) || 'مدير'
      });
      const empLabelInp = U.el('input', {
        type: 'text', class: 'form-control',
        placeholder: 'مثال: موظف، فريق، كادر',
        value: (data.settings && data.settings.employee_role_label) || 'موظف'
      });

      const grid4 = U.el('div', { class: 'form-grid' });
      grid4.appendChild(group('تسمية دور المدير', mgrLabelInp));
      grid4.appendChild(group('تسمية دور الموظف (احتياطي)', empLabelInp));
      sec4.appendChild(grid4);
      sec4.appendChild(U.el('div', { class: 'card-actions' }, [
        U.el('button', {
          class: 'btn',
          onclick: async () => {
            try {
              const ml = mgrLabelInp.value.trim();
              const el2 = empLabelInp.value.trim();
              if (!ml) { U.toast('تسمية دور المدير لا يمكن أن تكون فارغة', 'error'); return; }
              if (!el2) { U.toast('تسمية دور الموظف لا يمكن أن تكون فارغة', 'error'); return; }
              await API['settings:update']({ manager_role_label: ml, employee_role_label: el2 });
              U.toast('تم حفظ التسميات ✓', 'success');
            } catch (e) { U.toast(e.message, 'error'); }
          }
        }, ['💾 حفظ التسميات'])
      ]));
      U.makeCollapsible(sec4, true);
      body.appendChild(sec4);
    }

    refresh();
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

  window.ManagerIncentives = { render };
})();
