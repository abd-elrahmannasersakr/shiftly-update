// Shared helpers exposed via window.U
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Cache modal elements once DOM is ready
  let _backdrop, _modal;
  function getModalEls() {
    if (!_backdrop) _backdrop = document.getElementById('modalBackdrop');
    if (!_modal)    _modal    = document.getElementById('modal');
    return { backdrop: _backdrop, modal: _modal };
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== false && v !== null && v !== undefined) {
        node.setAttribute(k, v);
      }
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function fmtMoney(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }

  function fmtNumber(n, d = 2) {
    const v = Number(n) || 0;
    return v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }

  function fmtDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d.getTime())) return iso;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${day}/${m}/${y}`;
  }

  function fmtTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
  }

  function fmtDateTime(iso) {
    if (!iso) return '-';
    return `${fmtDate(iso)} - ${fmtTime(iso)}`;
  }

  function todayISO() {
    // قلب اليوم عند الساعة 3:00 فجرًا بالتوقيت المحلي
    // قبل 3 فجرًا نعامل الوقت كأنه لا يزال من اليوم السابق
    const now = new Date();
    if (now.getHours() < 3) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const y = yesterday.getFullYear();
      const m = String(yesterday.getMonth() + 1).padStart(2, '0');
      const d = String(yesterday.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  function thisMonthISO() { return new Date().toISOString().slice(0, 7); }

  function initials(name) {
    if (!name) return '؟';
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] || '') + (parts[1] ? parts[1][0] : '');
  }

  function toast(message, type = 'info') {
    const c = document.getElementById('toastContainer');
    const t = el('div', { class: `toast ${type}` }, [message]);
    c.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity .3s';
      setTimeout(() => t.remove(), 300);
    }, 2600);
  }

  // ── إصلاح مشكلة Enter: نتبع listener واحد فقط ونتحقق إن التركيز داخل المودال ──
  let _activeEnterKey = null;

  function showModal({ title, body, footer }) {
    const { backdrop, modal } = getModalEls();

    // أزل أي listener قديم قبل إضافة جديد
    if (_activeEnterKey) {
      document.removeEventListener('keydown', _activeEnterKey);
      _activeEnterKey = null;
    }

    modal.innerHTML = '';
    const header = el('div', { class: 'modal-header' }, [
      el('div', { class: 'modal-title' }, [title || '']),
      el('button', { class: 'modal-close', onclick: closeModal }, ['×'])
    ]);
    const bodyEl = el('div', { class: 'modal-body' });
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);

    modal.appendChild(header);
    modal.appendChild(bodyEl);

    if (footer) {
      const f = el('div', { class: 'modal-footer' });
      (Array.isArray(footer) ? footer : [footer]).forEach((b) => f.appendChild(b));
      modal.appendChild(f);
    }
    backdrop.classList.add('show');

    backdrop.onclick = (e) => {
      if (e.target === backdrop) closeModal();
    };

    // Enter key: فقط لو التركيز داخل المودال — هذا يمنع التدخل في صفحة الدخول
    function onEnterKey(e) {
      if (e.key !== 'Enter') return;

      // التحقق إن المودال ظاهر والتركيز داخله
      if (!backdrop.classList.contains('show')) return;
      const active = document.activeElement;
      if (!active || !modal.contains(active)) return;

      // Textarea: Enter stays as newline
      if (active.tagName === 'TEXTAREA') return;
      // Button inside modal: let it fire naturally
      if (active.tagName === 'BUTTON') return;

      // Collect all focusable fields inside the modal body (inputs, selects, textareas)
      const fields = Array.from(modal.querySelectorAll(
        'input:not([readonly]):not([disabled]), select:not([disabled]), textarea:not([readonly]):not([disabled])'
      )).filter((f) => f.offsetParent !== null); // only visible

      const idx = fields.indexOf(active);
      if (idx !== -1 && idx < fields.length - 1) {
        // There is a next field — move focus to it
        e.preventDefault();
        fields[idx + 1].focus();
        if (fields[idx + 1].select) fields[idx + 1].select();
        return;
      }

      // No next field (or active element not in list) — submit
      const footerEl = modal.querySelector('.modal-footer');
      if (!footerEl) return;
      const primary = footerEl.querySelector('.btn:not(.btn-secondary):not(.btn-danger)') ||
                      footerEl.querySelector('.btn:not(.btn-secondary)');
      if (primary && !primary.disabled) {
        e.preventDefault();
        primary.click();
      }
    }

    _activeEnterKey = onEnterKey;
    document.addEventListener('keydown', onEnterKey);

    backdrop._enterCleanup = () => {
      document.removeEventListener('keydown', onEnterKey);
      if (_activeEnterKey === onEnterKey) _activeEnterKey = null;
    };
  }

  function closeModal() {
    const { backdrop } = getModalEls();
    backdrop.classList.remove('show');
    if (backdrop._enterCleanup) {
      backdrop._enterCleanup();
      delete backdrop._enterCleanup;
    }
  }

  function updateModalFooter(buttons) {
    const { modal } = getModalEls();
    const footerEl = modal.querySelector('.modal-footer');
    if (!footerEl) return;
    footerEl.innerHTML = '';
    (buttons || []).forEach((b) => footerEl.appendChild(b));
  }

  function confirmDialog(message, onConfirm) {
    showModal({
      title: 'تأكيد',
      body: el('p', {}, [message]),
      footer: [
        el('button', { class: 'btn btn-secondary', onclick: closeModal }, ['إلغاء']),
        el('button', { class: 'btn btn-danger', onclick: () => { closeModal(); onConfirm && onConfirm(); } }, ['تأكيد'])
      ]
    });
  }

  function statusBadge(status) {
    const map = {
      done:    { cls: 'badge-success', text: 'تمت المهمة' },
      partial: { cls: 'badge-warning', text: 'مهمة جزئية' },
      none:    { cls: 'badge-danger',  text: 'لم تتم المهمة' }
    };
    const m = map[status] || { cls: 'badge-gray', text: status };
    return `<span class="badge ${m.cls}">${m.text}</span>`;
  }

  /**
   * Makes a .card element collapsible by clicking its .card-title.
   * All children after the first .card-title are wrapped in a toggle wrapper.
   * @param {HTMLElement} card - The card element to make collapsible
   * @param {boolean} defaultOpen - Whether the card starts expanded (default: true)
   */
  function makeCollapsible(card, defaultOpen = true) {
    const titleEl = card.querySelector(':scope > .card-title');
    if (!titleEl) return;

    // Arrow indicator
    const arrow = el('span', { class: 'card-collapse-arrow' }, [defaultOpen ? '▼' : '▶']);
    titleEl.appendChild(arrow);
    titleEl.classList.add('card-title-collapsible');

    // Wrap all children after the title
    const contentWrapper = el('div', { class: 'card-collapse-body' });
    if (!defaultOpen) contentWrapper.style.display = 'none';

    // Move siblings after titleEl into wrapper
    const siblings = [];
    let el2 = titleEl.nextElementSibling;
    while (el2) {
      siblings.push(el2);
      el2 = el2.nextElementSibling;
    }
    siblings.forEach((s) => contentWrapper.appendChild(s));
    card.appendChild(contentWrapper);

    let _open = defaultOpen;
    titleEl.addEventListener('click', () => {
      _open = !_open;
      contentWrapper.style.display = _open ? 'block' : 'none';
      arrow.textContent = _open ? '▼' : '▶';
      titleEl.classList.toggle('card-title-collapsed', !_open);
    });
  }

  // ─── تحويل تلقائي للعربية ───
  // خريطة الحروف الإنجليزية → العربية (لوحة مفاتيح QWERTY)
  const EN_TO_AR = {
    'q':'ض','w':'ص','e':'ث','r':'ق','t':'ف','y':'غ','u':'ع','i':'ه','o':'خ','p':'ح',
    'a':'ش','s':'س','d':'ي','f':'ب','g':'ل','h':'ا','j':'ت','k':'ن','l':'م',
    'z':'ئ','x':'ء','c':'ؤ','v':'ر','b':'ل','n':'ى','m':'ة',
    '[':'ج',']':'د','\\':'\\',';':'ك','\'':'ط',',':'و','.':'ز','/':'ظ',
    'Q':'ض','W':'ص','E':'ث','R':'ق','T':'ف','Y':'غ','U':'ع','I':'ه','O':'خ','P':'ح',
    'A':'ش','S':'س','D':'ي','F':'ب','G':'ل','H':'ا','J':'ت','K':'ن','L':'م',
    'Z':'ئ','X':'ء','C':'ؤ','V':'ر','B':'ل','N':'ى','M':'ة'
  };

  function applyArabicInput(inputEl) {
    if (!inputEl) return;
    // ضع direction وlang
    inputEl.setAttribute('dir', 'rtl');
    inputEl.setAttribute('lang', 'ar');
    inputEl.style.direction = 'rtl';
    inputEl.style.textAlign = 'right';
    inputEl.style.fontFamily = 'Cairo, sans-serif';

    inputEl.addEventListener('keydown', function(e) {
      const key = e.key;
      // تجاهل المفاتيح الخاصة
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (key.length !== 1) return;
      // إذا كانت الحرف موجوداً في الخريطة → حوّله
      if (EN_TO_AR[key]) {
        e.preventDefault();
        const start = inputEl.selectionStart;
        const end   = inputEl.selectionEnd;
        const val   = inputEl.value;
        inputEl.value = val.slice(0, start) + EN_TO_AR[key] + val.slice(end);
        const newPos = start + 1;
        inputEl.setSelectionRange(newPos, newPos);
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  window.U = {
    $, $$, el, fmtMoney, fmtNumber, fmtDate, fmtTime, fmtDateTime,
    todayISO, thisMonthISO, initials,
    toast, showModal, closeModal, updateModalFooter, confirmDialog, statusBadge,
    makeCollapsible, applyArabicInput
  };
})();
