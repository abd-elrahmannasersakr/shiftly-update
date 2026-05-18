// Manager → Archive: browse any past month + manage automatic backups.
(function () {
  const AR_MONTHS = [
    'يناير','فبراير','مارس','أبريل','مايو','يونيو',
    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
  ];

  function buildMonths() {
    const now  = new Date();
    const list = [];
    for (let i = 0; i < 36; i++) {
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

  function fmtBytes(b) {
    if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(0) + ' KB';
    return b + ' B';
  }

  async function render(root) {
    root.innerHTML = '';

    root.appendChild(U.el('div', { class: 'page-header' }, [
      U.el('div', {}, [
        U.el('div', { class: 'page-title' }, ['🗂 الأرشيف والنسخ الاحتياطي']),
        U.el('div', { class: 'page-subtitle' }, [
          'استعراض بيانات أي شهر سابق — والنسخ الاحتياطية التلقائية يومياً.'
        ])
      ])
    ]));

    const months = buildMonths();
    let selectedYm = months[0].ym;

    // ── Month strip ──
    const stripWrap = U.el('div', { class: 'month-strip-wrap' });
    const strip     = U.el('div', { class: 'month-strip' });
    stripWrap.appendChild(strip);
    root.appendChild(stripWrap);

    // ── Archive content ──
    const archiveContent = U.el('div');
    root.appendChild(archiveContent);

    // ── Backup card (always visible below) ──
    const backupCard = U.el('div', { class: 'card' });
    backupCard.appendChild(U.el('div', { class: 'card-title' }, ['💾 النسخ الاحتياطية التلقائية']));

    // USB backup banner
    const usbBanner = U.el('div', { style: 'margin-bottom:14px;' });
    backupCard.appendChild(usbBanner);

    const backupBody = U.el('div');
    backupCard.appendChild(backupBody);
    U.makeCollapsible(backupCard, false);
    root.appendChild(backupCard);

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
      archiveContent.innerHTML =
        '<div class="muted" style="padding:24px;text-align:center;">⏳ جاري التحميل...</div>';
      try {
        const data = await API['archive:allEmployeesMonth']({ ym: selectedYm });
        renderMonth(archiveContent, data, selectedYm);
      } catch (e) {
        archiveContent.innerHTML =
          `<div class="muted" style="padding:24px;color:#dc2626;">${e.message}</div>`;
      }
    }

    async function loadBackups() {
      backupBody.innerHTML =
        '<div class="muted" style="padding:16px;">⏳ جاري التحميل...</div>';
      try {
        const list = await API['backup:list']();

        const headerRow = U.el('div', { class: 'flex-between mb-3' }, [
          U.el('div', {}, [
            U.el('span', { class: 'muted' }, [
              `${list.length} نسخة محفوظة — تلقائية يومياً (آخر 30 يوماً)`
            ])
          ]),
          U.el('button', {
            class: 'btn btn-sm btn-success',
            onclick: async () => {
              try {
                const r = await API['backup:run']();
                const usbMsg = r.usb && r.usb.ok ? ' — 💾 USB' : '';
                U.toast(`✅ تم إنشاء النسخة: ${r.filename} (${fmtBytes(r.sizeBytes)})${usbMsg}`, 'success');
                loadBackups();
                loadUsbStatus();
              } catch (e) { U.toast(e.message, 'error'); }
            }
          }, ['⬇ نسخة احتياطية الآن'])
        ]);
        backupBody.innerHTML = '';
        backupBody.appendChild(headerRow);

        if (!list.length) {
          backupBody.appendChild(U.el('div', { class: 'empty-row' }, [
            'لا توجد نسخ احتياطية بعد — ستُنشأ أول نسخة تلقائياً عند تشغيل التطبيق.'
          ]));
          return;
        }

        const wrap = U.el('div', { class: 'table-wrap' });
        const tbl  = U.el('table', { class: 'table' });
        tbl.innerHTML = `<thead><tr><th>اسم الملف</th><th>التاريخ / الوقت</th><th>الحجم</th><th></th></tr></thead>`;
        const tbody = U.el('tbody');
        list.forEach((b) => {
          const tr = U.el('tr');
          const dateDisplay = b.dateStr.replace('_', ' ').replace(/-/g, ':').slice(0, 16);
          tr.innerHTML = `
            <td><code style="font-size:12px;">${escHtml(b.filename)}</code></td>
            <td>${escHtml(dateDisplay)}</td>
            <td>${fmtBytes(b.sizeBytes)}</td>`;
          const td = U.el('td', { style: 'display:flex;gap:6px;align-items:center;' });
          td.appendChild(U.el('button', {
            class: 'btn btn-sm btn-success', title: 'استعادة هذه النسخة',
            onclick: () => U.confirmDialog(
              `⚠ استعادة النسخة "${b.filename}"؟\nسيتم استبدال البيانات الحالية بالكامل — هذا لا يمكن التراجع عنه.`,
              async () => {
                try {
                  await API['backup:restore']({ filename: b.filename });
                  U.toast('✅ تمت الاستعادة — البيانات محدّثة', 'success');
                } catch (e) { U.toast('خطأ: ' + e.message, 'error'); }
              }
            )
          }, ['↩ استعادة']));
          td.appendChild(U.el('button', {
            class: 'btn-icon danger', title: 'حذف هذه النسخة',
            onclick: () => U.confirmDialog(`حذف النسخة "${b.filename}"؟`, async () => {
              try {
                await API['backup:delete']({ filename: b.filename });
                U.toast('تم حذف النسخة', 'success');
                loadBackups();
              } catch (e) { U.toast(e.message, 'error'); }
            })
          }, ['🗑']));
          tr.appendChild(td);
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        wrap.appendChild(tbl);
        backupBody.appendChild(wrap);

        backupBody.appendChild(U.el('div', {
          style: 'margin-top:12px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;font-size:12px;color:#166534;'
        }, ['💡 تُنشأ نسخة احتياطية تلقائياً مرة واحدة يومياً عند تشغيل التطبيق، وتُحفظ آخر 30 نسخة فقط.']));
      } catch (e) {
        backupBody.innerHTML =
          `<div class="muted" style="padding:16px;color:#dc2626;">خطأ: ${e.message}</div>`;
      }
    }

    async function loadUsbStatus() {
      try {
        const res = await API['backup:usbStatus']();
        usbBanner.innerHTML = '';

        const enabled = !!res.enabled;

        const trackStyle = `width:44px;height:24px;border-radius:12px;position:relative;cursor:pointer;`
          + `background:${enabled ? '#3b82f6' : '#cbd5e1'};transition:background .2s;flex-shrink:0;`;
        const knobStyle = `width:18px;height:18px;border-radius:50%;background:#fff;position:absolute;top:3px;`
          + `left:${enabled ? '23px' : '3px'};transition:left .2s;`;

        const track = U.el('div', { style: trackStyle }, [
          U.el('div', { style: knobStyle }, [])
        ]);

        const statusLabel = U.el('span', {
          style: `font-size:12px;font-weight:600;color:${enabled ? '#1e40af' : '#64748b'};`
        }, [enabled ? 'مفعّل' : 'موقف']);

        let busy = false;
        track.addEventListener('click', async () => {
          if (busy) return;
          busy = true;
          const newVal = !enabled;
          try {
            await API['backup:setUsbEnabled']({ enabled: newVal });
            U.toast(newVal ? '✅ النسخ على USB مفعّل' : '🔕 تم إيقاف النسخ على USB', newVal ? 'success' : 'info');
            loadUsbStatus();
          } catch (e) { U.toast('خطأ: ' + e.message, 'error'); busy = false; }
        });

        const row = U.el('div', {
          style: 'display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;font-size:13px;'
            + (enabled
              ? 'background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;'
              : 'background:#f8fafc;border:1px solid #e2e8f0;color:#475569;')
        }, [
          U.el('span', { style: 'font-size:20px;' }, ['💾']),
          U.el('div', { style: 'flex:1;' }, [
            U.el('div', { style: 'font-weight:700;margin-bottom:2px;' }, ['نسخ احتياطي على USB']),
            U.el('div', { style: 'font-size:11px;' }, [
              res.drives.length
                ? `USB متصل: ${res.drives.map((d) => d.letter + (d.label ? ` (${d.label})` : '')).join('، ')}`
                : 'لا يوجد USB متصل حالياً — سيتم النسخ تلقائياً لما تتصل'
            ])
          ]),
          U.el('div', { style: 'display:flex;align-items:center;gap:8px;user-select:none;' }, [
            track,
            statusLabel
          ])
        ]);

        usbBanner.appendChild(row);
      } catch (_) {}
    }

    renderStrip();
    loadMonth();
    loadBackups();
    loadUsbStatus();
  }

  /* ── render monthly summary for all employees ── */
  function renderMonth(root, rows, ym) {
    root.innerHTML = '';
    const label = ymLabel(ym);

    root.appendChild(U.el('div', { class: 'rev-header' }, [
      U.el('div', { class: 'rev-header-eyebrow' }, ['أرشيف الشهر']),
      U.el('div', { class: 'rev-header-title' }, [label])
    ]));

    if (!rows.length) {
      root.appendChild(U.el('div', { class: 'card' }, [
        U.el('div', { class: 'empty-row' }, ['لا يوجد موظفون في قاعدة البيانات.'])
      ]));
      return;
    }

    // Stats totals
    const totHours = rows.reduce((s, r) => s + r.totalHours, 0);
    const totAdv   = rows.reduce((s, r) => s + r.totalAdvances, 0);
    const totRev   = rows.reduce((s, r) => s + r.totalRevenues, 0);
    const statsGrid = U.el('div', { class: 'stats-grid' });
    statsGrid.appendChild(stat('إجمالي ساعات الفريق', U.fmtNumber(totHours) + ' س', 'neutral'));
    statsGrid.appendChild(stat('إجمالي السلف', U.fmtMoney(totAdv) + ' ج.م', 'negative'));
    statsGrid.appendChild(stat('إجمالي الإيرادات', U.fmtMoney(totRev) + ' ج.م', 'positive'));
    statsGrid.appendChild(stat('عدد الموظفين', String(rows.length), 'neutral'));
    root.appendChild(statsGrid);

    // Summary table card
    const tableCard = U.el('div', { class: 'card' });
    tableCard.appendChild(U.el('div', { class: 'card-title' }, [
      U.el('span', {}, ['👥 ملخص الموظفين']),
      U.el('span', { class: 'card-subtitle-pill' }, [label])
    ]));
    tableCard.appendChild(buildSummaryTable(rows));
    U.makeCollapsible(tableCard, true);
    root.appendChild(tableCard);

    // Per-employee detail cards
    rows.forEach((row) => {
      const empCard = U.el('div', { class: 'card' });
      empCard.appendChild(U.el('div', { class: 'card-title' }, [
        U.el('span', {}, [`📄 ${row.employee.name}`]),
        U.el('span', { class: 'card-subtitle-pill' }, [label])
      ]));
      const detailBody = U.el('div');
      empCard.appendChild(detailBody);
      U.makeCollapsible(empCard, false);

      // Lazy-load details when opened
      let loaded = false;
      const title = empCard.querySelector('.card-title-collapsible');
      if (title) {
        title.addEventListener('click', async () => {
          if (loaded) return;
          loaded = true;
          detailBody.innerHTML =
            '<div class="muted" style="padding:16px;">⏳ جاري التحميل...</div>';
          try {
            const d = await API['archive:employeeMonth']({
              employee_id: row.employee.id, ym
            });
            renderEmployeeDetail(detailBody, d, row.employee);
          } catch (e) {
            detailBody.innerHTML =
              `<div class="muted" style="color:#dc2626;padding:12px;">${e.message}</div>`;
          }
        }, { once: false });
      }

      root.appendChild(empCard);
    });
  }

  function buildSummaryTable(rows) {
    const wrap = U.el('div', { class: 'table-wrap' });
    const tbl  = U.el('table', { class: 'table' });
    tbl.innerHTML = `
      <thead><tr>
        <th>الموظف</th><th>الساعات</th><th>السلف</th><th>الإيرادات</th>
        <th>مكافآت</th><th>عقوبات</th>
      </tr></thead>
      <tbody>
        ${rows.map((r) => `<tr>
          <td><strong>${escHtml(r.employee.name)}</strong>
              ${r.employee.role ? `<div class="muted">${escHtml(r.employee.role)}</div>` : ''}</td>
          <td>${U.fmtNumber(r.totalHours)} س</td>
          <td style="color:#dc2626;">${U.fmtMoney(r.totalAdvances)} ج.م</td>
          <td style="color:#059669;">${U.fmtMoney(r.totalRevenues)} ج.م</td>
          <td style="color:#059669;">+${U.fmtNumber(r.bonusPoints)}</td>
          <td style="color:#dc2626;">−${U.fmtNumber(r.penaltyPoints)}</td>
        </tr>`).join('')}
      </tbody>`;
    wrap.appendChild(tbl);
    return wrap;
  }

  function renderEmployeeDetail(root, data, employee) {
    root.innerHTML = '';

    const mini = U.el('div', { class: 'stats-grid mb-3' });
    mini.appendChild(stat('الساعات', U.fmtNumber(data.totalHours) + ' س', 'neutral'));
    mini.appendChild(stat('السلف', U.fmtMoney(data.totalAdvances) + ' ج.م', 'negative'));
    mini.appendChild(stat('الإيرادات', U.fmtMoney(data.totalRevenues) + ' ج.م', 'positive'));
    root.appendChild(mini);

    // Advances
    if (data.advances.length) {
      root.appendChild(sectionTitle('السلف'));
      const wrap = U.el('div', { class: 'table-wrap mb-4' });
      const tbl  = U.el('table', { class: 'table' });
      tbl.innerHTML = `
        <thead><tr><th>التاريخ</th><th>المبلغ</th><th>الملاحظات</th></tr></thead>
        <tbody>${data.advances.map((r) => `<tr>
          <td>${U.fmtDate(r.date)}</td>
          <td style="color:#dc2626;">${U.fmtMoney(r.amount)} ج.م</td>
          <td>${r.notes || '—'}</td>
        </tr>`).join('')}</tbody>`;
      wrap.appendChild(tbl);
      root.appendChild(wrap);
    }
  }

  /* ---------- helpers ---------- */
  function stat(label, value, cls) {
    return U.el('div', { class: 'stat-card ' + cls }, [
      U.el('div', { class: 'stat-label' }, [label]),
      U.el('div', { class: 'stat-value ' + cls }, [value])
    ]);
  }

  function sectionTitle(text) {
    return U.el('div', {
      class: 'muted mb-2',
      style: 'font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin-top:12px;'
    }, [text]);
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

  window.ManagerArchive = { render };
})();
