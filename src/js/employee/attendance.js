// Employee → Attendance section
(function () {
  async function render(root, { employeeId }) {
    root.innerHTML = '';

    root.appendChild(U.el('div', { class: 'page-header' }, [
      U.el('div', {}, [
        U.el('div', { class: 'page-title' }, ['الحضور والانصراف']),
        U.el('div', { class: 'page-subtitle' }, ['تسجيل الحضور والانصراف لكل فترة وإذن الخروج والمهمة الشهرية.'])
      ])
    ]));

    const stats = U.el('div', { class: 'stats-grid' });
    root.appendChild(stats);

    const shiftsCard = U.el('div', { class: 'card' });
    shiftsCard.appendChild(U.el('div', { class: 'card-title' }, ['تسجيل الفترات']));
    const shiftsRow = U.el('div', { class: 'card-row' });
    shiftsCard.appendChild(shiftsRow);
    U.makeCollapsible(shiftsCard, true);
    root.appendChild(shiftsCard);

    const exitCard = U.el('div', { class: 'card' });
    exitCard.appendChild(U.el('div', { class: 'card-title' }, ['🚪 تسجيل الخروج والدخول']));
    const exitBody = U.el('div');
    exitCard.appendChild(exitBody);
    U.makeCollapsible(exitCard, true);
    root.appendChild(exitCard);

    const corrCard = U.el('div', { class: 'card' });
    corrCard.appendChild(U.el('div', { class: 'card-title' }, ['📩 طلب تصحيح وقت']));
    const corrBody = U.el('div');
    corrCard.appendChild(corrBody);
    U.makeCollapsible(corrCard, false);
    root.appendChild(corrCard);

    const cleaningCard = U.el('div', { class: 'card' });
    cleaningCard.appendChild(U.el('div', { class: 'card-title' }, ['تسجيل المهمة اليومية']));
    const cleaningBody = U.el('div');
    cleaningCard.appendChild(cleaningBody);
    U.makeCollapsible(cleaningCard, false);
    root.appendChild(cleaningCard);

    const historyCard = U.el('div', { class: 'card' });
    historyCard.appendChild(U.el('div', { class: 'card-title' }, ['سجل الحضور (الكامل)']));
    const histBody = U.el('div');
    historyCard.appendChild(histBody);
    U.makeCollapsible(historyCard, false);
    root.appendChild(historyCard);

    const cleanHistCard = U.el('div', { class: 'card' });
    cleanHistCard.appendChild(U.el('div', { class: 'card-title' }, ['سجل المهام اليومية']));
    const cleanHistBody = U.el('div');
    cleanHistCard.appendChild(cleanHistBody);
    U.makeCollapsible(cleanHistCard, false);
    root.appendChild(cleanHistCard);

    async function refresh() {
      // ── الخطوة 1: احصل على الورديات المفتوحة وبيانات الموظف أولاً ──
      const [openShifts, empData] = await Promise.all([
        API['attendance:openShifts']({ employee_id: employeeId }).catch(() => []),
        API['employees:get']({ id: employeeId }).catch(() => null)
      ]);
      // ── الخطوة 2: حدد التاريخ الفعلي ──
      // لو في فترة مفتوحة → ابق على تاريخها (مش يقلب اليوم لحد ما تقفل الفترة)
      // لو مفيش فترة مفتوحة → todayISO بتقلب اليوم تلقائيًا بعد 3 فجرًا
      const effectiveDate = (openShifts && openShifts.length > 0) ? openShifts[0].date : U.todayISO();
      // ── الخطوة 3: احصل على سجلات التاريخ الفعلي ──
      const today = await API['attendance:today']({ employee_id: employeeId, date: effectiveDate });
      const scheduledCheckIn = empData && empData.check_in_time ? empData.check_in_time : null;
      const hasFixedCheckin = empData && empData.has_fixed_checkin === 1;
      renderShiftCards(shiftsRow, today, openShifts, refresh, employeeId, scheduledCheckIn, hasFixedCheckin, effectiveDate);
      renderStats(stats, today, openShifts, effectiveDate);
      renderExitPermission(exitBody, employeeId, refresh);
      renderCorrectionForm(corrBody, employeeId);
      renderCleaningForm(cleaningBody, employeeId, refresh);
      const history = await API['attendance:listByEmployee']({ employee_id: employeeId, limit: 100 });
      renderHistory(histBody, history);
      const cleanHist = await API['cleaning:listByEmployee']({ employee_id: employeeId, limit: 100 });
      renderCleaningHistory(cleanHistBody, cleanHist);
    }

    refresh();

    // ─── تحديث تلقائي كل 30 ثانية لرصد تسجيلات المدير ───
    let _lastShift1 = null;
    let _lastShift2 = null;

    async function pollManagerEntries() {
      // إذا الصفحة اتغيرت وال root اتشال من الـ DOM، أوقف الـ polling
      if (!root.isConnected) return;
      try {
        const openShifts = await API['attendance:openShifts']({ employee_id: employeeId }).catch(() => []);
        const effectiveDate = (openShifts && openShifts.length > 0) ? openShifts[0].date : U.todayISO();
        const today = await API['attendance:today']({ employee_id: employeeId, date: effectiveDate });
        const allRecs = [...today, ...openShifts.filter((o) => !today.find((t) => t.id === o.id))];
        const s1 = allRecs.find((t) => t.shift === 1);
        const s2 = allRecs.find((t) => t.shift === 2);

        // مقارنة بسيطة: لو تغيرت check_in أو check_out لأي فترة → refresh
        const sig1 = s1 ? (s1.check_in || '') + '|' + (s1.check_out || '') + '|' + (s1.source || '') : 'none';
        const sig2 = s2 ? (s2.check_in || '') + '|' + (s2.check_out || '') + '|' + (s2.source || '') : 'none';

        if (_lastShift1 === null && _lastShift2 === null) {
          // أول مرة — فقط احفظ الحالة
          _lastShift1 = sig1;
          _lastShift2 = sig2;
        } else if (sig1 !== _lastShift1 || sig2 !== _lastShift2) {
          _lastShift1 = sig1;
          _lastShift2 = sig2;
          // في تغيير → حدّث الواجهة
          await refresh();
        }
      } catch (_) {}
    }

    // ابدأ الـ polling بعد أول تحميل
    setTimeout(pollManagerEntries, 2000); // أول فحص بعد ثانيتين
    const _pollInterval = setInterval(async () => {
      if (!root.isConnected) { clearInterval(_pollInterval); return; }
      await pollManagerEntries();
    }, 30000); // كل 30 ثانية
    // ─────────────────────────────────────────────────────
  }

  // [إصلاح 1] renderStats تستخدم البيانات المدمجة (موظف + مدير)
  function renderStats(root, today, openShifts, effectiveDate) {
    root.innerHTML = '';
    let total = 0;
    const now = new Date();
    const allRecords = [...today, ...(openShifts || []).filter(o => !today.find(t => t.id === o.id))];
    [1, 2].forEach((s) => {
      const shiftRecs = allRecords.filter(t => t.shift === s);
      const mgrRec = shiftRecs.find(r => r.source === 'manager');
      const eRec   = shiftRecs.find(r => r.source !== 'manager');
      const combinedCI = (mgrRec && mgrRec.check_in)  ? mgrRec.check_in  : (eRec && eRec.check_in  ? eRec.check_in  : null);
      const combinedCO = (mgrRec && mgrRec.check_out) ? mgrRec.check_out : (eRec && eRec.check_out ? eRec.check_out : null);
      if (combinedCI && combinedCO) {
        // إصلاح 2: صيغة حساب الساعات الصحيحة (تعمل مع الورديات الليلية)
        const _a = new Date(combinedCI).getTime(), _b = new Date(combinedCO).getTime();
        const diffMs = (_b <= _a ? _b + 86400000 : _b) - _a;
        total += Math.max(0, diffMs) / 3600000;
      } else if (combinedCI && !combinedCO) {
        // فترة مفتوحة — أضف الوقت المنقضي منذ الحضور فقط إذا كان منطقياً
        const ciMs = new Date(combinedCI).getTime();
        if (!isNaN(ciMs)) {
          const elapsed = Math.max(0, now.getTime() - ciMs);
          total += Math.min(elapsed, 24 * 3600000) / 3600000;
        }
      }
    });
    root.appendChild(statCard('ساعات اليوم', U.fmtNumber(total) + ' س', 'neutral'));
    const completePeriods = [1, 2].filter(s => {
      const sr = allRecords.filter(t => t.shift === s);
      const mr = sr.find(r => r.source === 'manager'), er = sr.find(r => r.source !== 'manager');
      const ci = (mr && mr.check_in)  ? mr.check_in  : (er && er.check_in  ? er.check_in  : null);
      const co = (mr && mr.check_out) ? mr.check_out : (er && er.check_out ? er.check_out : null);
      return !!(ci && co);
    }).length;
    root.appendChild(statCard('الفترات المسجلة', String(completePeriods) + ' / 2', 'positive'));
    root.appendChild(statCard('التاريخ اليوم', U.fmtDate(effectiveDate || U.todayISO()), ''));
  }

  function statCard(label, value, cls) {
    return U.el('div', { class: 'stat-card' }, [
      U.el('div', { class: 'stat-label' }, [label]),
      U.el('div', { class: 'stat-value ' + cls }, [value])
    ]);
  }

  function renderShiftCards(root, today, openShifts, refresh, employeeId, scheduledCheckIn, hasFixedCheckin, effectiveDate) {
    root.innerHTML = '';

    // Get all records for today (including from openShifts that might be from previous days)
    const allRecords = [...today, ...(openShifts || []).filter(o => !today.find(t => t.id === o.id))];

    // Check ALL records for period 1 being truly open
    // Period 1 is open if: check_in exists AND check_out doesn't exist (from any source)
    const period1Records = allRecords.filter((t) => t.shift === 1);
    const period1HasCI = period1Records.some((t) => t.check_in);
    const period1HasCO = period1Records.some((t) => t.check_out);
    const period1IsOpen = period1HasCI && !period1HasCO;

    // Check for manager entries in period 1
    const period1ManagerRec = period1Records.find((t) => t.source === 'manager');
    const period1EmpRec = period1Records.find((t) => t.source !== 'manager');

    // Combined state for period 1
    const period1CombinedCI = period1ManagerRec && period1ManagerRec.check_in ? period1ManagerRec.check_in : (period1EmpRec && period1EmpRec.check_in ? period1EmpRec.check_in : null);
    const period1CombinedCO = period1ManagerRec && period1ManagerRec.check_out ? period1ManagerRec.check_out : (period1EmpRec && period1EmpRec.check_out ? period1EmpRec.check_out : null);
    const period1IsComplete = !!(period1CombinedCI && period1CombinedCO);

    [1, 2].forEach((shift) => {
      // Get all records for this shift (today + openShifts)
      const shiftRecords = allRecords.filter((t) => t.shift === shift);
      const todayRec  = today.find((t) => t.shift === shift) || {};
      const openPrev  = (openShifts || []).find((t) => t.shift === shift && !today.find(ot => ot.id === t.id));

      // Check if any record for this shift was entered by manager
      const hasManagerEntry = shiftRecords.some((r) => r.source === 'manager');
      const managerRec = shiftRecords.find((r) => r.source === 'manager');
      const empRec = shiftRecords.find((r) => r.source !== 'manager');

      // Combined state for this shift
      const combinedCI = managerRec && managerRec.check_in ? managerRec.check_in : (empRec && empRec.check_in ? empRec.check_in : null);
      const combinedCO = managerRec && managerRec.check_out ? managerRec.check_out : (empRec && empRec.check_out ? empRec.check_out : null);
      const isComplete = !!(combinedCI && combinedCO);

      const isOvernight = !!openPrev && !todayRec.check_in;

      const card = U.el('div', {
        class: 'shift-card' + (isOvernight ? ' shift-card-warning' : '')
      });

      card.appendChild(U.el('div', { class: 'shift-title' }, [
        'الفترة ' + (shift === 1 ? 'الأولى' : 'الثانية')
      ]));

      // لا يوجد blocking — الفترة الثانية متاحة دائماً بغض النظر عن الفترة الأولى

      if (isOvernight) {
        // فترة مفتوحة من يوم سابق — نعرض تحذير فقط بدون قفل
        card.appendChild(U.el('div', { class: 'shift-overnight-warn' }, [
          '⚠ فترة مفتوحة من ' + U.fmtDate(openPrev.date)
        ]));
      }

      // Normal state - only show late indicator for employees WITH fixed check-in
      let isLate = false;
      let lateMinutes = 0;
      // Only calculate late for employees with fixed check-in (has_fixed_checkin = 1)
      if (hasFixedCheckin && shift === 1 && combinedCI && scheduledCheckIn) {
        const ciDate = new Date(combinedCI);
        const [expH, expM] = scheduledCheckIn.split(':').map(Number);
        const expectedMs = expH * 60 * 60 * 1000 + expM * 60 * 1000;
        const actualMs   = ciDate.getHours() * 3600000 + ciDate.getMinutes() * 60000 + ciDate.getSeconds() * 1000;
        const lateMs = actualMs - expectedMs;
        isLate = lateMs > 10 * 60 * 1000;
        lateMinutes = Math.round(lateMs / 60000);
      }

      // Determine if employee has flexible hours
      const isFlexible = !hasFixedCheckin || !scheduledCheckIn;

      // Build check-in row
      const checkInStyle = isLate
        ? 'background:#fee2e2;border-radius:8px;padding:4px 8px;margin:2px 0;border:1px solid #fca5a5;'
        : isFlexible && combinedCI
          ? 'background:#f0fdf4;border-radius:8px;padding:4px 8px;margin:2px 0;border:1px solid #bbf7d0;'
          : '';

      const checkInRow = U.el('div', {
        class: 'time-row' + (isLate ? ' time-row-late' : ''),
        style: checkInStyle
      }, [
        U.el('span', {}, ['الحضور']),
        U.el('strong', { style: isLate ? 'color:#dc2626;' : '' }, [
          combinedCI ? U.fmtTime(combinedCI) : '—',
          ...(isLate ? [U.el('span', { style: 'font-size:10px;margin-right:4px;background:#dc2626;color:white;border-radius:4px;padding:1px 5px;' }, [`متأخر ${lateMinutes} د`])] : []),
          ...(isFlexible && combinedCI ? [U.el('span', { style: 'font-size:10px;margin-right:4px;background:#059669;color:white;border-radius:4px;padding:1px 5px;' }, ['وقت مرن'])] : [])
        ])
      ]);
      card.appendChild(checkInRow);
      card.appendChild(U.el('div', { class: 'time-row' }, [
        U.el('span', {}, ['الانصراف']),
        U.el('strong', {}, [combinedCO ? U.fmtTime(combinedCO) : '—'])
      ]));
      card.appendChild(U.el('div', { class: 'mt-3' }));

      const btnRow = U.el('div', { class: 'btn-row' });

      // منطق تقفيل الأزرار:
      // زر الحضور: يُقفل فقط لو المدير سجّل الحضور، أو الموظف سجّل بالفعل
      const managerLockedCI = !!(managerRec && managerRec.check_in);
      const empAlreadyCI    = !!(empRec && empRec.check_in);
      const ciDisabled = managerLockedCI || empAlreadyCI;

      // زر الانصراف: يُقفل فقط لو المدير سجّل الانصراف، أو الموظف سجّل الانصراف بالفعل
      // (لا يُقفل بسبب عدم الحضور أو اكتمال الفترة — الموظف يستطيع الانصراف متى شاء)
      const managerLockedCO = !!(managerRec && managerRec.check_out);
      const empAlreadyCO    = !!(empRec && empRec.check_out);
      const coDisabled = managerLockedCO || empAlreadyCO;

      if (hasManagerEntry) {
        const msg = isComplete
          ? '🔒 تم تسجيل الحضور والانصراف بواسطة المدير'
          : (managerRec && managerRec.check_in)
            ? '🔒 المدير سجّل حضورك — في انتظار الانصراف'
            : (managerRec && managerRec.check_out)
              ? '🔒 المدير سجّل انصرافك'
              : '📋 تم التسجيل بواسطة المدير';
        card.appendChild(U.el('div', {
          style: 'background:#e0f2fe;border:1px solid #bae6fd;border-radius:10px;padding:8px 14px;margin:8px 0;color:#0369a1;font-size:12px;font-weight:600;text-align:center;'
        }, [msg]));
      }

      const ciBtn = U.el('button', {
        class: 'btn btn-success',
        disabled: ciDisabled,
        style: ciDisabled ? 'opacity:0.45;cursor:not-allowed;' : '',
        onclick: async () => {
          if (ciDisabled) return;
          try {
            await API['attendance:checkIn']({ employee_id: employeeId, shift, ...(effectiveDate && effectiveDate !== U.todayISO() ? { date: effectiveDate } : {}) });
            U.toast('تم تسجيل الحضور', 'success');
            refresh();
          } catch (e) { U.toast(e.message, 'error'); }
        }
      }, [managerLockedCI ? '🔒 سجّله المدير' : empAlreadyCI ? '🔒 الحضور مسجل' : 'تسجيل الحضور']);

      const coBtn = U.el('button', {
        class: 'btn btn-warning',
        disabled: coDisabled,
        style: coDisabled ? 'opacity:0.45;cursor:not-allowed;' : '',
        onclick: async () => {
          if (coDisabled) return;
          try {
            await API['attendance:checkOut']({ employee_id: employeeId, shift });
            U.toast('تم تسجيل الانصراف', 'success');
            refresh();
          } catch (e) { U.toast(e.message, 'error'); }
        }
      }, [managerLockedCO ? '🔒 سجّله المدير' : empAlreadyCO || isComplete ? '🔒 الانصراف مسجل' : 'تسجيل الانصراف']);

      btnRow.appendChild(ciBtn);
      btnRow.appendChild(coBtn);

      card.appendChild(btnRow);
      root.appendChild(card);
    });
  }

  /* ---------- exit / return (actual, not request) ---------- */
  async function renderExitPermission(root, employeeId, refresh) {
    root.innerHTML = '';

    let todayPerms = [];
    try {
      const all = await API['exitPermissions:listByEmployee']({ employee_id: employeeId, limit: 50 });
      const today = U.todayISO();
      todayPerms = all.filter((p) => p.requested_at && p.requested_at.startsWith(today));
    } catch (_) {}

    const last = todayPerms[0] || null;
    const isOut = last && last.type === 'exit';

    const statusDiv = U.el('div', { class: 'exit-perm-status' });
    if (!last) {
      statusDiv.appendChild(U.el('span', { class: 'exit-badge exit-badge-idle' }, ['⬤ داخل العمل']));
    } else if (isOut) {
      statusDiv.appendChild(U.el('span', { class: 'exit-badge exit-badge-out' }, ['⬤ خارج منذ ' + U.fmtTime(last.requested_at)]));
    } else {
      statusDiv.appendChild(U.el('span', { class: 'exit-badge exit-badge-in' }, ['⬤ عاد ' + U.fmtTime(last.requested_at)]));
    }
    root.appendChild(statusDiv);

       // Notes input — only shown when exiting (required). Not shown for return.
      const notesInp = U.el('input', {
        type: 'text',
        class: 'form-control',
        placeholder: 'اكتب سبب الخروج ...',
        style: 'margin-bottom:4px; border-color:#fde68a;'
      });
      U.applyArabicInput(notesInp);

      if (!isOut) {
        const notesLabel = U.el('div', {
          style: 'font-size:12px;font-weight:700;margin-top:14px;margin-bottom:4px;color:#92400e;'
        }, ['✳ ملاحظة الخروج (إلزامي)']);
        const notesHint = U.el('div', {
          style: 'font-size:11.5px;color:#92400e;margin-bottom:10px;padding:4px 8px;background:#fef3c7;border-radius:6px;'
        }, ['⚠ أدخل سبب الخروج — الملاحظة إلزامية']);
        root.appendChild(notesLabel);
        root.appendChild(notesInp);
        root.appendChild(notesHint);
      }

      const btnRow = U.el('div', { class: 'btn-row mt-3' });

      const exitBtn = U.el('button', {
        class: 'btn exit-btn-out',
        disabled: isOut,
        onclick: async () => {
          if (!notesInp.value.trim()) {
            U.toast('الملاحظات إلزامية — اكتب سبب الخروج', 'error');
            notesInp.focus();
            return;
          }
          try {
            await API['exitPermissions:request']({
              employee_id: employeeId,
              type: 'exit',
              notes: notesInp.value.trim()
            });
            notesInp.value = '';
            U.toast('تم تسجيل الخروج', 'success');
            refresh();
          } catch (e) { U.toast(e.message, 'error'); }
        }
      }, ['🚪 خروج']);

      const returnBtn = U.el('button', {
        class: 'btn exit-btn-in',
        disabled: !isOut,
        onclick: async () => {
          try {
            await API['exitPermissions:request']({
              employee_id: employeeId,
              type: 'return',
              notes: ''
            });
            U.toast('تم تسجيل الدخول', 'success');
            refresh();
          } catch (e) { U.toast(e.message, 'error'); }
        }
      }, ['✅ دخول']);

    btnRow.appendChild(exitBtn);
    btnRow.appendChild(returnBtn);
    root.appendChild(btnRow);

    if (todayPerms.length) {
      const hist = U.el('div', { class: 'exit-perm-hist' });
      hist.appendChild(U.el('div', { class: 'exit-perm-hist-title' }, ['سجل اليوم']));
      todayPerms.slice(0, 8).forEach((p) => {
        const row = U.el('div', { class: 'exit-perm-hist-row' });
        row.appendChild(U.el('span', { class: p.type === 'exit' ? 'exit-hist-out' : 'exit-hist-in' },
          [p.type === 'exit' ? '🚪 خروج' : '✅ دخول']));
        row.appendChild(U.el('span', { class: 'exit-hist-time' }, [U.fmtTime(p.requested_at)]));
        const statusTxt = { pending: '⏳ بانتظار قرار المدير', deducted: '💸 تم الخصم', not_deducted: '✔ بدون خصم', noted: '📝 مُلاحَظ', approved: '✔', rejected: '✗' };
        row.appendChild(U.el('span', {
          style: 'font-size:11px;color:#6b7280;margin-right:6px;'
        }, [statusTxt[p.status] || p.status]));
        if (p.notes) {
          row.appendChild(U.el('span', {
            style: 'font-size:11.5px;color:#374151;margin-right:6px;font-style:italic;background:#f1f5f9;padding:1px 6px;border-radius:4px;'
          }, ['— ' + p.notes]));
        }
        hist.appendChild(row);
      });
      root.appendChild(hist);
    }
  }

  /* ---------- correction request form ---------- */
  async function renderCorrectionForm(root, employeeId) {
    root.innerHTML = '';

    root.appendChild(U.el('div', { class: 'att-section-label', style: 'margin-bottom:10px;' }, [
      '📩 إذا كان وقت حضورك أو انصرافك غير صحيح، أرسل طلب تصحيح للمدير ليقوم بمراجعته والموافقة عليه.'
    ]));

    // === Form ===
    const shiftSel = U.el('select', { class: 'form-control' }, [
      U.el('option', { value: '1' }, ['الفترة الأولى']),
      U.el('option', { value: '2' }, ['الفترة الثانية'])
    ]);

    const dateInp = U.el('input', { type: 'date', class: 'form-control', value: U.todayISO() });

    // now → HH:MM
    const nowTime = () => {
      const n = new Date();
      return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
    };

    const ciInp = U.el('input', {
      type: 'time', class: 'form-control',
      placeholder: 'وقت الحضور'
    });

    const coInp = U.el('input', {
      type: 'time', class: 'form-control',
      value: nowTime()
    });

    const notesInp = U.el('textarea', {
      class: 'form-control',
      placeholder: 'سبب طلب التصحيح (إلزامي)...',
      style: 'min-height:70px;resize:none;'
    });
    U.applyArabicInput(notesInp);

    const formEl = U.el('div');
    formEl.appendChild(group('الفترة', shiftSel));
    formEl.appendChild(group('التاريخ', dateInp));
    formEl.appendChild(group('وقت الحضور المطلوب (يدوي)', ciInp));
    formEl.appendChild(group('وقت الانصراف (تلقائي — عدّل إن احتجت)', coInp));
    formEl.appendChild(group('السبب / الملاحظات', notesInp));

    const sendBtn = U.el('button', {
      class: 'btn',
      style: 'width:100%;margin-top:10px;',
      onclick: async () => {
        const ci = ciInp.value.trim();
        const co = coInp.value.trim();
        const notes = notesInp.value.trim();
        const date = dateInp.value;
        if (!ci) { U.toast('وقت الحضور مطلوب', 'error'); ciInp.focus(); return; }
        if (!notes) { U.toast('السبب / الملاحظات إلزامية', 'error'); notesInp.focus(); return; }
        if (!date) { U.toast('التاريخ مطلوب', 'error'); return; }

        // Build full ISO strings using the selected date
        const ciISO = date + 'T' + ci + ':00';
        const coISO = co ? (date + 'T' + co + ':00') : null;

        try {
          sendBtn.disabled = true;
          sendBtn.textContent = '⏳ جاري الإرسال...';
          await API['correctionRequests:create']({
            employee_id: employeeId,
            shift: Number(shiftSel.value),
            date,
            requested_ci: ciISO,
            requested_co: coISO,
            notes
          });
          ciInp.value = '';
          coInp.value = nowTime();
          notesInp.value = '';
          sendBtn.disabled = false;
          sendBtn.textContent = '✅ تم الإرسال';
          setTimeout(() => { sendBtn.textContent = '📩 إرسال الطلب'; }, 2000);
          U.toast('تم إرسال طلب التصحيح للمدير', 'success');
          renderHistory();
        } catch (e) {
          sendBtn.disabled = false;
          sendBtn.textContent = '📩 إرسال الطلب';
          U.toast(e.message, 'error');
        }
      }
    }, ['📩 إرسال الطلب']);
    formEl.appendChild(sendBtn);
    root.appendChild(formEl);

    // === History ===
    const histDiv = U.el('div', { style: 'margin-top:18px;' });
    root.appendChild(histDiv);

    async function renderHistory() {
      histDiv.innerHTML = '';
      let rows = [];
      try { rows = await API['correctionRequests:listByEmployee']({ employee_id: employeeId }); } catch (_) {}
      if (!rows.length) return;

      histDiv.appendChild(U.el('div', { style: 'font-weight:700;font-size:13px;margin-bottom:8px;color:#374151;' }, ['سجل طلبات التصحيح']));
      const statusMap = {
        pending: { cls: 'badge-warning', text: '⏳ بانتظار المدير' },
        approved: { cls: 'badge-success', text: '✅ مقبول' },
        rejected: { cls: 'badge-danger',  text: '❌ مرفوض' }
      };
      rows.forEach((r) => {
        const sm = statusMap[r.status] || { cls: 'badge-gray', text: r.status };
        const item = U.el('div', {
          style: 'border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;margin-bottom:8px;background:#f9fafb;'
        });
        item.appendChild(U.el('div', { class: 'flex-between mb-2' }, [
          U.el('span', { class: 'badge ' + sm.cls }, [sm.text]),
          U.el('span', { class: 'muted' }, [U.fmtDateTime(r.created_at)])
        ]));
        item.appendChild(U.el('div', { style: 'font-size:12px;color:#374151;line-height:1.7;' }, [
          'الفترة: ' + (r.shift === 1 ? 'الأولى' : 'الثانية') + ' — التاريخ: ' + U.fmtDate(r.date)
        ]));
        item.appendChild(U.el('div', { style: 'font-size:12px;color:#374151;' }, [
          'الحضور المطلوب: ' + (r.requested_ci ? U.fmtTime(r.requested_ci) : '—') +
          ' | الانصراف المطلوب: ' + (r.requested_co ? U.fmtTime(r.requested_co) : '—')
        ]));
        if (r.notes) {
          item.appendChild(U.el('div', { style: 'font-size:11.5px;color:#6b7280;margin-top:4px;font-style:italic;' }, ['السبب: ' + r.notes]));
        }
        histDiv.appendChild(item);
      });
    }
    renderHistory();
  }

  /* ---------- cleaning / monthly task — text = done, no text = not done ---------- */
  function renderCleaningForm(root, employeeId, refresh) {
    root.innerHTML = '';

    root.appendChild(U.el('div', { class: 'att-section-label', style: 'margin-bottom:8px;' }, [
      '📝 اكتب ملاحظة أو وصف المهمة لتسجيلها كـ "تمت" — اتركها فارغة إذا لم تتم'
    ]));

    const notes = U.el('textarea', {
      class: 'form-control',
      placeholder: 'مثال: تم تنظيف الصيدلية وترتيب الأرفف...',
      style: 'min-height:80px;resize:none;'
    });
    U.applyArabicInput(notes);
    root.appendChild(notes);

    const saveBtn = U.el('button', {
      class: 'btn',
      style: 'width:100%;margin-top:12px;',
      onclick: async () => {
        const text = notes.value.trim();
        const status = text ? 'done' : 'none';
        try {
          saveBtn.disabled = true;
          saveBtn.textContent = '⏳ جاري الحفظ...';
          await API['cleaning:create']({ employee_id: employeeId, status, notes: text });
          notes.value = '';
          saveBtn.disabled = false;
          saveBtn.textContent = '✓ تم الحفظ';
          setTimeout(() => { saveBtn.textContent = '💾 حفظ'; }, 1600);
          U.toast(status === 'done' ? 'تم تسجيل المهمة ✅' : 'تم التسجيل — المهمة لم تتم ❌', status === 'done' ? 'success' : 'warning');
          refresh();
        } catch (e) {
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 حفظ';
          U.toast(e.message, 'error');
        }
      }
    }, ['💾 حفظ']);
    root.appendChild(saveBtn);
  }

  function group(label, control) {
    return U.el('div', { class: 'form-group' }, [
      U.el('label', { class: 'form-label' }, [label]),
      control
    ]);
  }

  function renderHistory(root, rows) {
    root.innerHTML = '';
    if (!rows.length) { root.innerHTML = '<div class="empty" style="padding:40px;text-align:center;color:#9ca3af;">لا يوجد سجل بعد</div>'; return; }
    const wrap = U.el('div', { class: 'table-wrap' });
    const tbl = U.el('table', { class: 'table' });
    const today = U.todayISO();

    // Group rows by date + shift to show single row per period
    // Merge employee and manager entries for same period
    const grouped = {};
    rows.forEach(r => {
      const key = r.date + '_' + r.shift;
      if (!grouped[key]) {
        grouped[key] = { ...r };
      } else {
        // Merge data: take whichever has check_in/check_out
        if (!grouped[key].check_in && r.check_in) grouped[key].check_in = r.check_in;
        if (!grouped[key].check_out && r.check_out) grouped[key].check_out = r.check_out;
        // Prefer manager source if either entry is from manager
        if (r.source === 'manager') grouped[key].source = 'manager';
      }
    });

    const groupedRows = Object.values(grouped).sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.shift - b.shift;
    });

    tbl.innerHTML = `
      <thead><tr>
        <th>التاريخ</th><th>الفترة</th><th>الحضور</th><th>الانصراف</th>
        <th>الساعات</th><th>المصدر</th>
      </tr></thead>
      <tbody>
        ${groupedRows.map((r) => {
          const isOpen = r.check_in && !r.check_out && r.date !== today;
          const hours = (r.check_in && r.check_out)
            ? ((() => { const _a=new Date(r.check_in).getTime(),_b=new Date(r.check_out).getTime(); return (_b<=_a?_b+86400000:_b)-_a; })() / 3600000).toFixed(2)
            : isOpen ? '<span style="color:#f59e0b">مفتوحة</span>' : '-';
          const src = r.source === 'manager'
            ? '<span class="badge badge-info">إدخال يدوي</span>'
            : '<span class="badge badge-gray">ذاتي</span>';
          return `<tr${isOpen ? ' style="opacity:.6"' : ''}>
            <td>${U.fmtDate(r.date)}</td>
            <td>${r.shift === 1 ? 'الأولى' : 'الثانية'}</td>
            <td>${r.check_in ? U.fmtTime(r.check_in) : '-'}</td>
            <td>${r.check_out ? U.fmtTime(r.check_out) : (isOpen ? '<span style="color:#f59e0b">—</span>' : '-')}</td>
            <td>${hours}</td>
            <td>${src}</td>
          </tr>`;
        }).join('')}
      </tbody>`;
    wrap.appendChild(tbl);
    root.appendChild(wrap);
  }

  function renderCleaningHistory(root, rows) {
    root.innerHTML = '';
    if (!rows.length) { root.innerHTML = '<div class="empty" style="padding:40px;text-align:center;color:#9ca3af;">لا يوجد سجل بعد</div>'; return; }
    const wrap = U.el('div', { class: 'table-wrap' });
    const tbl = U.el('table', { class: 'table' });
    tbl.innerHTML = `
      <thead><tr><th>التاريخ</th><th>الحالة</th><th>الملاحظات</th></tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${U.fmtDate(r.date)}</td>
            <td>${U.statusBadge(r.status)}</td>
            <td>${r.notes || '-'}</td>
          </tr>`).join('')}
      </tbody>`;
    wrap.appendChild(tbl);
    root.appendChild(wrap);
  }

  window.EmployeeAttendance = { render };
})();
