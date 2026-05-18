/**
 * updater.js — نظام التحديث التلقائي عبر GitHub Releases
 * يعمل مع كلا نوعي البناء: Portable و NSIS Installer
 */

const { app, ipcMain, dialog, shell } = require('electron');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const { execFile } = require('child_process');

// ─── ضع هنا اسم مستخدم GitHub واسم المستودع ───
const GITHUB_OWNER = 'abd-elrahmanNaserSakr';
const GITHUB_REPO  = 'shiftly-updater';
// ────────────────────────────────────────────────

const CURRENT_VERSION = app.getVersion(); // يُقرأ من package.json تلقائياً

/* ── هل التطبيق مُثبَّت (NSIS) أم Portable؟ ── */
function isInstalledApp() {
  const exe = process.execPath.toLowerCase();
  // Portable يكون في مجلد مؤقت أو يحمل كلمة "portable"
  return (
    !exe.includes('portable') &&
    (exe.includes('program files') || exe.includes('appdata\\local\\programs'))
  );
}

/* ── تحويل "v1.2.0" → [1,2,0] للمقارنة ── */
function parseVer(v) {
  return String(v)
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

function isNewer(remote, current) {
  const r = parseVer(remote);
  const c = parseVer(current);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (c[i] || 0)) return true;
    if ((r[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

/* ── استعلام GitHub API ── */
function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      headers: {
        'User-Agent': `Shiftly/${CURRENT_VERSION}`,
        'Accept': 'application/vnd.github+json'
      }
    };
    const req = https.get(options, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('تعذّر تحليل استجابة GitHub'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('انتهت مهلة الاتصال بـ GitHub'));
    });
  });
}

/* ── تحديد أنسب ملف تحميل من الـ assets ── */
function pickAsset(assets) {
  const installed = isInstalledApp();

  // أولوية: Setup (NSIS) للمُثبَّت، Portable للمحمول
  const prefer = installed ? 'setup' : 'portable';
  const fallback = installed ? 'portable' : 'setup';

  const find = (keyword) =>
    assets.find((a) =>
      a.name.toLowerCase().includes(keyword) &&
      a.name.toLowerCase().endsWith('.exe')
    );

  return find(prefer) || find(fallback) || assets.find((a) => a.name.endsWith('.exe')) || null;
}

/* ── تنزيل الملف مع تتبع التقدم ── */
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (redirectUrl) => {
      const mod = redirectUrl.startsWith('https') ? require('https') : require('http');
      mod.get(redirectUrl, { headers: { 'User-Agent': `Shiftly/${CURRENT_VERSION}` } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`فشل التنزيل — كود HTTP: ${res.statusCode}`));
          return;
        }
        const total  = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        const out    = fs.createWriteStream(destPath);
        res.on('data', (chunk) => {
          received += chunk.length;
          out.write(chunk);
          if (total && onProgress) onProgress(Math.round((received / total) * 100));
        });
        res.on('end', () => { out.end(); resolve(); });
        res.on('error', (e) => { out.destroy(); reject(e); });
      }).on('error', reject);
    };
    follow(url);
  });
}

/* ── الحالة الداخلية ── */
let _mainWindow = null;
let _checking   = false;

function sendStatus(event, payload) {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.webContents.send(event, payload);
  }
}

/* ── الدالة الرئيسية للتحقق ── */
async function checkForUpdates({ silent = false } = {}) {
  if (_checking) return;
  _checking = true;

  try {
    sendStatus('update:status', { stage: 'checking' });

    const release = await fetchLatestRelease();
    const remoteVersion = (release.tag_name || '').replace(/^v/i, '');

    if (!remoteVersion) throw new Error('لم يُعثر على إصدار في GitHub');

    if (!isNewer(remoteVersion, CURRENT_VERSION)) {
      sendStatus('update:status', { stage: 'up-to-date', current: CURRENT_VERSION });
      if (!silent) {
        dialog.showMessageBox(_mainWindow, {
          type: 'info',
          title: 'Shiftly — التحديثات',
          message: '✅ أنت تستخدم أحدث إصدار',
          detail: `الإصدار الحالي: v${CURRENT_VERSION}`,
          buttons: ['حسناً']
        });
      }
      return;
    }

    // يوجد تحديث جديد
    const asset = pickAsset(release.assets || []);
    const notes = release.body ? release.body.slice(0, 500) : 'لا توجد ملاحظات إصدار.';

    sendStatus('update:status', {
      stage: 'available',
      current: CURRENT_VERSION,
      remote: remoteVersion,
      notes
    });

    const { response } = await dialog.showMessageBox(_mainWindow, {
      type: 'info',
      title: 'Shiftly — تحديث جديد متاح 🎉',
      message: `الإصدار v${remoteVersion} متاح الآن`,
      detail: `الإصدار الحالي: v${CURRENT_VERSION}\n\nملاحظات الإصدار:\n${notes}`,
      buttons: ['تنزيل وتثبيت الآن', 'لاحقاً'],
      defaultId: 0,
      cancelId: 1
    });

    if (response !== 0) {
      sendStatus('update:status', { stage: 'deferred' });
      return;
    }

    if (!asset) {
      // لا يوجد ملف exe — افتح صفحة الإصدار في المتصفح
      shell.openExternal(release.html_url);
      return;
    }

    // ─── تنزيل ───
    const tmpDir  = app.getPath('temp');
    const tmpFile = path.join(tmpDir, asset.name);

    sendStatus('update:status', { stage: 'downloading', progress: 0, filename: asset.name });

    await downloadFile(asset.browser_download_url, tmpFile, (pct) => {
      sendStatus('update:status', { stage: 'downloading', progress: pct, filename: asset.name });
    });

    sendStatus('update:status', { stage: 'downloaded', filename: asset.name });

    // ─── تثبيت ───
    const isSetup = asset.name.toLowerCase().includes('setup');

    if (isSetup) {
      // NSIS installer — شغّله وأغلق التطبيق
      execFile(tmpFile, ['/S'], { detached: true, stdio: 'ignore' }).unref();
      app.quit();
    } else {
      // Portable — نبلغ المستخدم ونفتح المجلد
      await dialog.showMessageBox(_mainWindow, {
        type: 'info',
        title: 'Shiftly — التنزيل اكتمل',
        message: '✅ تم تنزيل الإصدار الجديد',
        detail: `تم حفظ الملف في:\n${tmpFile}\n\nيُرجى تشغيل الملف الجديد يدوياً لاستكمال التحديث.`,
        buttons: ['فتح مجلد التنزيل', 'إغلاق']
      }).then(({ response: r }) => {
        if (r === 0) shell.showItemInFolder(tmpFile);
      });
    }
  } catch (err) {
    sendStatus('update:status', { stage: 'error', message: err.message });
    if (!silent) {
      dialog.showMessageBox(_mainWindow, {
        type: 'warning',
        title: 'Shiftly — خطأ في التحديث',
        message: 'تعذّر التحقق من التحديثات',
        detail: err.message,
        buttons: ['حسناً']
      });
    }
  } finally {
    _checking = false;
  }
}

/* ── تسجيل قنوات IPC ── */
function registerUpdaterHandlers(mainWindow) {
  _mainWindow = mainWindow;

  ipcMain.handle('update:check', () => checkForUpdates({ silent: false }));
  ipcMain.handle('update:getVersion', () => CURRENT_VERSION);
}

/* ── التحقق التلقائي عند بدء التشغيل (بعد 5 ث) ── */
function scheduleAutoCheck(mainWindow) {
  _mainWindow = mainWindow;
  // تحقق أول مرة بعد 5 ثوانٍ من بدء التشغيل (صامت)
  setTimeout(() => checkForUpdates({ silent: true }), 5000);
  // ثم كل 6 ساعات
  setInterval(() => checkForUpdates({ silent: true }), 6 * 60 * 60 * 1000);
}

module.exports = { registerUpdaterHandlers, scheduleAutoCheck };
