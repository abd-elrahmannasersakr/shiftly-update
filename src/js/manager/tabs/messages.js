// Manager dashboard tab: send messages, track read status, and review correction requests.
// Receives `selectedYm` from dashboard and filters the message list to that month.
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

  async function render(root, { employee, selectedYm }) {
    const ym = selectedYm || currentYm();
    root.innerHTML = '';

    // Section header
    root.appendChild(U.el('div', { class: 'rev-header' }, [
      U.el('div', { class: 'rev-header-eyebrow' }, ['الشهر المعروض']),
      U.el('div', { class: 'rev-header-title' }, [ymLabel(ym)])
    ]));

    // ── Correction Requests Card ──
    const corrCard = U.el('div', { class: 'card' });
    corrCard.appendChild(U.el('div', { class: 'card-title' }, [
      U.el('span', {}, ['📩 طلبات تصحيح الوقت']),
    ]));
    const corrBody = U.el('div');
    corrCard.appendChild(corrBody);
    U.makeCollapsible(corrCard, true);
    root.appendChild(corrCard);

    // ── Send message button ──
    const sendBtn = U.el('button', {
      class: 'action-btn action-btn-message',
      onclick: () => openSendMessageModal(employee, () => refreshMessages())
    }, [
      U.el('span', { class: 'action-btn-icon' }, ['✉️']),
      U.el('span', { class: 'action-btn-text' }, ['إرسال رسالة جديدة']),
      U.el('span', { class: 'action-btn-desc' }, ['تواصل مع الموظف'])
    ]);
    root.appendChild(sendBtn);

    // ── Sent messages history card ──
    const histCard = U.el('div', { class: 'card' });
    histCard.appendChild(U.el('div', { class: 'card-title' }, [
      U.el('span', {}, ['📨 الرسائل المرسلة']),
      U.el('span', { class: 'card-subtitle-pill' }, [ymLabel(ym)])
    ]));
    const histBody = U.el('div');
    histCard.appendChild(histBody);
    U.makeCollapsible(histCard, false);
    root.appendChild(histCard);

    async function refreshMessages() {
      const all = await API['messages:listByEmployee']({ employee_id: employee.id, limit: 500 });
      const rows = all.filter((r) => {
        const ts = r.created_at || r.date || '';
        return ts.startsWith(ym);
      });
      renderList(histBody, rows);
    }

    async function refreshCorrections() {
      let rows = [];
      try { rows = await API['correctionRequests:listByEmployeeId']({ employee_id: employee.id }); } catch (_) {}
      renderCorrectionRequests(corrBody, rows, refreshCorrections);
    }

    refreshMessages();
    refreshCorrections();
  }

  /* ---------- Correction Requests Section ---------- */
  function renderCorrectionRequests(root, rows, onRefresh) {
    root.innerHTML = '';

    const pending = rows.filter((r) => r.status === 'pending');
    const done    = rows.filter((r) => r.status !== 'pending');

    if (!rows.length) {
      root.innerHTML = '<div class="empty-row" style="padding:18px;text-align:center;color:#9ca3af;">لا توجد طلبات تصحيح</div>';
      return;
    }

    // Pending requests (editable)
    if (pending.length) {
      root.appendChild(U.el('div', { style: 'font-weight:700;font-size:13px;margin-bottom:10px;color:#92400e;' }, [
        '⏳ طلبات في الانتظار (' + pending.length + ')'
      ]));
      pending.forEach((r) => {
        root.appendChild(buildCorrectionCard(r, true, onRefresh));
      });
    }

    // Past requests (read-only)
    if (done.length) {
      root.appendChild(U.el('div', { style: 'font-weight:700;font-size:13px;margin:14px 0 8px;color:#374151;' }, [
        'السجل السابق'
      ]));
      done.forEach((r) => {
        root.appendChild(buildCorrectionCard(r, false, onRefresh));
      });
    }
  }

  function buildCorrectionCard(r, isPending, onRefresh) {
    const statusMap = {
      pending:  { cls: 'badge-warning', text: '⏳ بانتظار القرار' },
      approved: { cls: 'badge-success', text: '✅ مقبول' },
      rejected: { cls: 'badge-danger',  text: '❌ مرفوض' }
    };
    const sm = statusMap[r.status] || { cls: 'badge-gray', text: r.status };

    const card = U.el('div', {
      style: `border:1px solid ${isPending ? '#fde68a' : '#e5e7eb'};border-radius:12px;padding:14px;margin-bottom:12px;background:${isPending ? '#fffbeb' : '#f9fafb'};`
    });

    // Header row
    card.appendChild(U.el('div', { class: 'flex-between mb-2' }, [
      U.el('span', { class: 'badge ' + sm.cls }, [sm.text]),
      U.el('span', { class: 'muted' }, [U.fmtDateTime(r.created_at)])
    ]));

    // Info
    card.appendChild(U.el('div', { style: 'font-size:12.5px;color:#374151;margin-bottom:4px;' }, [
      'الفترة: ' + (r.shift === 1 ? 'الأولى' : 'الثانية') + '  |  التاريخ: ' + U.fmtDate(r.date)
    ]));
    card.appendChild(U.el('div', { style: 'font-size:12.5px;color:#374151;margin-bottom:4px;' }, [
      'الحضور المطلوب: ' + (r.requested_ci ? U.fmtTime(r.requested_ci) : '—') +
      '  |  الانصراف المطلوب: ' + (r.requested_co ? U.fmtTime(r.requested_co) : '—')
    ]));
    if (r.notes) {
      card.appendChild(U.el('div', { style: 'font-size:11.5px;color:#6b7280;font-style:italic;margin-bottom:8px;' }, [
        'السبب: ' + r.notes
      ]));
    }

    if (!isPending) return card;

    // Editable approval form
    const sep = U.el('div', { style: 'border-top:1px dashed #fbbf24;margin:10px 0 10px;' });
    card.appendChild(sep);
    card.appendChild(U.el('div', { style: 'font-size:12px;font-weight:700;color:#92400e;margin-bottom:8px;' }, [
      '✏ اضبط الأوقات إن لزم ثم وافق أو ارفض'
    ]));

    // Extract HH:MM from ISO strings
    function isoToTime(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d.getTime())) {
        // might be HH:MM:SS
        return iso.length >= 5 ? iso.slice(0, 5) : iso;
      }
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    const ciInp = U.el('input', {
      type: 'time', class: 'form-control',
      value: isoToTime(r.requested_ci),
      style: 'margin-bottom:0;'
    });
    const coInp = U.el('input', {
      type: 'time', class: 'form-control',
      value: isoToTime(r.requested_co),
      style: 'margin-bottom:0;'
    });

    const row = U.el('div', { style: 'display:flex;gap:10px;margin-bottom:12px;' }, [
      U.el('div', { style: 'flex:1;' }, [
        U.el('label', { class: 'form-label', style: 'font-size:11px;' }, ['وقت الحضور']),
        ciInp
      ]),
      U.el('div', { style: 'flex:1;' }, [
        U.el('label', { class: 'form-label', style: 'font-size:11px;' }, ['وقت الانصراف']),
        coInp
      ])
    ]);
    card.appendChild(row);

    const btnRow = U.el('div', { style: 'display:flex;gap:8px;' });

    const approveBtn = U.el('button', {
      class: 'btn btn-success',
      style: 'flex:1;',
      onclick: async () => {
        const ciVal = ciInp.value.trim();
        if (!ciVal) { U.toast('وقت الحضور مطلوب', 'error'); ciInp.focus(); return; }
        const ciISO = r.date + 'T' + ciVal + ':00';
        const coISO = coInp.value.trim() ? (r.date + 'T' + coInp.value.trim() + ':00') : null;
        try {
          approveBtn.disabled = true;
          approveBtn.textContent = '⏳...';
          await API['correctionRequests:apply']({ id: r.id, check_in: ciISO, check_out: coISO });
          U.toast('تمت الموافقة وتطبيق الوقت ✅', 'success');
          onRefresh && onRefresh();
        } catch (e) {
          approveBtn.disabled = false;
          approveBtn.textContent = '✅ موافقة وتطبيق';
          U.toast(e.message, 'error');
        }
      }
    }, ['✅ موافقة وتطبيق']);

    const rejectBtn = U.el('button', {
      class: 'btn btn-danger',
      style: 'flex:1;',
      onclick: async () => {
        try {
          rejectBtn.disabled = true;
          rejectBtn.textContent = '⏳...';
          await API['correctionRequests:reject']({ id: r.id });
          U.toast('تم رفض الطلب', 'warning');
          onRefresh && onRefresh();
        } catch (e) {
          rejectBtn.disabled = false;
          rejectBtn.textContent = '❌ رفض';
          U.toast(e.message, 'error');
        }
      }
    }, ['❌ رفض']);

    btnRow.appendChild(approveBtn);
    btnRow.appendChild(rejectBtn);
    card.appendChild(btnRow);

    return card;
  }

  /* ---------- Send Message Modal ---------- */
  function openSendMessageModal(employee, onSaved) {
    const bodyEl = U.el('textarea', {
      class: 'form-control',
      placeholder: 'اكتب رسالتك هنا...\n\n💡 يمكنك كتابة أي ملاحظة أو توجيه للموظف.',
      rows: '6',
      style: 'min-height:120px;resize:vertical;'
    });
    U.applyArabicInput(bodyEl);

    const body = U.el('div');
    body.appendChild(U.el('div', { style: 'background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#1e40af;' }, [
      U.el('strong', {}, ['إرسال إلى: ' + employee.name]),
      employee.role ? U.el('span', { style: 'color:#64748b;margin-right:6px;' }, [' (' + employee.role + ')']) : ''
    ]));
    body.appendChild(U.el('div', { class: 'form-group' }, [
      U.el('label', { class: 'form-label' }, ['نص الرسالة']),
      bodyEl
    ]));

    U.showModal({
      title: '✉️ إرسال رسالة جديدة',
      body: body,
      footer: [
        U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إلغاء']),
        U.el('button', {
          class: 'btn',
          style: 'background:linear-gradient(135deg,#2563eb,#1d4ed8);',
          onclick: async () => {
            if (!bodyEl.value.trim()) {
              U.toast('الرسالة فارغة', 'error');
              bodyEl.focus();
              return;
            }
            try {
              await API['messages:create']({ employee_id: employee.id, body: bodyEl.value });
              U.toast('تم إرسال الرسالة', 'success');
              bodyEl.value = '';
              if (onSaved) onSaved();
              U.closeModal();
            } catch (e) { U.toast(e.message, 'error'); }
          }
        }, ['✉️ إرسال'])
      ]
    });
  }

  function renderList(root, rows) {
    root.innerHTML = '';
    if (!rows.length) {
      root.innerHTML = '<div class="empty-row">لا توجد رسائل مرسلة في هذا الشهر.</div>';
      return;
    }
    const wrap = U.el('div', { class: 'table-wrap' });
    const tbl = U.el('table', { class: 'table' });
    tbl.innerHTML = `
      <thead><tr>
        <th>التاريخ</th><th>الرسالة</th><th>الحالة</th><th>وقت القراءة</th>
      </tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${U.fmtDateTime(r.created_at)}</td>
            <td style="max-width:400px;white-space:pre-wrap;">${escapeHtml(r.body)}</td>
            <td>${r.read ? '<span class="badge badge-success">مقروءة</span>' : '<span class="badge badge-warning">غير مقروءة</span>'}</td>
            <td>${r.read_at ? U.fmtDateTime(r.read_at) : '-'}</td>
          </tr>`).join('')}
      </tbody>`;
    wrap.appendChild(tbl);
    root.appendChild(wrap);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.MgrTabMessages = { render };
})();
