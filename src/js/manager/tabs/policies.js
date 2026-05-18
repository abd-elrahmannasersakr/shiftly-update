// Manager dashboard tab: assign policies to THIS employee.
// Uses `selectedYm` from dashboard to filter applied-policy history to that month.
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
  function defaultDateFor(ym) {
    const today = U.todayISO();
    return (today >= `${ym}-01` && today <= lastDay(ym)) ? today : `${ym}-01`;
  }
  function lastDay(ym) {
    const [y, m] = ym.split('-').map(Number);
    return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  }

  // Lock key per employee per month
  const LOCK_KEY = (empId, ym) => `policiesLocked:${empId}:${ym}`;
  function isLocked(empId, ym) { return localStorage.getItem(LOCK_KEY(empId, ym)) === '1'; }
  function setLocked(empId, ym, v) {
    if (v) localStorage.setItem(LOCK_KEY(empId, ym), '1');
    else localStorage.removeItem(LOCK_KEY(empId, ym));
  }

  async function render(root, { employee, selectedYm }) {
    const ym = selectedYm || currentYm();
    root.innerHTML = '';

    // Section header
    root.appendChild(U.el('div', { class: 'rev-header' }, [
      U.el('div', { class: 'rev-header-eyebrow' }, ['الشهر المعروض']),
      U.el('div', { class: 'rev-header-title' }, [ymLabel(ym)])
    ]));

    async function refresh() {
      const scrollEl = root.closest('.tab-content, .dashboard-content, [style*="overflow"]') || root.parentElement;
      const savedScroll = scrollEl ? scrollEl.scrollTop : 0;
      while (root.children.length > 1) root.removeChild(root.lastChild);

      const locked = isLocked(employee.id, ym);

      const [summary, allHistory, policies] = await Promise.all([
        API['employee:summary']({ employee_id: employee.id }),
        API['appliedPolicies:listByEmployee']({ employee_id: employee.id }),
        API['policies:list']()
      ]);

      const history = allHistory.filter((h) => h.date && h.date.startsWith(ym));

      // Header card
      const headerCard = U.el('div', { class: 'card' });
      headerCard.appendChild(U.el('div', { class: 'flex-between' }, [
        U.el('div', {}, [
          U.el('div', { class: 'card-title', style: 'border:none;padding:0;margin:0;' }, [
            'السياسات المطبّقة على ' + employee.name
          ]),
          U.el('div', { class: 'muted mt-2' }, [
            locked
              ? 'السياسات مقفلة لهذا الشهر — لا يمكن إجراء تغييرات.'
              : 'تختار سياسة جاهزة من القائمة وتطبقها مباشرة — لا توجد قيم يدوية.'
          ])
        ]),
        U.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;' }, [
          // Lock/unlock button
          U.el('button', {
            class: locked ? 'btn btn-warning' : 'btn btn-secondary',
            style: 'font-size:12px;',
            onclick: () => {
              if (locked) {
                U.confirmDialog('إلغاء قفل السياسات لهذا الشهر؟ سيتمكن المدير من إجراء تغييرات.', () => {
                  setLocked(employee.id, ym, false);
                  U.toast('تم فتح القفل', 'success');
                  refresh();
                });
              } else {
                U.confirmDialog('قفل السياسات لهذا الشهر؟ لن يمكن تعديلها بعد القفل إلا بإلغائه.', () => {
                  setLocked(employee.id, ym, true);
                  U.toast('تم قفل السياسات لهذا الشهر', 'success');
                  refresh();
                });
              }
            }
          }, [locked ? 'إلغاء القفل' : 'قفل السياسات']),
          U.el('button', {
            class: 'btn',
            onclick: () => !locked && openAssignModal(employee, policies, allHistory, ym, refresh),
            disabled: !policies.length || locked
          }, ['+ تطبيق سياسة على هذا الموظف']),
          U.el('button', {
            class: 'btn btn-danger',
            onclick: () => !locked && openDirectDeductionModal(employee, ym, refresh),
            disabled: locked
          }, ['خصم مباشر'])
        ])
      ]));

      if (locked) {
        headerCard.appendChild(U.el('div', {
          style: 'margin-top:10px;padding:8px 14px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;font-size:13px;color:#92400e;display:flex;align-items:center;gap:8px;'
        }, ['السياسات مقفلة لشهر ' + ymLabel(ym) + ' — اضغط "إلغاء القفل" لإجراء تعديلات']));
      }

      root.appendChild(headerCard);

      // Stats card
      const statsCard = U.el('div', { class: 'card' });
      statsCard.appendChild(U.el('div', { class: 'card-title' }, ['إحصائيات النقاط']));
      const total = summary.points.total_points;
      const statsGrid = U.el('div', { class: 'stats-grid' });
      statsGrid.appendChild(stat('إجمالي النقاط (كل الوقت)',
        (total >= 0 ? '+' : '') + U.fmtNumber(total),
        total >= 0 ? 'positive' : 'negative'));
      statsGrid.appendChild(stat('مكافآت الشهر',
        '+' + U.fmtNumber(history.filter((h) => h.type === 'bonus').reduce((s, h) => s + h.points, 0)),
        'positive'));
      statsGrid.appendChild(stat('عقوبات الشهر',
        '−' + U.fmtNumber(history.filter((h) => h.type !== 'bonus').reduce((s, h) => s + h.points, 0)),
        'negative'));
      statsGrid.appendChild(stat('سجلات الشهر', U.fmtNumber(history.length), 'neutral'));
      statsCard.appendChild(statsGrid);
      U.makeCollapsible(statsCard, true);
      root.appendChild(statsCard);

      if (!policies.length) {
        const empty = U.el('div', { class: 'card' });
        empty.appendChild(U.el('div', { class: 'empty-state', style: 'padding:24px;text-align:center;' }, [
          U.el('div', { class: 'muted' }, [
            'لا توجد سياسات حتى الآن. أنشئ السياسات أولاً من قائمة "السياسات" في الشريط الجانبي.'
          ])
        ]));
        root.appendChild(empty);
      }

      // History card
      const histCard = U.el('div', { class: 'card' });
      histCard.appendChild(U.el('div', { class: 'card-title' }, [
        U.el('span', {}, ['سجل السياسات المطبّقة']),
        U.el('span', { class: 'card-subtitle-pill' }, [ymLabel(ym)]),
        U.el('span', { class: 'muted' }, [`${history.length} سجل`])
      ]));

      const wrap = U.el('div', { class: 'table-wrap' });
      const table = U.el('table', { class: 'table' });
      table.innerHTML = `
        <thead><tr>
          <th>التاريخ</th><th>السياسة</th><th>النوع</th><th>النقاط</th><th>ملاحظات</th><th></th>
        </tr></thead>`;
      const tbody = U.el('tbody');
      if (!history.length) {
        tbody.innerHTML = `<tr><td class="empty" colspan="6" style="text-align:center;padding:32px;color:#94a3b8;">لا توجد سجلات لهذا الشهر.</td></tr>`;
      } else {
        history.forEach((h) => {
          const tr = U.el('tr');
          const sign  = h.type === 'bonus' ? '+' : '−';
          const color = h.type === 'bonus' ? '#059669' : '#dc2626';
          const badge = h.type === 'bonus'
            ? '<span class="badge badge-success">مكافأة</span>'
            : '<span class="badge badge-danger">عقوبة</span>';
          tr.innerHTML = `
            <td>${U.fmtDate(h.date)}</td>
            <td><strong>${escapeHtml(h.policy_name)}</strong></td>
            <td>${badge}</td>
            <td><strong style="color:${color}">${sign} ${U.fmtNumber(h.points)}</strong></td>
            <td>${escapeHtml(h.notes || '-')}</td>`;
          const td = U.el('td', { style: 'display:flex;gap:6px;' });
          if (!locked) {
            td.appendChild(U.el('button', {
              class: 'btn-icon', title: 'تعديل النقاط',
              onclick: () => openEditPointsModal(h, refresh)
            }, ['✏️']));
            td.appendChild(U.el('button', {
              class: 'btn-icon danger', title: 'حذف',
              onclick: () => U.confirmDialog('حذف هذا السجل؟', async () => {
                try { await API['appliedPolicies:delete']({ id: h.id }); U.toast('تم الحذف', 'success'); refresh(); }
                catch (e) { U.toast(e.message, 'error'); }
              })
            }, ['🗑']));
          } else {
            td.appendChild(U.el('span', { style: 'font-size:11px;color:#94a3b8;padding:4px 8px;' }, ['مقفل']));
          }
          tr.appendChild(td);
          tbody.appendChild(tr);
        });
      }
      table.appendChild(tbody);
      wrap.appendChild(table);
      histCard.appendChild(wrap);
      U.makeCollapsible(histCard, false);
      root.appendChild(histCard);
      if (scrollEl) requestAnimationFrame(() => { scrollEl.scrollTop = savedScroll; });
    }

    refresh();
  }

  function openAssignModal(employee, policies, allHistory, ym, refresh) {
    // ── Step 1: pick policies ──────────────────────────────────────────
    let step = 1;           // 1 = pick, 2 = review
    let selectedIds = [];   // array of policy ids chosen
    // shared ref so renderPolicyGrid (openAssignModal scope) can call updateFooter (renderPickStep scope)
    let _updateFooterRef = () => {};

    const modalRoot = U.el('div');

    function renderStep() {
      modalRoot.innerHTML = '';
      if (step === 1) renderPickStep();
      else            renderReviewStep();
    }

    // ── PICK STEP ─────────────────────────────────────────────────────
    function renderPickStep() {
      modalRoot.appendChild(U.el('div', { class: 'muted mb-3' }, [
        'اختر سياسة أو أكثر لتطبيقها على: ' + employee.name
      ]));

      const container = U.el('div', { style: 'border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;' });

      // Search field — fixed at top, always visible
      const searchInp = U.el('input', {
        id: 'assign-policy-search',
        type: 'text',
        class: 'form-control',
        placeholder: '🔍 ابحث عن سياسة...',
        style: 'border-radius:0;border:none;border-bottom:1px solid #e5e7eb;',
        oninput: () => renderPolicyGrid(searchInp.value.trim().toLowerCase())
      });
      U.applyArabicInput(searchInp);
      container.appendChild(searchInp);

      // Scrollable results area — rebuilt by renderPolicyGrid
      const resultsArea = U.el('div', { id: 'policy-results-area', style: 'max-height:320px;overflow-y:auto;padding:10px;' });
      container.appendChild(resultsArea);
      modalRoot.appendChild(container);

      const countBadge = U.el('div', {
        id: 'policy-count-badge',
        style: 'margin-top:12px;padding:10px 14px;background:#eff6ff;border-radius:10px;font-size:13px;color:#1d4ed8;display:none;'
      });
      modalRoot.appendChild(countBadge);

      function updateFooter() {
        U.updateModalFooter([
          U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إلغاء']),
          U.el('button', {
            class: 'btn btn-success',
            style: 'background:linear-gradient(135deg,#059669,#047857);',
            disabled: selectedIds.length === 0,
            onclick: () => { step = 2; renderStep(); }
          }, ['التالي ← ' + selectedIds.length + ' سياسة'])
        ]);
        updateCountBadge();
      }

      function updateCountBadge() {
        const badge = document.getElementById('policy-count-badge');
        if (!badge) return;
        if (selectedIds.length > 0) {
          badge.style.display = '';
          const names = selectedIds.map((id) => {
            const p = policies.find((x) => x.id === id);
            return p ? p.name : '';
          }).join('، ');
          badge.textContent = '✔ تم اختيار: ' + names;
        } else {
          badge.style.display = 'none';
        }
      }

      // expose updateFooter so renderPolicyGrid (outer scope) can call it
      _updateFooterRef = updateFooter;
      renderPolicyGrid('');
      updateFooter();
    }

    function buildPolicyCard(p, localSelectedIds, allPolicies, globalSelectedIds, searchInput, updateFooterFn, renderFn) {
      const checked = localSelectedIds.includes(p.id);
      const color   = p.type === 'bonus' ? '#059669' : '#dc2626';
      const bg      = checked ? (p.type === 'bonus' ? '#f0fdf4' : '#fef2f2') : '#fafafa';
      const borderColor = checked ? color : '#e5e7eb';

      const card = U.el('div', {
        style: `display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:12px;cursor:pointer;
                border:2px solid ${borderColor};background:${bg};
                transition:all .15s ease;
                ${checked ? 'box-shadow:0 2px 8px ' + color + '33;' : ''}`
      });

      const header = U.el('div', { style: 'display:flex;align-items:center;gap:8px;' });

      // Checkbox
      const chk = U.el('input', { type: 'checkbox', style: 'width:18px;height:18px;cursor:pointer;accent-color:' + color });
      chk.checked = checked;
      chk.onchange = () => {
        if (chk.checked) { if (!globalSelectedIds.includes(p.id)) globalSelectedIds.push(p.id); }
        else { globalSelectedIds = globalSelectedIds.filter((id) => id !== p.id); }
        renderPolicyGrid(searchInput.value.trim().toLowerCase());
        updateFooterFn();
      };

      // Policy name
      header.appendChild(chk);
      header.appendChild(U.el('div', {
        style: 'flex:1;font-weight:700;font-size:13px;line-height:1.4;color:#0f172a;'
      }, [p.name]));

      card.appendChild(header);

      // Points badge
      const ptsBadge = U.el('div', {
        style: `display:inline-flex;align-items:center;gap:4px;
                padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;
                background:${p.type === 'bonus' ? '#dcfce7' : '#fee2e2'};
                color:${p.type === 'bonus' ? '#15803d' : '#b91c1c'};`
      }, [
        U.el('span', {}, [p.type === 'bonus' ? '+' : '−']),
        U.el('span', {}, [fmtN(p.points) + ' نقطة'])
      ]);
      card.appendChild(ptsBadge);

      // Hover effect
      card.addEventListener('mouseenter', () => {
        if (!checked) {
          card.style.borderColor = color + '99';
          card.style.transform = 'translateY(-2px)';
          card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        }
      });
      card.addEventListener('mouseleave', () => {
        if (!checked) {
          card.style.borderColor = '#e5e7eb';
          card.style.transform = '';
          card.style.boxShadow = '';
        }
      });

      return card;
    }

    function renderPolicyGrid(q) {
      const resultsArea = document.getElementById('policy-results-area');
      if (!resultsArea) return;
      const liveSearch = document.getElementById('assign-policy-search') || { value: '' };

      // Always rebuild resultsArea from scratch to avoid stale DOM references
      resultsArea.innerHTML = '';

      const toShow = q
        ? policies.filter((p) => p.name.toLowerCase().includes(q))
        : null; // null = show all, grouped

      if (toShow !== null) {
        // Search mode
        if (!toShow.length) {
          resultsArea.innerHTML = '<div class="muted" style="padding:24px;text-align:center;color:#94a3b8;">لا توجد نتائج للبحث</div>';
          return;
        }
        const grid = U.el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;' });
        toShow.forEach((p) => {
          grid.appendChild(buildPolicyCard(p, selectedIds, policies, selectedIds, liveSearch, _updateFooterRef, renderPickStep));
        });
        resultsArea.appendChild(grid);
      } else {
        // Normal mode: render bonus section then penalty section
        if (bonusPolicies.length) {
          resultsArea.appendChild(U.el('div', {
            style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:0 2px;'
          }, [
            U.el('span', { style: 'font-size:14px;' }, ['🎁']),
            U.el('span', { style: 'font-size:12px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.4px;' }, ['المكافآت'])
          ]));
          const bonusGrid = U.el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;' });
          bonusPolicies.forEach((p) => {
            bonusGrid.appendChild(buildPolicyCard(p, selectedIds, policies, selectedIds, liveSearch, _updateFooterRef, renderPickStep));
          });
          resultsArea.appendChild(bonusGrid);
        }
        if (penaltyPolicies.length) {
          resultsArea.appendChild(U.el('div', {
            style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:0 2px;'
          }, [
            U.el('span', { style: 'font-size:14px;' }, ['⚠️']),
            U.el('span', { style: 'font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:.4px;' }, ['العقوبات'])
          ]));
          const penaltyGrid = U.el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;' });
          penaltyPolicies.forEach((p) => {
            penaltyGrid.appendChild(buildPolicyCard(p, selectedIds, policies, selectedIds, liveSearch, _updateFooterRef, renderPickStep));
          });
          resultsArea.appendChild(penaltyGrid);
        }
        if (!bonusPolicies.length && !penaltyPolicies.length) {
          resultsArea.innerHTML = '<div class="muted" style="padding:24px;text-align:center;color:#94a3b8;">لا توجد سياسات متاحة</div>';
        }
      }
    }

    const searchInp = modalRoot.querySelector('input[type="text"]') || { value: '' };
    const bonusPolicies = policies.filter((p) => p.type === 'bonus');
    const penaltyPolicies = policies.filter((p) => p.type !== 'bonus');

    // ── REVIEW STEP ───────────────────────────────────────────────────
    // One row per selected policy: date + notes + points (editable)
    let reviewRows = []; // { policy, date, notes, points }

    function renderReviewStep() {
      const defaultDate = defaultDateFor(ym);

      if (!reviewRows.length) {
        reviewRows = selectedIds.map((id) => {
          const p = policies.find((x) => x.id === id);
          return { policy: p, date: defaultDate, notes: '', points: p.points };
        });
      }

      modalRoot.appendChild(U.el('div', { class: 'muted mb-3' }, [
        'راجع تفاصيل كل سياسة قبل الحفظ'
      ]));

      reviewRows.forEach((row, i) => {
        const color = row.policy.type === 'bonus' ? '#059669' : '#dc2626';
        const card  = U.el('div', {
          style: `border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:10px;border-right:4px solid ${color};`
        });
        card.appendChild(U.el('div', { style: 'font-weight:700;font-size:14px;margin-bottom:8px;' }, [row.policy.name]));

        const grid = U.el('div', { class: 'form-grid' });

        // Date
        const dateInp = U.el('input', { type: 'date', class: 'form-control', value: row.date, min: `${ym}-01`, max: lastDay(ym) });
        dateInp.onchange = () => { reviewRows[i].date = dateInp.value; };
        grid.appendChild(group('التاريخ', dateInp));

        // Points
        const ptsInp = U.el('input', { type: 'number', class: 'form-control', value: String(row.points), min: '0.5', step: '0.5' });
        ptsInp.onchange = () => { reviewRows[i].points = Number(ptsInp.value) || row.policy.points; };
        grid.appendChild(group('النقاط', ptsInp));

        card.appendChild(grid);

        // Notes
        const notesInp = U.el('input', { type: 'text', class: 'form-control', placeholder: 'ملاحظات (اختياري)', value: row.notes });
        notesInp.oninput = () => { reviewRows[i].notes = notesInp.value; };
        card.appendChild(group('ملاحظات', notesInp));

        modalRoot.appendChild(card);
      });

      async function saveAll() {
        try {
          for (const row of reviewRows) {
            await API['appliedPolicies:apply']({
              employee_id: employee.id,
              policy_id:   row.policy.id,
              date:        row.date,
              notes:       row.notes,
              points:      row.points
            });
          }
          U.closeModal();
          U.toast('تم تطبيق ' + reviewRows.length + ' سياسة', 'success');
          refresh();
        } catch (e) { U.toast(e.message, 'error'); }
      }

      U.updateModalFooter([
        U.el('button', { class: 'btn btn-secondary', onclick: () => { reviewRows = []; step = 1; renderStep(); } }, ['← رجوع']),
        U.el('button', { class: 'btn', onclick: saveAll }, ['💾 حفظ الكل (' + reviewRows.length + ')'])
      ]);
    }

    U.showModal({
      title: '📋 تطبيق سياسات على ' + employee.name,
      body: modalRoot,
      footer: []   // will be set by renderStep()
    });

    renderStep();
  }

  function fmtN(n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 }); }

  function group(label, control) {
    return U.el('div', { class: 'form-group' }, [
      U.el('label', { class: 'form-label' }, [label]), control
    ]);
  }
  function stat(label, value, cls) {
    return U.el('div', { class: 'stat-card ' + cls }, [
      U.el('div', { class: 'stat-label' }, [label]),
      U.el('div', { class: 'stat-value ' + cls }, [value])
    ]);
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function openEditPointsModal(record, refresh) {
    const ptsInput = U.el('input', {
      type: 'number', min: '0.5', step: '0.5', class: 'form-control',
      value: String(record.points), placeholder: 'النقاط'
    });
    const notesInput = U.el('input', {
      type: 'text', class: 'form-control',
      value: record.notes || '', placeholder: 'ملاحظات (اختياري)'
    });
    const body = U.el('div');
    body.appendChild(U.el('div', { class: 'muted mb-3' }, [
      'تعديل: ' + escapeHtml(record.policy_name) + ' — ' + U.fmtDate(record.date)
    ]));
    body.appendChild(group('النقاط الجديدة *', ptsInput));
    body.appendChild(group('الملاحظات', notesInput));
    async function doSave() {
      const pts = Number(ptsInput.value);
      if (!pts || pts <= 0) { U.toast('يرجى إدخال عدد نقاط صحيح', 'error'); return; }
      try {
        await API['appliedPolicies:updatePoints']({ id: record.id, points: pts, notes: notesInput.value });
        U.closeModal(); U.toast('تم تعديل النقاط والملاحظات', 'success'); refresh();
      } catch (e) { U.toast(e.message, 'error'); }
    }
    U.showModal({
      title: 'تعديل نقاط السياسة المطبّقة',
      body,
      footer: [
        U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إلغاء']),
        U.el('button', { class: 'btn', onclick: doSave }, ['حفظ'])
      ]
    });
  }

  function openDirectDeductionModal(employee, ym, refresh) {
    const ptsInput  = U.el('input', { type: 'number', min: '0.5', step: '0.5', class: 'form-control', placeholder: 'مثال: 2' });
    const noteInput = U.el('input', { type: 'text',   class: 'form-control', placeholder: 'سبب الخصم (اختياري)' });
    const dateInput = U.el('input', { type: 'date',   class: 'form-control', value: defaultDateFor(ym), min: ym + '-01', max: lastDay(ym) });

    const body = U.el('div');
    body.appendChild(U.el('div', {
      style: 'padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;font-size:13px;color:#dc2626;margin-bottom:14px;'
    }, [
      U.el('strong', {}, ['خصم مباشر بالنقاط — ']), employee.name,
      U.el('div', { style: 'font-size:11px;margin-top:4px;color:#b91c1c;' }, [
        'النقاط تُحسم من رصيد الموظف مباشرةً وتظهر في سجل السياسات المطبّقة.'
      ])
    ]));
    body.appendChild(group('عدد النقاط المخصومة *', ptsInput));
    const grid = U.el('div', { class: 'form-grid' });
    grid.appendChild(group('التاريخ', dateInput));
    grid.appendChild(group('الملاحظات', noteInput));
    body.appendChild(grid);

    async function doSave() {
      const pts = Number(ptsInput.value);
      if (!pts || pts <= 0) { U.toast('يرجى إدخال عدد نقاط صحيح', 'error'); return; }
      try {
        await API['appliedPolicies:createDirect']({
          employee_id: employee.id,
          points: pts,
          date: dateInput.value,
          notes: noteInput.value
        });
        U.closeModal();
        U.toast(`تم خصم ${pts} نقطة من ${employee.name}`, 'success');
        refresh();
      } catch (e) { U.toast(e.message, 'error'); }
    }

    U.showModal({
      title: 'خصم مباشر بالنقاط — ' + employee.name,
      body,
      footer: [
        U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إلغاء']),
        U.el('button', { class: 'btn btn-danger', onclick: doSave }, ['تطبيق الخصم'])
      ]
    });
  }

  window.MgrTabPolicies = { render };
})();
