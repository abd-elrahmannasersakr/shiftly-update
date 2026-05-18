// Manager dashboard tab: monthly revenues + attendance (with auto-save and today KPI).
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
  function firstDay(ym) { return `${ym}-01`; }
  function lastDay(ym) {
    const [y, m] = ym.split('-').map(Number);
    return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  }
  function getNextDay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  function getPrevDay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  /* ---------- localStorage ---------- */
  const PERIODS_KEY = (id, ym) => `salaryPeriods:${id}:${ym}`;
  const LEGACY_KEY  = (id)      => `salaryPeriods:${id}`;
  function loadJSON(key, fallback) {
    try { const r = localStorage.getItem(key); if (r) return JSON.parse(r); } catch (_) {}
    return fallback;
  }
  function saveJSON(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {} }

  /* ---------- main render ---------- */
  async function render(root, { employee, selectedYm }) {
    const ym = selectedYm || currentYm();
    root.innerHTML = '';

    const header = U.el('div', { class: 'rev-header' }, [
      U.el('div', { class: 'rev-header-eyebrow' }, ['الشهر المعروض']),
      U.el('div', { class: 'rev-header-title' }, [ymLabel(ym)])
    ]);
    root.appendChild(header);

    // Action buttons row - modern styled buttons that open modals
    const actionBtns = U.el('div', { class: 'action-buttons-row' });

    // Button 1: تسجيل الإيرادات
    const revenueBtn = U.el('button', {
      class: 'action-btn action-btn-revenue',
      onclick: () => openRevenueModal(employee, ym, () => refresh())
    }, [
      U.el('span', { class: 'action-btn-icon' }, ['💰']),
      U.el('span', { class: 'action-btn-text' }, ['تسجيل الإيرادات']),
      U.el('span', { class: 'action-btn-desc' }, ['إدخال كاش وآجل للفترتين'])
    ]);

    // Button 2: تسجيل حضور يدوي
    const attendanceBtn = U.el('button', {
      class: 'action-btn action-btn-attendance',
      onclick: () => openAttendanceModalSmart(employee, ym, () => refresh())
    }, [
      U.el('span', { class: 'action-btn-icon' }, ['✏️']),
      U.el('span', { class: 'action-btn-text' }, ['تسجيل حضور يدوي']),
      U.el('span', { class: 'action-btn-desc' }, ['تسجيل الحضور والانصراف'])
    ]);

    actionBtns.appendChild(revenueBtn);
    actionBtns.appendChild(attendanceBtn);
    root.appendChild(actionBtns);

    // Stats row
    const stats = U.el('div', { class: 'stats-grid' });
    root.appendChild(stats);

    // Today's attendance log (moved above revenue log) with date picker
    const todayLogCard = U.el('div', { class: 'card' });
    todayLogCard.appendChild(U.el('div', { class: 'card-title' }, ['📋 سجل الحضور اليومي']));

    const attDatePicker = U.el('input', {
      type: 'date',
      class: 'form-control',
      value: U.todayISO(),
      style: 'margin-bottom:10px;font-size:13px;'
    });
    todayLogCard.appendChild(attDatePicker);

    const todayLogBody = U.el('div');
    todayLogCard.appendChild(todayLogBody);
    U.makeCollapsible(todayLogCard, false);
    root.appendChild(todayLogCard);

    attDatePicker.addEventListener('change', () => {
      loadTodayLog(todayLogBody, employee.id, attDatePicker.value);
    });

    // Revenue log (below attendance log)
    const logCard = U.el('div', { class: 'card' });
    logCard.appendChild(U.el('div', { class: 'card-title' }, [
      U.el('span', {}, ['سجل إيرادات ' + ymLabel(ym)])
    ]));
    const logBody = U.el('div');
    logCard.appendChild(logBody);
    U.makeCollapsible(logCard, false);
    root.appendChild(logCard);

    async function refresh() {
      const all = await API['revenues:listByEmployee']({ employee_id: employee.id, limit: 1000 });
      const rows = all.filter((r) => r.date && r.date.startsWith(ym));
      renderStats(stats, rows);
      renderList(logBody, rows, refresh);
      await loadTodayLog(todayLogBody, employee.id, attDatePicker.value);
    }
    refresh();
  }

  /* ---------- Smart Attendance Modal (إصلاح 3+5: اختيار التاريخ + قفل الفترات المكتملة) ---------- */
  async function openAttendanceModalSmart(employee, ym, onSaved) {
    const monthMin = firstDay(ym);
    const monthMax = lastDay(ym);
    const today    = U.todayISO();
    const defDate  = (today >= monthMin && today <= monthMax) ? today : monthMax;

    // الحاوية الرئيسية للمودال (تبقى في الذاكرة عند التنقل)
    const selectorBody = U.el('div');

    // ── اختيار التاريخ ──
    const dateInput = U.el('input', {
      type: 'date', class: 'form-control',
      value: defDate, min: monthMin, max: monthMax,
      style: 'font-size:14px;font-weight:600;margin-bottom:4px;'
    });
    selectorBody.appendChild(U.el('div', { style: 'margin-bottom:16px;' }, [
      U.el('div', { style: 'font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;' }, ['📅 اختر التاريخ']),
      dateInput
    ]));

    // منطقة حالة الفترات — تتحدّث عند تغيير التاريخ
    const dynamicArea = U.el('div');
    selectorBody.appendChild(dynamicArea);

    async function loadForDate(selectedDate) {
      dynamicArea.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;font-size:13px;">⏳ جاري التحميل...</div>';

      let s1 = { ci: null, co: null, complete: false };
      let s2 = { ci: null, co: null, complete: false };

      try {
        const all = await API['attendance:listByEmployee']({ employee_id: employee.id, limit: 1000 });
        const dateRecs = all.filter(r => r.date === selectedDate);
        [1, 2].forEach(shift => {
          const recs = dateRecs.filter(r => r.shift === shift);
          const mr = recs.find(r => r.source === 'manager');
          const er = recs.find(r => r.source !== 'manager');
          const ci = (mr && mr.check_in)  ? mr.check_in  : (er && er.check_in  ? er.check_in  : null);
          const co = (mr && mr.check_out) ? mr.check_out : (er && er.check_out ? er.check_out : null);
          const d  = { ci, co, complete: !!(ci && co) };
          if (shift === 1) s1 = d; else s2 = d;
        });
      } catch (e) {
        dynamicArea.innerHTML = '<div style="color:#dc2626;padding:12px;">خطأ: ' + e.message + '</div>';
        return;
      }

      dynamicArea.innerHTML = '';

      // ملخص حالة كل فترة
      const qs = U.el('div', { style: 'display:flex;gap:10px;margin-bottom:16px;' });
      [{ shift: 1, d: s1 }, { shift: 2, d: s2 }].forEach(({ shift, d }) => {
        qs.appendChild(U.el('div', {
          style: 'flex:1;padding:8px 12px;border-radius:8px;text-align:center;background:' +
            (d.complete ? '#f0fdf4' : d.ci ? '#fef3c7' : '#f8fafc') +
            ';border:1px solid ' + (d.complete ? '#bbf7d0' : d.ci ? '#fcd34d' : '#e5e7eb') + ';'
        }, [
          U.el('div', { style: 'font-size:11px;font-weight:600;color:#6b7280;' }, ['الفترة ' + shift]),
          U.el('div', {
            style: 'font-size:13px;font-weight:700;color:' + (d.complete ? '#059669' : d.ci ? '#92400e' : '#6b7280') + ';'
          }, [d.complete ? '✅ مكتمل' : d.ci ? '🔓 جزئي' : '⬜ فارغ'])
        ]));
      });
      dynamicArea.appendChild(qs);

      // أزرار الفترات — [إصلاح 5] الفترة المكتملة مقفلة وتطلب تأكيداً
      const ps = U.el('div', { style: 'display:flex;gap:12px;margin-bottom:16px;' });
      [{ shift: 1, d: s1 }, { shift: 2, d: s2 }].forEach(({ shift, d }) => {
        const label = shift === 1 ? 'الأولى' : 'الثانية';
        const btn = U.el('button', {
          class: 'btn',
          style: [
            'flex:1;padding:14px;border-radius:12px;font-weight:700;font-size:15px;',
            'background:' + (d.complete ? '#f0fdf4' : '#fee2e2') + ';',
            'border:2px solid ' + (d.complete ? '#bbf7d0' : '#fca5a5') + ';',
            'color:' + (d.complete ? '#059669' : '#dc2626') + ';'
          ].join('')
        }, [d.complete ? '🔒 الفترة ' + label : 'الفترة ' + label]);

        btn.addEventListener('click', () => {
          if (d.complete) {
            U.confirmDialog('هذه الفترة مكتملة. هل تريد تعديلها؟', () =>
              selectPeriod(shift, selectedDate, d, () => loadForDate(selectedDate))
            );
          } else {
            selectPeriod(shift, selectedDate, d, () => loadForDate(selectedDate));
          }
        });
        ps.appendChild(btn);
      });
      dynamicArea.appendChild(ps);

      // تلميح
      let hint = '';
      if      (s1.ci && !s1.co)             hint = '⚠️ الفترة الأولى بانتظار الانصراف';
      else if (s2.ci && !s2.co)             hint = '⚠️ الفترة الثانية بانتظار الانصراف';
      else if (s1.complete && s2.complete)  hint = '✅ تم تسجيل جميع الفترات لهذا اليوم';
      else if (!s1.ci)                      hint = '📝 يمكنك تسجيل الحضور للفترة الأولى';

      if (hint) {
        dynamicArea.appendChild(U.el('div', {
          style: 'text-align:center;padding:10px;border-radius:8px;font-weight:600;margin-top:4px;' +
            'background:' + (hint.startsWith('✅') ? '#f0fdf4' : '#fef3c7') + ';' +
            'color:'      + (hint.startsWith('✅') ? '#059669' : '#92400e') + ';'
        }, [hint]));
      }
    }

    dateInput.addEventListener('change', () => loadForDate(dateInput.value));

    U.showModal({
      title: '📋 تسجيل الحضور اليدوي',
      body: selectorBody,
      footer: [U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إغلاق'])]
    });

    await loadForDate(defDate);

    // ─── مودال الفترة الفردية ───
    function selectPeriod(shift, selectedDate, data, onRefresh) {
      const mode = (!data.ci && !data.co) ? 'full'
        : (data.ci && !data.co) ? 'checkout'
        : (data.co && !data.ci) ? 'checkin'
        : 'full';

      const aTime = U.el('input', {
        type: 'time', class: 'form-control',
        value: mode === 'checkout' ? '17:00' : '09:00',
        style: 'font-size:18px;padding:12px;text-align:center;'
      });
      const aNotes = U.el('input', { type: 'text', class: 'form-control', placeholder: 'ملاحظات (اختياري)' });

      const coInput = (mode === 'full')
        ? U.el('input', { type: 'time', class: 'form-control', value: '17:00', style: 'font-size:18px;padding:12px;text-align:center;' })
        : null;

      const body = U.el('div');

      // Shift badge
      body.appendChild(U.el('div', {
        style: 'background:#eff6ff;border:2px solid #3b82f6;border-radius:12px;padding:12px 16px;margin-bottom:16px;text-align:center;'
      }, [
        U.el('span', { style: 'font-size:20px;margin-left:8px;' }, ['🔵']),
        U.el('span', { style: 'font-size:16px;font-weight:700;color:#1e40af;' }, [shift === 1 ? 'الفترة الأولى' : 'الفترة الثانية'])
      ]));

      // Static date display
      body.appendChild(U.el('div', { style: 'margin-bottom:16px;' }, [
        U.el('div', { style: 'font-size:12px;font-weight:600;color:#0f172a;margin-bottom:4px;' }, ['📅 التاريخ']),
        U.el('div', { style: 'padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;color:#059669;font-weight:600;' },
          [U.fmtDate(selectedDate)])
      ]));

      // Existing record info
      if (mode === 'checkout' && data.ci) {
        body.appendChild(U.el('div', { style: 'font-size:12px;color:#059669;margin-bottom:10px;padding:6px 10px;background:#f0fdf4;border-radius:6px;' },
          ['✅ الحضور مسجل: ' + U.fmtTime(data.ci)]));
      }
      if (mode === 'checkin' && data.co) {
        body.appendChild(U.el('div', { style: 'font-size:12px;color:#92400e;margin-bottom:10px;padding:6px 10px;background:#fef3c7;border-radius:6px;' },
          ['⏰ الانصراف مسجل: ' + U.fmtTime(data.co)]));
      }

      // Time input(s)
      const timeLabel = mode === 'checkout' ? '⏰ وقت الانصراف' : '⏰ وقت الحضور';
      body.appendChild(U.el('div', { class: 'form-group' }, [
        U.el('label', { class: 'form-label' }, [timeLabel]),
        aTime
      ]));
      if (mode === 'full' && coInput) {
        body.appendChild(U.el('div', { class: 'form-group' }, [
          U.el('label', { class: 'form-label' }, ['⏰ وقت الانصراف']),
          coInput
        ]));
      }

      body.appendChild(U.el('div', { class: 'form-group' }, [
        U.el('label', { class: 'form-label' }, ['📝 ملاحظات (اختياري)']),
        aNotes
      ]));

      function goBack() {
        U.showModal({
          title: '📋 تسجيل الحضور اليدوي',
          body: selectorBody,
          footer: [U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إغلاق'])]
        });
        loadForDate(dateInput.value);
      }

      const mTitle = mode === 'checkout'
        ? (shift === 1 ? '🔓 انصراف الفترة الأولى' : '🔓 انصراف الفترة الثانية')
        : mode === 'checkin'
          ? (shift === 1 ? '🔓 حضور الفترة الأولى'   : '🔓 حضور الفترة الثانية')
          : (shift === 1 ? '✏️ الفترة الأولى'          : '✏️ الفترة الثانية');

      U.showModal({
        title: mTitle,
        body: body,
        footer: [
          U.el('button', { class: 'btn btn-secondary', onclick: goBack }, ['← رجوع']),
          U.el('button', {
            class: 'btn',
            style: 'background:linear-gradient(135deg,#2563eb,#1d4ed8);',
            onclick: async () => {
              try {
                const tv = aTime.value;
                if (!tv) throw new Error('من فضلك أدخل الوقت');
                let checkIn, checkOut;
                if (mode === 'checkout') {
                  checkIn  = data.ci;
                  checkOut = selectedDate + 'T' + tv + ':00';
                } else if (mode === 'checkin') {
                  checkIn  = selectedDate + 'T' + tv + ':00';
                  checkOut = data.co;
                } else {
                  if (!coInput || !coInput.value) throw new Error('من فضلك أدخل وقت الانصراف');
                  checkIn  = selectedDate + 'T' + tv + ':00';
                  // overnight: if checkout <= checkin, advance checkout by one day
                  let coDate = selectedDate;
                  if (coInput.value <= tv) {
                    const d = new Date(selectedDate); d.setDate(d.getDate() + 1);
                    coDate = d.toISOString().slice(0, 10);
                  }
                  checkOut = coDate + 'T' + coInput.value + ':00';
                }
                if (!checkOut) throw new Error('وقت الانصراف مطلوب');
                await API['attendance:managerEntry']({
                  employee_id: employee.id, date: selectedDate,
                  shift: shift, check_in: checkIn, check_out: checkOut, notes: aNotes.value
                });
                U.toast('تم التسجيل بنجاح ✅', 'success');
                if (onRefresh) onRefresh();
                if (onSaved)   onSaved();
                goBack();
              } catch (e) { U.toast(e.message, 'error'); }
            }
          }, ['💾 حفظ'])
        ]
      });
    }
  }

  /* ---------- Revenue Modal (إصلاح 4: اختيار التاريخ) ---------- */
  function openRevenueModal(employee, ym, onSaved) {
    const monthMin = firstDay(ym);
    const monthMax = lastDay(ym);
    const todayISO = U.todayISO();
    let selectedDate = (todayISO >= monthMin && todayISO <= monthMax) ? todayISO : monthMax;

    const p1Cash   = U.el('input', { type: 'number', min: '0', step: '0.01', class: 'form-control', placeholder: '0.00' });
    const p1Credit = U.el('input', { type: 'number', min: '0', step: '0.01', class: 'form-control', placeholder: '0.00' });
    const p2Cash   = U.el('input', { type: 'number', min: '0', step: '0.01', class: 'form-control', placeholder: '0.00' });
    const p2Credit = U.el('input', { type: 'number', min: '0', step: '0.01', class: 'form-control', placeholder: '0.00' });
    const totalDisplay = U.el('div', { class: 'revenue-total-display' }, ['0.00 ج.م']);

    function updateTotal() {
      const t1 = (Number(p1Cash.value) || 0) + (Number(p1Credit.value) || 0);
      const t2 = (Number(p2Cash.value) || 0) + (Number(p2Credit.value) || 0);
      totalDisplay.textContent = U.fmtMoney(t1 + t2) + ' ج.م';
    }
    [p1Cash, p1Credit, p2Cash, p2Credit].forEach(inp => inp.addEventListener('input', updateTotal));

    // تحميل البيانات الموجودة للتاريخ المحدد
    function loadDataForDate(date) {
      API['revenues:listByEmployee']({ employee_id: employee.id, limit: 500 }).then((all) => {
        const existing = all.filter(r => r.date === date);
        const p1 = existing.find(r => r.shift === 1) || { cash: 0, credit: 0 };
        const p2 = existing.find(r => r.shift === 2) || { cash: 0, credit: 0 };
        p1Cash.value   = p1.cash   || '';
        p1Credit.value = p1.credit || '';
        p2Cash.value   = p2.cash   || '';
        p2Credit.value = p2.credit || '';
        updateTotal();
      }).catch(() => {});
    }

    const body = U.el('div');

    // اختيار التاريخ
    const revDateInput = U.el('input', {
      type: 'date', class: 'form-control',
      value: selectedDate, min: monthMin, max: monthMax,
      style: 'font-size:14px;font-weight:600;'
    });
    revDateInput.addEventListener('change', () => {
      selectedDate = revDateInput.value;
      loadDataForDate(selectedDate);
    });
    body.appendChild(U.el('div', { style: 'margin-bottom:16px;' }, [
      U.el('div', { style: 'font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;' }, ['📅 اختر التاريخ']),
      revDateInput
    ]));

    // الفترة الأولى
    body.appendChild(U.el('div', { style: 'background:#f8fafc;border-radius:12px;padding:14px;margin-bottom:12px;' }, [
      U.el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:10px;' }, [
        U.el('span', { style: 'width:28px;height:28px;border-radius:50%;background:var(--accent);color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;' }, ['1']),
        U.el('span', { style: 'font-weight:700;color:#0f172a;' }, ['الفترة الأولى'])
      ]),
      U.el('div', { class: 'form-grid' }, [
        U.el('div', { class: 'form-group' }, [U.el('label', { class: 'form-label' }, ['💵 كاش']), p1Cash]),
        U.el('div', { class: 'form-group' }, [U.el('label', { class: 'form-label' }, ['💳 آجل']), p1Credit])
      ])
    ]));

    // الفترة الثانية
    body.appendChild(U.el('div', { style: 'background:#f8fafc;border-radius:12px;padding:14px;margin-bottom:12px;' }, [
      U.el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:10px;' }, [
        U.el('span', { style: 'width:28px;height:28px;border-radius:50%;background:var(--accent);color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;' }, ['2']),
        U.el('span', { style: 'font-weight:700;color:#0f172a;' }, ['الفترة الثانية'])
      ]),
      U.el('div', { class: 'form-grid' }, [
        U.el('div', { class: 'form-group' }, [U.el('label', { class: 'form-label' }, ['💵 كاش']), p2Cash]),
        U.el('div', { class: 'form-group' }, [U.el('label', { class: 'form-label' }, ['💳 آجل']), p2Credit])
      ])
    ]));

    // الإجمالي
    body.appendChild(U.el('div', { style: 'background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:12px;padding:14px;text-align:center;border:1.5px solid var(--accent-border);' }, [
      U.el('div', { style: 'font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.4px;' }, ['الإجمالي']),
      U.el('div', { style: 'font-size:28px;font-weight:800;color:var(--accent);margin-top:4px;' }, [totalDisplay])
    ]));

    // تحميل البيانات الأولية
    loadDataForDate(selectedDate);

    U.showModal({
      title: '💰 تسجيل الإيرادات',
      body: body,
      footer: [
        U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إلغاء']),
        U.el('button', {
          class: 'btn btn-success',
          style: 'background:linear-gradient(135deg,#059669,#047857);',
          onclick: async () => {
            try {
              await Promise.all([
                API['revenues:create']({ employee_id: employee.id, cash: p1Cash.value, credit: p1Credit.value, shift: 1, date: selectedDate }),
                API['revenues:create']({ employee_id: employee.id, cash: p2Cash.value, credit: p2Credit.value, shift: 2, date: selectedDate })
              ]);
              if (onSaved) onSaved();
              U.toast('تم حفظ الإيرادات بنجاح ✅', 'success');
              U.closeModal();
            } catch (e) { U.toast(e.message, 'error'); }
          }
        }, ['💾 حفظ الإيرادات'])
      ]
    });
  }

  /* ---------- Attendance Modal ---------- */
  async function openAttendanceModal(employee, ym, onSaved) {
    const monthMin = firstDay(ym);
    const monthMax = lastDay(ym);
    const today = U.todayISO();
    const defDate = (today >= monthMin && today <= monthMax) ? today : monthMin;

    const aDate = U.el('input', { type: 'date', class: 'form-control', value: defDate, min: monthMin, max: monthMax });
    const aShift1 = U.el('input', { type: 'radio', name: 'att-shift', value: '1', checked: true });
    const aShift2 = U.el('input', { type: 'radio', name: 'att-shift', value: '2' });
    const aCheckIn = U.el('input', { type: 'time', class: 'form-control', value: '09:00' });
    const aCheckOut = U.el('input', { type: 'time', class: 'form-control', value: '17:00' });
    const aNotes = U.el('input', { type: 'text', class: 'form-control', placeholder: 'ملاحظات (اختياري)' });

    const body = U.el('div');

    // Date
    body.appendChild(U.el('div', { class: 'form-group' }, [
      U.el('label', { class: 'form-label' }, ['📅 التاريخ']),
      aDate
    ]));

    // Shift selector
    body.appendChild(U.el('div', { style: 'margin-bottom:12px;' }, [
      U.el('div', { class: 'att-section-label', style: 'margin-bottom:8px;' }, ['الفترة']),
      U.el('div', { class: 'att-shift-pills' }, [
        U.el('label', { class: 'att-shift-pill active', style: 'flex:1;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;', onclick: () => {
          aShift1.checked = true;
          document.querySelectorAll('.att-shift-pill').forEach((el, i) => el.classList.toggle('active', i === 0));
        }}, [aShift1, 'الفترة الأولى']),
        U.el('label', { class: 'att-shift-pill', style: 'flex:1;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;', onclick: () => {
          aShift2.checked = true;
          document.querySelectorAll('.att-shift-pill').forEach((el, i) => el.classList.toggle('active', i === 1));
        }}, [aShift2, 'الفترة الثانية'])
      ])
    ]));

    // Time inputs
    body.appendChild(U.el('div', { class: 'att-section-label', style: 'margin-bottom:8px;' }, ['الأوقات']));
    body.appendChild(U.el('div', { class: 'att-time-row' }, [
      U.el('div', { class: 'att-time-block att-time-in' }, [
        U.el('div', { class: 'att-time-label' }, ['وقت الحضور']),
        aCheckIn
      ]),
      U.el('div', { class: 'att-time-arrow' }, ['→']),
      U.el('div', { class: 'att-time-block att-time-out' }, [
        U.el('div', { class: 'att-time-label' }, ['وقت الانصراف']),
        aCheckOut
      ])
    ]));

    // Notes
    body.appendChild(U.el('div', { class: 'form-group', style: 'margin-top:12px;' }, [
      U.el('label', { class: 'form-label' }, ['ملاحظات']),
      aNotes
    ]));

    // Info note
    body.appendChild(U.el('div', { style: 'font-size:11.5px;color:#64748b;background:#f8fafc;padding:8px 12px;border-radius:8px;margin-top:12px;' }, [
      '💡 في حالة الحضور بعد الموعد المحدد، سيتم خصم نقاط التأخير تلقائياً للموظفين ذوي الدوام الثابت.'
    ]));

    U.showModal({
      title: '✏️ تسجيل حضور يدوي',
      body: body,
      footer: [
        U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إلغاء']),
        U.el('button', {
          class: 'btn',
          style: 'background:linear-gradient(135deg,#2563eb,#1d4ed8);',
          onclick: async () => {
            try {
              const shift = aShift1.checked ? 1 : 2;
              const ciMins = timeToMins(aCheckIn.value);
              const coMins = timeToMins(aCheckOut.value);
              if (ciMins === coMins) throw new Error('وقت الحضور والانصراف متطابقان');
              const overnight = coMins <= ciMins;
              const checkIn = `${defDate}T${aCheckIn.value}:00`;
              const coDate = overnight ? getNextDay(defDate) : defDate;
              const checkOut = `${coDate}T${aCheckOut.value}:00`;
              await API['attendance:managerEntry']({
                employee_id: employee.id,
                date: defDate,
                shift: shift,
                check_in: checkIn,
                check_out: checkOut,
                notes: aNotes.value
              });
              U.toast('تم تسجيل الحضور بنجاح', 'success');
              if (onSaved) onSaved();
              U.closeModal();
            } catch (e) { U.toast(e.message, 'error'); }
          }
        }, ['💾 حفظ'])
      ]
    });
  }

  function timeToMins(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  /* ---------- daily attendance log with edit/delete (date-selectable) ---------- */
  async function loadTodayLog(root, employeeId, selectedDate) {
    const dateStr = selectedDate || U.todayISO();
    root.innerHTML = '<div style="padding:8px;font-size:12px;color:#64748b;">جاري التحميل...</div>';
    try {
      const all     = await API['attendance:listByEmployee']({ employee_id: employeeId, limit: 2000 });
      const today   = all.filter((r) => r.date === dateStr);
      const openShifts = await API['attendance:openShifts']({ employee_id: employeeId }).catch(() => []);
      const prevOpen  = openShifts.filter((o) => o.date !== dateStr && !today.find((t) => t.id === o.id));
      const allRecs   = [...today, ...prevOpen];

      root.innerHTML = '';

      if (!allRecs.length) {
        root.innerHTML = '<div class="empty-row" style="padding:12px 0;">لا توجد سجلات حضور لهذا اليوم.</div>';
        return;
      }

      // Group by shift → one row per shift, merging check_in / check_out
      const byShift = {};
      allRecs.forEach((rec) => {
        const s = rec.shift;
        if (!byShift[s]) byShift[s] = { shift: s, check_in: null, check_out: null, ids: [], sources: [], notes: [], isPrevDay: false };
        if (rec.check_in  && !byShift[s].check_in)  byShift[s].check_in  = rec.check_in;
        if (rec.check_out && !byShift[s].check_out) byShift[s].check_out = rec.check_out;
        byShift[s].ids.push(rec.id);
        if (rec.source) byShift[s].sources.push(rec.source);
        if (rec.notes)  byShift[s].notes.push(rec.notes);
        if (prevOpen.includes(rec)) byShift[s].isPrevDay = true;
      });

      // helper: hours between two ISO strings (handles midnight cross)
      function _diffH(ci, co) {
        if (!ci || !co) return 0;
        let a = new Date(ci).getTime(), b = new Date(co).getTime();
        if (isNaN(a) || isNaN(b)) return 0;
        if (b <= a) b += 86400000;
        return (b - a) / 3600000;
      }

      const wrap = U.el('div', { class: 'table-wrap' });
      const tbl  = U.el('table', { class: 'table' });
      tbl.innerHTML = '<thead><tr><th>الفترة</th><th>الحضور</th><th>الانصراف</th><th>المدة</th><th>المصدر</th><th style="width:80px;"></th></tr></thead>';
      const tbody = U.el('tbody');

      let totalDayHours = 0;

      [1, 2].forEach((s) => {
        const g = byShift[s];
        if (!g) return;

        const shiftLabel = s === 1 ? 'الأولى' : 'الثانية';
        const isOpen = g.check_in && !g.check_out;
        const shiftHours = _diffH(g.check_in, g.check_out);
        totalDayHours += shiftHours;
        const tr = U.el('tr');

        tr.appendChild(U.el('td', {}, [
          U.el('span', { class: 'period-badge', style: 'font-size:11px;' }, [String(s)]),
          ' ' + shiftLabel + (g.isPrevDay ? U.el('span', { style: 'font-size:10px;color:#f59e0b;margin-right:4px;' }, [' (أمس)']) : '')
        ]));

        tr.appendChild(U.el('td', {}, [
          g.check_in ? U.fmtTime(g.check_in) : U.el('span', { class: 'muted' }, ['—'])
        ]));

        const coTd = U.el('td');
        if (g.check_out) {
          coTd.textContent = U.fmtTime(g.check_out);
        } else if (isOpen) {
          coTd.appendChild(U.el('span', { style: 'color:#f59e0b;font-weight:700;font-size:12px;' }, [g.isPrevDay ? 'مفتوحة من أمس' : 'داخل']));
        } else {
          coTd.appendChild(U.el('span', { class: 'muted' }, ['—']));
        }
        tr.appendChild(coTd);

        // Duration cell
        const durTd = U.el('td');
        if (shiftHours > 0) {
          const h = Math.floor(shiftHours);
          const m = Math.round((shiftHours - h) * 60);
          durTd.appendChild(U.el('span', { style: 'font-size:11px;color:#374151;font-weight:600;' },
            [h + 'س' + (m > 0 ? ' ' + m + 'د' : '')]));
        } else {
          durTd.appendChild(U.el('span', { class: 'muted' }, [isOpen ? '—' : '—']));
        }
        tr.appendChild(durTd);

        // Source: show both if mixed
        const uniqueSources = [...new Set(g.sources)];
        const srcLabel = uniqueSources.length > 1 ? 'مدير + ذاتي'
          : uniqueSources[0] === 'manager' ? 'مدير' : 'ذاتي';
        const srcBg    = uniqueSources.includes('manager') ? '#e0f2fe' : '#f0fdf4';
        const srcColor = uniqueSources.includes('manager') ? '#0369a1' : '#166534';
        tr.appendChild(U.el('td', {}, [
          U.el('span', { style: `font-size:11px;padding:2px 7px;border-radius:10px;background:${srcBg};color:${srcColor};` }, [srcLabel])
        ]));

        const actionsTd = U.el('td', { style: 'white-space:nowrap;' });
        // Edit opens the raw record (first id)
        const rawRec = allRecs.find((r) => r.id === g.ids[0]);
        if (rawRec) {
          actionsTd.appendChild(U.el('button', {
            class: 'btn-icon', title: 'تعديل', style: 'margin-left:4px;',
            onclick: () => openEditAttendanceModal(rawRec, () => loadTodayLog(root, employeeId, dateStr))
          }, ['✏']));
        }
        actionsTd.appendChild(U.el('button', {
          class: 'btn-icon danger', title: 'حذف',
          onclick: () => U.confirmDialog('حذف سجلات هذه الفترة؟', async () => {
            try {
              await Promise.all(g.ids.map((id) => API['attendance:delete']({ id })));
              U.toast('تم الحذف', 'success');
              loadTodayLog(root, employeeId, dateStr);
            } catch (e) { U.toast(e.message, 'error'); }
          })
        }, ['🗑']));
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
      });

      // Total hours footer row
      if (totalDayHours > 0) {
        const th = Math.floor(totalDayHours);
        const tm = Math.round((totalDayHours - th) * 60);
        const totalLabel = th + 'س' + (tm > 0 ? ' ' + tm + 'د' : '');
        const tfootTr = U.el('tr', { style: 'background:#f0f9ff;border-top:2px solid #bae6fd;' });
        tfootTr.appendChild(U.el('td', { colspan: '2', style: 'font-weight:700;font-size:12px;color:#0369a1;padding:6px 8px;' }, ['⏱ مجموع الساعات']));
        tfootTr.appendChild(U.el('td', { style: 'padding:6px 8px;' }, ['']));
        tfootTr.appendChild(U.el('td', { style: 'font-weight:700;font-size:13px;color:#0369a1;padding:6px 8px;' }, [totalLabel]));
        tfootTr.appendChild(U.el('td', { colspan: '2', style: 'padding:6px 8px;' }, ['']));
        tbody.appendChild(tfootTr);
      }

      tbl.appendChild(tbody);
      wrap.appendChild(tbl);
      root.appendChild(wrap);
    } catch (e) {
      root.innerHTML = `<div class="muted" style="padding:8px;font-size:12px;color:#dc2626;">خطأ: ${e.message}</div>`;
    }
  }

  /* ---------- edit attendance modal ---------- */
  function openEditAttendanceModal(rec, onRefresh) {
    const ciVal = rec.check_in  ? rec.check_in.slice(0, 16)  : '';
    const coVal = rec.check_out ? rec.check_out.slice(0, 16) : '';

    const checkInInp  = U.el('input', { type: 'datetime-local', class: 'form-control', value: ciVal });
    const checkOutInp = U.el('input', { type: 'datetime-local', class: 'form-control', value: coVal });
    const notesInp    = U.el('input', { type: 'text', class: 'form-control', placeholder: 'ملاحظات', value: rec.notes || '' });

    const form = U.el('div');
    form.appendChild(grp('وقت الحضور', checkInInp));
    form.appendChild(grp('وقت الانصراف', checkOutInp));
    form.appendChild(grp('ملاحظات (اختياري)', notesInp));
    form.appendChild(U.el('div', { style: 'font-size:12px;color:#64748b;margin-top:8px;' }, [
      'لتسجيل انصراف في اليوم التالي، اختر التاريخ التالي في حقل الانصراف مباشرةً.'
    ]));

    U.showModal({
      title: 'تعديل سجل الحضور',
      body: form,
      footer: [
        U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إلغاء']),
        U.el('button', {
          class: 'btn',
          onclick: async () => {
            try {
              const checkIn  = checkInInp.value  ? checkInInp.value  + ':00' : null;
              const checkOut = checkOutInp.value ? checkOutInp.value + ':00' : null;
              if (checkIn && checkOut && checkOut <= checkIn) throw new Error('وقت الانصراف يجب أن يكون بعد وقت الحضور');
              await API['attendance:update']({ id: rec.id, check_in: checkIn, check_out: checkOut, notes: notesInp.value });
              U.toast('تم تعديل السجل', 'success');
              U.closeModal();
              onRefresh();
            } catch (e) { U.toast(e.message, 'error'); }
          }
        }, ['حفظ التعديل'])
      ]
    });
  }

  /* ---------- periods card (saves to DB on input) ---------- */
  function buildPeriodsCard(employeeId, ym, onSaved) {
    const card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'card-title' }, [
      U.el('span', {}, ['إيراد الفترات (كاش + آجل)']),
      U.el('span', { class: 'card-subtitle-pill' }, [ymLabel(ym)])
    ]));

    const body = U.el('div');
    card.appendChild(body);

    // Load today's existing records for both shifts
    async function loadAndRender() {
      const today = U.todayISO();
      let existing = [];
      try {
        const all = await API['revenues:listByEmployee']({ employee_id: employeeId, limit: 500 });
        existing = all.filter((r) => r.date === today);
      } catch (_) {}

      const byShift = (s) => existing.find((r) => r.shift === s) || { cash: 0, credit: 0, notes: '' };
      renderPeriodsForm(body, employeeId, byShift(1), byShift(2), onSaved);
    }

    loadAndRender();
    return card;
  }

  function renderPeriodsForm(root, employeeId, init1, init2, onSaved) {
    root.innerHTML = '';
    const today = U.todayISO();

    const grid = U.el('div', { class: 'periods-grid' });
    const p1 = buildPeriod('الفترة الأولى', '1', { cash: init1.cash, credit: init1.credit }, onAutoSave);
    const p2 = buildPeriod('الفترة الثانية', '2', { cash: init2.cash, credit: init2.credit }, onAutoSave);
    grid.appendChild(p1.card);
    grid.appendChild(p2.card);
    root.appendChild(grid);

    const grandValue = U.el('div', { class: 'period-grand-value' }, ['0.00 ج.م']);
    const saveIndicator = U.el('div', {
      style: 'font-size:11px;color:#059669;opacity:0;transition:opacity .3s;margin-top:4px;'
    }, ['✓ تم الحفظ']);
    root.appendChild(U.el('div', { class: 'period-grand' }, [
      U.el('div', { class: 'period-grand-label' }, ['إجمالي الفترتين']),
      grandValue,
      saveIndicator
    ]));

    let saveTimer;
    function onAutoSave() {
      const t1 = (Number(p1.cash.value) || 0) + (Number(p1.credit.value) || 0);
      const t2 = (Number(p2.cash.value) || 0) + (Number(p2.credit.value) || 0);
      grandValue.textContent = U.fmtMoney(t1 + t2) + ' ج.م';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        try {
          await Promise.all([
            API['revenues:create']({ employee_id: employeeId, cash: p1.cash.value, credit: p1.credit.value, shift: 1, date: today }),
            API['revenues:create']({ employee_id: employeeId, cash: p2.cash.value, credit: p2.credit.value, shift: 2, date: today })
          ]);
          saveIndicator.style.opacity = '1';
          clearTimeout(saveIndicator._timer);
          saveIndicator._timer = setTimeout(() => { saveIndicator.style.opacity = '0'; }, 1500);
          if (onSaved) onSaved();
        } catch (_) {}
      }, 600);
    }

    onAutoSave();
  }

  function buildPeriod(title, badge, initial, onChange) {
    const cash = U.el('input', {
      type: 'number', min: '0', step: '0.01', class: 'form-control',
      placeholder: '0.00', value: initial.cash || ''
    });
    const credit = U.el('input', {
      type: 'number', min: '0', step: '0.01', class: 'form-control',
      placeholder: '0.00', value: initial.credit || ''
    });
    const total = U.el('input', {
      type: 'text', class: 'form-control period-total-input', readonly: true, value: '0.00'
    });
    function recalcTotal() {
      total.value = U.fmtMoney((Number(cash.value) || 0) + (Number(credit.value) || 0));
    }
    cash.addEventListener('input', () => { recalcTotal(); onChange(); });
    credit.addEventListener('input', () => { recalcTotal(); onChange(); });
    recalcTotal();

    const card = U.el('div', { class: 'period-card' }, [
      U.el('div', { class: 'period-header' }, [
        U.el('span', { class: 'period-badge' }, [badge]),
        U.el('span', { class: 'period-title' }, [title])
      ]),
      U.el('div', { class: 'period-body' }, [
        pField('كاش (Cash)',        cash),
        pField('آجل (Credit)',      credit),
        pField('الإجمالي (Total)', total, true)
      ])
    ]);
    return { card, cash, credit, total };
  }
  function pField(label, control, highlight) {
    return U.el('div', { class: 'period-field' + (highlight ? ' highlight' : '') }, [
      U.el('label', { class: 'period-label' }, [label]), control
    ]);
  }

  /* ---------- manual attendance entry card ---------- */
  async function buildAttendanceCard(employee, ym) {
    const monthMin = firstDay(ym);
    const monthMax = lastDay(ym);
    const today = U.todayISO();
    const defDate = (today >= monthMin && today <= monthMax) ? today : monthMin;

    const card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'card-title' }, [
      U.el('span', {}, ['إدخال حضور يدوي']),
      U.el('span', { class: 'card-subtitle-pill' }, [ymLabel(ym)])
    ]));

    const formWrap = U.el('div');
    card.appendChild(formWrap);

    // [إصلاح 5] buildForm: عرض الفترات المكتملة كمقفلة + تحديث تلقائي
    async function buildForm(selectedDate) {
      formWrap.innerHTML = '<div class="muted" style="padding:8px;font-size:12px;">جاري التحقق من السجلات...</div>';

      let openShiftsForDate = [];
      let completedShifts   = [];
      try {
        const all      = await API['attendance:listByEmployee']({ employee_id: employee.id, limit: 500 });
        const dateRecs = all.filter(r => r.date === selectedDate);
        function getShiftMerged(shift) {
          const recs = dateRecs.filter(r => r.shift === shift);
          const mr = recs.find(r => r.source === 'manager');
          const er = recs.find(r => r.source !== 'manager');
          const ci = (mr && mr.check_in)  ? mr.check_in  : (er && er.check_in  ? er.check_in  : null);
          const co = (mr && mr.check_out) ? mr.check_out : (er && er.check_out ? er.check_out : null);
          return { shift, ci, co, isOpen: !!(ci && !co), isComplete: !!(ci && co), baseRec: mr || er };
        }
        const sh1 = getShiftMerged(1);
        const sh2 = getShiftMerged(2);
        openShiftsForDate = [sh1, sh2].filter(d => d.isOpen)
          .map(d => ({ ...(d.baseRec || {}), shift: d.shift, check_in: d.ci, check_out: d.co }));
        completedShifts   = [sh1, sh2].filter(d => d.isComplete)
          .map(d => ({ shift: d.shift, ci: d.ci, co: d.co }));
      } catch (_) {}

      formWrap.innerHTML = '';

      const aDate = U.el('input', {
        type: 'date', class: 'form-control', value: selectedDate,
        min: monthMin, max: monthMax
      });
      aDate.addEventListener('change', () => buildForm(aDate.value));

      const dateRow = U.el('div', { class: 'form-grid', style: 'margin-bottom:12px;' });
      dateRow.appendChild(grp('التاريخ', aDate));
      formWrap.appendChild(dateRow);

      // عرض الفترات المكتملة كبطاقات مقفلة
      completedShifts.forEach(d => {
        const shiftName = d.shift === 1 ? 'الفترة الأولى' : 'الفترة الثانية';
        const lCard = U.el('div', { class: 'open-shift-card', style: 'background:#f0fdf4;border:2px solid #bbf7d0;margin-bottom:12px;' });
        lCard.appendChild(U.el('div', { class: 'open-shift-header' }, [
          U.el('div', { class: 'open-shift-badge' }, [String(d.shift)]),
          U.el('div', {}, [
            U.el('div', { class: 'open-shift-name' }, [shiftName + ' ✅ مكتملة — مقفلة']),
            U.el('div', { class: 'open-shift-ci' }, ['حضور: ' + U.fmtTime(d.ci) + '  |  انصراف: ' + U.fmtTime(d.co)])
          ])
        ]));
        formWrap.appendChild(lCard);
      });

      // لو كل الفترتين مكتملتين → لا حاجة لأي إدخال إضافي
      if (completedShifts.length >= 2) {
        formWrap.appendChild(U.el('div', {
          style: 'text-align:center;padding:16px;background:#f0fdf4;border-radius:10px;color:#059669;font-weight:700;margin-top:8px;'
        }, ['✅ تم تسجيل جميع الفترات لهذا التاريخ']));
        return;
      }

      if (openShiftsForDate.length > 0) {
        const openNotice = U.el('div', {
          style: 'padding:10px 14px;background:#fef3c7;border:1px solid #fde68a;border-radius:10px;font-size:13px;color:#92400e;margin-bottom:12px;'
        }, [`توجد ${openShiftsForDate.length} فترة مفتوحة في هذا التاريخ — أدخل وقت الانصراف فقط`]);
        formWrap.appendChild(openNotice);

        openShiftsForDate.forEach((openRec) => {
          const shiftName = openRec.shift === 1 ? 'الفترة الأولى' : 'الفترة الثانية';
          const subCard = U.el('div', { class: 'open-shift-card' });

          const shiftHeader = U.el('div', { class: 'open-shift-header' }, [
            U.el('div', { class: 'open-shift-badge' }, [openRec.shift === 1 ? '1' : '2']),
            U.el('div', {}, [
              U.el('div', { class: 'open-shift-name' }, [shiftName]),
              U.el('div', { class: 'open-shift-ci' }, ['حضور: ' + U.fmtTime(openRec.check_in)])
            ])
          ]);
          subCard.appendChild(shiftHeader);

          const nextDayChk = U.el('input', { type: 'checkbox' });
          subCard.appendChild(U.el('label', {
            style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;font-size:13px;color:#1e40af;background:#eff6ff;padding:6px 10px;border-radius:8px;'
          }, [nextDayChk, 'الانصراف في اليوم التالي (عبر منتصف الليل)']));

          const coTime = U.el('input', { type: 'time', class: 'att-time-input', value: '17:00', style:'width:100%;margin-bottom:8px;' });
          const coNotes = U.el('input', { type: 'text', class: 'form-control', placeholder: 'ملاحظات (اختياري)', style:'margin-bottom:10px;' });
          subCard.appendChild(U.el('div', { class: 'att-time-label', style:'margin-bottom:4px;' }, ['وقت الانصراف']));
          subCard.appendChild(coTime);
          subCard.appendChild(U.el('div', { class: 'att-section-label', style:'margin-bottom:4px;' }, ['ملاحظات']));
          subCard.appendChild(coNotes);

          subCard.appendChild(U.el('button', {
            class: 'btn btn-success',
            style: 'width:100%;',
            onclick: async () => {
              try {
                if (!coTime.value) throw new Error('من فضلك أدخل وقت الانصراف');
                const coDate = nextDayChk.checked ? getNextDay(selectedDate) : selectedDate;
                const checkOut = `${coDate}T${coTime.value}:00`;
                if (!nextDayChk.checked && checkOut <= openRec.check_in) throw new Error('وقت الانصراف يجب أن يكون بعد وقت الحضور');
                await API['attendance:managerEntry']({
                  employee_id: employee.id,
                  date: selectedDate,
                  shift: openRec.shift,
                  check_in: openRec.check_in,
                  check_out: checkOut,
                  notes: coNotes.value
                });
                U.toast('تم تسجيل الانصراف', 'success');
                buildForm(selectedDate);
              } catch (e) { U.toast(e.message, 'error'); }
            }
          }, ['حفظ الانصراف']));

          formWrap.appendChild(subCard);
        });

        const addNewBtn = U.el('button', {
          class: 'btn btn-sm btn-secondary',
          style: 'margin-bottom:12px;',
          onclick: () => buildNewAttendanceForm(formWrap, employee, selectedDate, monthMin, monthMax)
        }, ['+ إضافة سجل حضور جديد']);
        formWrap.appendChild(addNewBtn);

      } else {
        buildNewAttendanceForm(formWrap, employee, selectedDate, monthMin, monthMax);
      }
    }

    buildForm(defDate);
    return card;
  }

  function buildNewAttendanceForm(container, employee, defDate, monthMin, monthMax) {
    const existing = container.querySelector('.new-att-form');
    if (existing) existing.remove();

    const wrap = U.el('div', { class: 'new-att-form' });

    // Shift selector
    let selectedShift = 1;
    const shiftPills = U.el('div', { class: 'att-shift-pills' });
    const pill1 = U.el('button', { class: 'att-shift-pill active', onclick: () => { selectedShift = 1; pill1.className='att-shift-pill active'; pill2.className='att-shift-pill'; } }, ['الفترة الأولى']);
    const pill2 = U.el('button', { class: 'att-shift-pill',        onclick: () => { selectedShift = 2; pill2.className='att-shift-pill active'; pill1.className='att-shift-pill'; } }, ['الفترة الثانية']);
    shiftPills.appendChild(pill1);
    shiftPills.appendChild(pill2);

    wrap.appendChild(U.el('div', { class: 'att-section-label' }, ['اختر الفترة']));
    wrap.appendChild(shiftPills);

    // Time row
    wrap.appendChild(U.el('div', { class: 'att-section-label', style: 'margin-top:14px;' }, ['أوقات الحضور والانصراف']));
    const timeRow = U.el('div', { class: 'att-time-row' });

    const aCheckIn  = U.el('input', { type: 'time', class: 'att-time-input', value: '09:00' });
    const aCheckOut = U.el('input', { type: 'time', class: 'att-time-input', value: '' });

    timeRow.appendChild(U.el('div', { class: 'att-time-block att-time-in' }, [
      U.el('div', { class: 'att-time-label' }, ['وقت الحضور']),
      aCheckIn
    ]));
    timeRow.appendChild(U.el('div', { class: 'att-time-arrow' }, ['←']));

    // Checkout toggle — يمكن تسجيل الحضور فقط بدون انصراف
    const coToggleId = 'co-toggle-' + Date.now();
    const coToggle = U.el('input', { type: 'checkbox', id: coToggleId });
    const coBlock = U.el('div', { class: 'att-time-block att-time-out' }, [
      U.el('div', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:4px;' }, [
        coToggle,
        U.el('label', { class: 'att-time-label', style: 'margin:0;cursor:pointer;', for: coToggleId }, ['وقت الانصراف (اختياري)'])
      ]),
      aCheckOut
    ]);
    aCheckOut.disabled = true;
    aCheckOut.style.opacity = '0.4';
    coToggle.addEventListener('change', () => {
      aCheckOut.disabled = !coToggle.checked;
      aCheckOut.style.opacity = coToggle.checked ? '1' : '0.4';
      if (coToggle.checked && !aCheckOut.value) aCheckOut.value = '17:00';
      updateDurationHint();
    });

    timeRow.appendChild(coBlock);
    wrap.appendChild(timeRow);

    // Smart duration hint — auto-detects overnight
    const durationHint = U.el('div', {
      style: 'font-size:12px;padding:6px 12px;border-radius:8px;margin-top:8px;margin-bottom:4px;display:none;'
    });
    wrap.appendChild(durationHint);

    function timeToMins(t) {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    }
    function updateDurationHint() {
      if (!aCheckIn.value || !coToggle.checked || !aCheckOut.value) { durationHint.style.display = 'none'; return; }
      const ciMins = timeToMins(aCheckIn.value);
      const coMins = timeToMins(aCheckOut.value);
      let diff, overnight;
      if (coMins > ciMins) {
        diff = coMins - ciMins;
        overnight = false;
      } else {
        diff = 1440 - ciMins + coMins;
        overnight = true;
      }
      const hrs  = Math.floor(diff / 60);
      const mins = diff % 60;
      const label = `${hrs > 0 ? hrs + ' س ' : ''}${mins > 0 ? mins + ' د' : ''}`.trim();
      durationHint.style.display = '';
      if (overnight) {
        durationHint.style.cssText += ';background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;';
        durationHint.textContent = `⏱ ${label} — الانصراف بعد منتصف الليل (اليوم التالي تلقائياً)`;
      } else {
        durationHint.style.cssText += ';background:#f0fdf4;color:#065f46;border:1px solid #bbf7d0;';
        durationHint.textContent = `⏱ ${label} — نفس اليوم`;
      }
    }
    aCheckIn.addEventListener('change', updateDurationHint);
    aCheckOut.addEventListener('change', updateDurationHint);
    updateDurationHint();

    // Notes
    wrap.appendChild(U.el('div', { class: 'att-section-label', style: 'margin-top:8px;' }, ['ملاحظات (اختياري)']));
    const aNotes = U.el('input', { type: 'text', class: 'form-control', placeholder: 'أي ملاحظات إضافية...' });
    wrap.appendChild(aNotes);

    // Save button
    const saveBtn = U.el('button', {
      class: 'btn att-save-btn',
      onclick: async () => {
        try {
          if (!aCheckIn.value) throw new Error('من فضلك أدخل وقت الحضور');

          const checkIn = `${defDate}T${aCheckIn.value}:00`;
          let checkOut = null;

          if (coToggle.checked) {
            if (!aCheckOut.value) throw new Error('من فضلك أدخل وقت الانصراف أو ألغِ تفعيله');
            const ciMins = timeToMins(aCheckIn.value);
            const coMins = timeToMins(aCheckOut.value);
            if (ciMins === coMins) throw new Error('وقت الحضور والانصراف متطابقان — لا يمكن تسجيل سجل بمدة صفر');
            const overnight = coMins <= ciMins;
            const coDate    = overnight ? getNextDay(defDate) : defDate;
            checkOut = `${coDate}T${aCheckOut.value}:00`;
          }

          saveBtn.disabled = true;
          saveBtn.textContent = 'جاري الحفظ...';
          await API['attendance:managerEntry']({
            employee_id: employee.id,
            date:      defDate,
            shift:     selectedShift,
            check_in:  checkIn,
            check_out: checkOut,
            notes:     aNotes.value
          });
          aNotes.value = '';
          saveBtn.disabled = false;
          saveBtn.textContent = 'تم الحفظ ✓';
          setTimeout(() => { saveBtn.textContent = 'حفظ الحضور'; }, 1800);
          U.toast(checkOut ? 'تم تسجيل الحضور والانصراف ✅' : 'تم تسجيل الحضور فقط ✅ (الانصراف لاحقاً)', 'success');
        } catch (e) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'حفظ الحضور';
          U.toast(e.message, 'error');
        }
      }
    }, ['حفظ الحضور']);
    wrap.appendChild(U.el('div', { style: 'margin-top:12px;' }, [saveBtn]));

    container.appendChild(wrap);
  }

  function grp(label, ctrl) {
    return U.el('div', { class: 'form-group' }, [
      U.el('label', { class: 'form-label' }, [label]), ctrl
    ]);
  }

  /* ---------- stats ---------- */
  function renderStats(root, rows) {
    root.innerHTML = '';
    const totalCash   = rows.reduce((s, r) => s + (Number(r.cash)   || 0), 0);
    const totalCredit = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0);
    const totalAll    = totalCash + totalCredit;
    root.appendChild(scard('إجمالي الكاش',     U.fmtMoney(totalCash)   + ' ج.م', 'neutral'));
    root.appendChild(scard('إجمالي الآجل',     U.fmtMoney(totalCredit) + ' ج.م', 'neutral'));
    root.appendChild(scard('إجمالي الإيرادات', U.fmtMoney(totalAll)    + ' ج.م', totalAll > 0 ? 'positive' : 'neutral'));
  }

  function scard(label, value, cls) {
    return U.el('div', { class: 'stat-card ' + cls }, [
      U.el('div', { class: 'stat-label' }, [label]),
      U.el('div', { class: 'stat-value ' + cls }, [value])
    ]);
  }

  /* ---------- revenue list ---------- */
  function renderList(root, rows, onRefresh) {
    root.innerHTML = '';
    if (!rows.length) {
      root.innerHTML = '<div class="empty-row">لا توجد سجلات إيرادات لهذا الشهر.</div>';
      return;
    }

    // Group by date → sum amount per day
    const byDate = {};
    rows.forEach((r) => {
      if (!byDate[r.date]) byDate[r.date] = { date: r.date, total: 0, ids: [] };
      byDate[r.date].total += Number(r.amount) || 0;
      byDate[r.date].ids.push(r.id);
    });
    const dailyRows = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));

    const wrap = U.el('div', { class: 'table-wrap' });
    const tbl  = U.el('table', { class: 'table' });
    tbl.innerHTML = '<thead><tr><th>التاريخ</th><th>إجمالي اليوم</th><th></th></tr></thead>';
    const tbody = U.el('tbody');
    dailyRows.forEach((d) => {
      const tr = U.el('tr');
      tr.innerHTML = `<td>${U.fmtDate(d.date)}</td><td><strong>${U.fmtMoney(d.total)} ج.م</strong></td>`;
      const td = U.el('td');
      td.appendChild(U.el('button', {
        class: 'btn-icon danger', title: 'حذف',
        onclick: () => U.confirmDialog('حذف سجلات هذا اليوم؟', async () => {
          try {
            await Promise.all(d.ids.map((id) => API['revenues:delete']({ id })));
            U.toast('تم الحذف', 'success');
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

  window.MgrTabRevenue = { render };
})();
