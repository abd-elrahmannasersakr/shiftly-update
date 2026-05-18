const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path     = require('path');
const fs       = require('fs');

// تحسين الأداء على الأجهزة الضعيفة
app.disableHardwareAcceleration();

// نظام التحديث التلقائي
const { registerUpdaterHandlers, scheduleAutoCheck } = require('./updater');

const db       = require('./db/database');
const api      = require('./db/api');

let mainWindow;
let splashWindow;

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 360,
    height: 280,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  splashWindow.loadFile(path.join(__dirname, 'src', 'splash.html'));
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'نظام إدارة الحضور والرواتب',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    autoHideMenuBar: true
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
  });
}

/* ============================================================
   BACKUP HELPERS
   ============================================================ */
const BACKUP_KEEP = 31; // keep last 31 daily backups

function getBackupDir() {
  const backupDir = path.join('D:\\', 'shiftly-backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function getDbPath() {
  return path.join(app.getPath('userData'), 'attendance.db');
}

/* ---- Settings helpers ---- */
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'shiftly-settings.json');
}
function loadSettings() {
  try {
    const p = getSettingsPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {}
  return {};
}
function saveSettings(obj) {
  try {
    const current = loadSettings();
    fs.writeFileSync(getSettingsPath(), JSON.stringify({ ...current, ...obj }, null, 2), 'utf8');
  } catch (_) {}
}

/* ---- USB drive detection (Windows) ---- */
function detectUsbDrives() {
  try {
    const { execSync } = require('child_process');
    const out = execSync(
      'wmic logicaldisk where drivetype=2 get deviceid,volumename /format:csv',
      { encoding: 'utf8', timeout: 3000 }
    );
    const drives = [];
    out.split('\n').forEach((line) => {
      const parts = line.trim().split(',');
      // csv: Node,DeviceID,VolumeName
      if (parts.length >= 2) {
        const letter = (parts[1] || '').trim();
        const label  = (parts[2] || '').trim();
        if (/^[A-Z]:$/.test(letter)) drives.push({ letter, label });
      }
    });
    return drives;
  } catch (_) {
    return [];
  }
}

function copyToUsb(srcPath, filename) {
  const drives = detectUsbDrives();
  if (!drives.length) return { ok: false, reason: 'لا يوجد USB متصل' };
  const results = [];
  for (const drive of drives) {
    try {
      const dir = path.join(drive.letter + '\\', 'shiftly-backups');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(srcPath, path.join(dir, filename));
      results.push({ letter: drive.letter, label: drive.label, ok: true });
    } catch (e) {
      results.push({ letter: drive.letter, label: drive.label, ok: false, reason: e.message });
    }
  }
  return { ok: results.some((r) => r.ok), drives: results };
}

function getTodayDataAsJson() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const database = db.get();
    const attendance = database.prepare(
      `SELECT a.*, e.name AS employee_name FROM attendance a
       LEFT JOIN employees e ON e.id = a.employee_id
       WHERE a.date = ?`
    ).all(today);
    const revenues = database.prepare(
      `SELECT r.*, e.name AS employee_name FROM revenues r
       LEFT JOIN employees e ON e.id = r.employee_id
       WHERE r.date = ?`
    ).all(today);
    const cleaning = (() => {
      try {
        return database.prepare(
          `SELECT c.*, e.name AS employee_name FROM cleaning c
           LEFT JOIN employees e ON e.id = c.employee_id
           WHERE date(c.created_at) = ? OR c.date = ?`
        ).all(today, today);
      } catch (_) { return []; }
    })();
    const advances = (() => {
      try {
        return database.prepare(
          `SELECT a.*, e.name AS employee_name FROM advances a
           LEFT JOIN employees e ON e.id = a.employee_id
           WHERE a.date = ?`
        ).all(today);
      } catch (_) { return []; }
    })();
    return JSON.stringify({
      exportDate: today,
      exportTime: new Date().toISOString(),
      attendance,
      revenues,
      cleaning,
      advances
    }, null, 2);
  } catch (e) {
    return JSON.stringify({ error: e.message, exportDate: new Date().toISOString().slice(0, 10) });
  }
}

function copyTodayDataToUsb() {
  const drives = detectUsbDrives();
  if (!drives.length) return { ok: false, reason: 'لا يوجد USB متصل' };
  const today    = new Date().toISOString().slice(0, 10);
  const filename = `shiftly-data-${today}.json`;
  const jsonData = getTodayDataAsJson();
  const results  = [];
  for (const drive of drives) {
    try {
      const dir = path.join(drive.letter + '\\', 'shiftly-backups');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), jsonData, 'utf8');
      results.push({ letter: drive.letter, label: drive.label, ok: true });
    } catch (e) {
      results.push({ letter: drive.letter, label: drive.label, ok: false, reason: e.message });
    }
  }
  return { ok: results.some((r) => r.ok), drives: results };
}

function pruneBackups(backupDir) {
  const files = fs.readdirSync(backupDir)
    .filter((f) => /^attendance_\d{4}-\d{2}-\d{2}.*\.db$/.test(f))
    .sort();
  if (files.length > BACKUP_KEEP) {
    files.slice(0, files.length - BACKUP_KEEP).forEach((f) => {
      try { fs.unlinkSync(path.join(backupDir, f)); } catch (_) {}
    });
  }
}

async function runDailyBackup() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) return;
  const backupDir = getBackupDir();
  const today = new Date().toISOString().slice(0, 10);
  const filename = `attendance_${today}.db`;
  const backupPath = path.join(backupDir, filename);
  if (fs.existsSync(backupPath)) return; // already backed up today
  try {
    fs.copyFileSync(dbPath, backupPath);
    pruneBackups(backupDir);
    // Copy today's data as JSON to USB if user enabled it
    const settings = loadSettings();
    if (settings.usbBackupEnabled) copyTodayDataToUsb();
  } catch (_) {}
}

function registerBackupHandlers() {
  // List all backups
  ipcMain.handle('backup:list', () => {
    try {
      const backupDir = getBackupDir();
      const files = fs.readdirSync(backupDir)
        .filter((f) => /^attendance_.*\.db$/.test(f))
        .sort()
        .reverse()
        .map((f) => {
          const full = path.join(backupDir, f);
          const stat = fs.statSync(full);
          const dateStr = f.replace(/^attendance_/, '').replace(/\.db$/, '');
          return { filename: f, dateStr, sizeBytes: stat.size, mtime: stat.mtime.toISOString() };
        });
      return { ok: true, data: files };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Manual backup (always creates a timestamped copy)
  ipcMain.handle('backup:run', async () => {
    try {
      const dbPath = getDbPath();
      if (!fs.existsSync(dbPath)) throw new Error('قاعدة البيانات غير موجودة بعد');
      const backupDir = getBackupDir();
      const now = new Date();
      const ts = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
      const filename = `attendance_${ts}.db`;
      const backupPath = path.join(backupDir, filename);
      fs.copyFileSync(dbPath, backupPath);
      pruneBackups(backupDir);
      // Copy today's data as JSON to USB if enabled
      const settings  = loadSettings();
      const usbResult = settings.usbBackupEnabled ? copyTodayDataToUsb() : null;
      return {
        ok: true,
        data: {
          filename,
          sizeBytes: fs.statSync(backupPath).size,
          usb: usbResult
        }
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Delete a specific backup
  ipcMain.handle('backup:delete', (_evt, { filename }) => {
    try {
      const backupDir = getBackupDir();
      const target = path.join(backupDir, filename);
      if (!target.startsWith(backupDir)) throw new Error('مسار غير مسموح');
      if (fs.existsSync(target)) fs.unlinkSync(target);
      return { ok: true, data: null };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // USB backup status + toggle
  ipcMain.handle('backup:usbStatus', () => {
    try {
      const settings = loadSettings();
      const enabled  = !!settings.usbBackupEnabled;
      const drives   = detectUsbDrives();
      return { ok: true, data: { enabled, drives } };
    } catch (e) {
      return { ok: true, data: { enabled: false, drives: [] } };
    }
  });

  ipcMain.handle('backup:setUsbEnabled', (_evt, { enabled }) => {
    try {
      saveSettings({ usbBackupEnabled: !!enabled });
      return { ok: true, data: { enabled: !!enabled } };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Restore from backup
  ipcMain.handle('backup:restore', (_evt, { filename }) => {
    try {
      const backupDir = getBackupDir();
      const src = path.join(backupDir, filename);
      if (!src.startsWith(backupDir)) throw new Error('مسار غير مسموح');
      if (!fs.existsSync(src)) throw new Error('ملف النسخة غير موجود');
      db.close();
      fs.copyFileSync(src, getDbPath());
      db.reinit();
      return { ok: true, data: null };
    } catch (e) {
      // Try to reinit even on error
      try { db.reinit(); } catch (_) {}
      return { ok: false, error: e.message };
    }
  });
}

/* ============================================================
   APP LIFECYCLE
   ============================================================ */

/* منع فتح البرنامج مرتين على نفس الجهاز */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // نسخة ثانية — اعرض رسالة جميلة ثم أغلق
  app.whenReady().then(() => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Shiftly — تنبيه',
      message: '🔒 البرنامج يعمل بالفعل',
      detail: 'يوجد نسخة من البرنامج مفتوحة بالفعل على هذا الجهاز.\n\nلا يمكن تشغيل البرنامج أكثر من مرة في نفس الوقت.\n\nيُرجى العودة إلى النافذة المفتوحة في شريط المهام.',
      buttons: ['حسناً، سأعود إليه'],
      defaultId: 0,
      icon: require('path').join(__dirname, 'assets', 'icon.png')
    }).then(() => app.quit()).catch(() => app.quit());
  });
} else {
  /* إذا حاول شخص فتح نسخة ثانية — ركّز على النافذة الموجودة */
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

app.whenReady().then(() => {
  db.init();
  registerIpcHandlers();
  registerBackupHandlers();
  createSplash();
  createWindow();

  // Run daily backup on startup, then check every hour
  runDailyBackup();
  setInterval(runDailyBackup, 60 * 60 * 1000);

  // نظام التحديث التلقائي
  registerUpdaterHandlers(mainWindow);
  scheduleAutoCheck(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

} // end single-instance else block

function registerIpcHandlers() {
  const channels = Object.keys(api);
  channels.forEach((channel) => {
    ipcMain.handle(channel, async (_evt, payload) => {
      try {
        const result = await api[channel](payload || {});
        return { ok: true, data: result };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    });
  });
}
