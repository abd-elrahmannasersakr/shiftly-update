// Auth module: handles login screen + current session.
// Login flow: user PICKS their account from a dropdown, then types password.
(function () {
  let currentUser = null; // { id, username, role, employee_id, employee }
  let accountsCache = []; // [{ id, username, role, label, sub }]
  let _sessionChannel = null;

  function getUser() { return currentUser; }
  function isManager() { return currentUser && currentUser.role === 'manager'; }
  function isEmployee() { return currentUser && currentUser.role === 'employee'; }

  async function loadAccounts() {
    const select = document.getElementById('loginAccount');
    try {
      accountsCache = await API['auth:listAccounts']();
    } catch (e) {
      accountsCache = [];
    }
    select.innerHTML = '';
    if (!accountsCache.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'لا توجد حسابات';
      select.appendChild(opt);
      return;
    }
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— اختر اسمك —';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);
    accountsCache.forEach((a) => {
      const opt = document.createElement('option');
      opt.value = a.username;
      opt.textContent = a.sub ? (a.label + ' — ' + a.sub) : a.label;
      opt.dataset.role = a.role;
      select.appendChild(opt);
    });
    // انتقل تلقائياً لحقل الباسورد عند اختيار اسم
    select.addEventListener('change', () => {
      if (select.value) {
        setTimeout(() => document.getElementById('loginPassword').focus(), 50);
      }
    });
  }

  function showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('appShell').style.display = 'none';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').classList.remove('show');
    loadAccounts().then(() => {
      setTimeout(() => document.getElementById('loginAccount').focus(), 100);
    });
  }

  function hideLogin() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appShell').style.display = 'flex';
  }

  function showError(msg) {
    const el = document.getElementById('loginError');
    el.textContent = msg;
    el.classList.add('show');
  }

  async function login(username, password) {
    try {
      const user = await API['auth:login']({ username, password });
      currentUser = user;

      // منع تسجيل الدخول من أكثر من تبويب بنفس المستخدم
      if (_sessionChannel) { try { _sessionChannel.close(); } catch (_) {} }
      try {
        _sessionChannel = new BroadcastChannel('shiftly_session');
        _sessionChannel.postMessage({ type: 'login', username: user.username });
        _sessionChannel.onmessage = (evt) => {
          if (evt.data && evt.data.type === 'login' && currentUser && evt.data.username === currentUser.username) {
            logout();
            setTimeout(() => U && U.toast && U.toast('تم تسجيل الدخول من تبويب آخر — تم تسجيل خروجك تلقائياً', 'warning'), 300);
          }
        };
      } catch (_) {}

      hideLogin();
      window.App && window.App.onLogin && window.App.onLogin(user);
      return user;
    } catch (e) {
      showError(e.message || 'فشل تسجيل الدخول');
      throw e;
    }
  }

  function logout() {
    currentUser = null;
    if (_sessionChannel) { try { _sessionChannel.close(); } catch (_) {} _sessionChannel = null; }
    showLogin();
    window.App && window.App.onLogout && window.App.onLogout();
  }

  function bind() {
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('loginAccount').value;
      const p = document.getElementById('loginPassword').value;
      if (!u) { showError('من فضلك اختر المستخدم'); return; }
      if (!p) { showError('من فضلك أدخل كلمة المرور'); return; }
      const btn = document.getElementById('loginBtn');
      btn.disabled = true;
      btn.textContent = 'جاري التحقق...';
      try { await login(u, p); }
      catch (_) { /* error already shown */ }
      finally { btn.disabled = false; btn.textContent = 'تسجيل الدخول'; }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
      U.confirmDialog('هل تريد تسجيل الخروج؟', () => logout());
    });

    document.getElementById('changePasswordBtn').addEventListener('click', () => {
      openChangePasswordModal();
    });
  }

  function openChangePasswordModal() {
    const user = currentUser;
    if (!user) return;

    const oldPass = U.el('input', { type: 'password', class: 'form-control', placeholder: 'كلمة المرور الحالية' });
    const newPass = U.el('input', { type: 'password', class: 'form-control', placeholder: 'كلمة المرور الجديدة (4 أحرف على الأقل)' });
    const confirmPass = U.el('input', { type: 'password', class: 'form-control', placeholder: 'تأكيد كلمة المرور الجديدة' });

    const body = U.el('div');

    // Job title field (manager only)
    let jobTitleInp = null;
    if (user.role === 'manager') {
      const currentLabel = (accountsCache.find((a) => a.role === 'manager') || {}).sub || 'مدير';
      jobTitleInp = U.el('input', {
        type: 'text', class: 'form-control',
        value: currentLabel,
        placeholder: 'مثال: مدير، مشرف، مدير فرع...'
      });
      body.appendChild(U.el('div', {
        style: 'background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#1e40af;font-weight:700;'
      }, ['🔑 الدور: مدير']));
      body.appendChild(U.el('div', { class: 'form-group mb-3' }, [
        U.el('label', { class: 'form-label' }, ['المسمى الوظيفي']),
        jobTitleInp
      ]));
      body.appendChild(U.el('div', { class: 'divider' }));
    }

    body.appendChild(U.el('div', { class: 'form-group' }, [
      U.el('label', { class: 'form-label' }, ['كلمة المرور الحالية *']),
      oldPass
    ]));
    body.appendChild(U.el('div', { class: 'form-group mt-3' }, [
      U.el('label', { class: 'form-label' }, ['كلمة المرور الجديدة *']),
      newPass
    ]));
    body.appendChild(U.el('div', { class: 'form-group mt-3' }, [
      U.el('label', { class: 'form-label' }, ['تأكيد كلمة المرور الجديدة *']),
      confirmPass
    ]));

    U.showModal({
      title: 'تغيير كلمة المرور',
      body,
      footer: [
        U.el('button', { class: 'btn btn-secondary', onclick: U.closeModal }, ['إلغاء']),
        U.el('button', {
          class: 'btn',
          onclick: async () => {
            if (!oldPass.value) { U.toast('أدخل كلمة المرور الحالية', 'error'); return; }
            if (!newPass.value || newPass.value.length < 4) { U.toast('كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل', 'error'); return; }
            if (newPass.value !== confirmPass.value) { U.toast('كلمة المرور الجديدة غير متطابقة', 'error'); return; }
            try {
              await API['auth:changePassword']({
                user_id: user.id,
                oldPassword: oldPass.value,
                newPassword: newPass.value
              });
              // Update manager job title if changed
              if (user.role === 'manager' && jobTitleInp) {
                const newLabel = jobTitleInp.value.trim();
                if (newLabel) {
                  await API['settings:update']({ manager_role_label: newLabel });
                  // Refresh dropdown to reflect new label
                  await loadAccounts();
                }
              }
              U.closeModal();
              U.toast('تم الحفظ بنجاح ✅', 'success');
            } catch (e) {
              U.toast(e.message || 'فشل الحفظ', 'error');
            }
          }
        }, ['حفظ'])
      ]
    });

    setTimeout(() => oldPass.focus(), 100);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    showLogin();
  });

  window.Auth = { getUser, isManager, isEmployee, logout, openChangePasswordModal };
})();
