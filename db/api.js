const db = require('./database');
const auth = require('./auth');

const todayISO = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();

/* ---------- helpers ---------- */
function diffHours(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  let a = new Date(checkIn).getTime();
  let b = new Date(checkOut).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  // checkout crossed midnight (stored same date but earlier time) → add 24h
  if (b <= a) b += 24 * 60 * 60 * 1000;
  return (b - a) / (1000 * 60 * 60);
}

function totalHoursFor(employeeId) {
  const rows = db.get().prepare(
    `SELECT check_in, check_out FROM attendance WHERE employee_id = ? AND check_in IS NOT NULL AND check_out IS NOT NULL`
  ).all(employeeId);
  return rows.reduce((sum, r) => sum + diffHours(r.check_in, r.check_out), 0);
}

function sumAdjustments(employeeId, type) {
  const r = db.get().prepare(
    `SELECT COALESCE(SUM(amount),0) AS total FROM salary_adjustments WHERE employee_id = ? AND type = ?`
  ).get(employeeId, type);
  return r.total || 0;
}

function sumAdvances(employeeId) {
  const r = db.get().prepare(
    `SELECT COALESCE(SUM(amount),0) AS total FROM advances WHERE employee_id = ?`
  ).get(employeeId);
  return r.total || 0;
}

function computeSalary(employee) {
  const hours = totalHoursFor(employee.id);
  const bonuses = sumAdjustments(employee.id, 'bonus');
  const deductions = sumAdjustments(employee.id, 'deduction');
  const advances = sumAdvances(employee.id);
  const earnedFromHours = hours * (employee.hourly_rate || 0);
  const gross = (employee.base_salary || 0) + earnedFromHours + bonuses;
  const net = gross - deductions - advances;
  return {
    hours: +hours.toFixed(2),
    bonuses: +bonuses.toFixed(2),
    deductions: +deductions.toFixed(2),
    advances: +advances.toFixed(2),
    earnedFromHours: +earnedFromHours.toFixed(2),
    base_salary: employee.base_salary || 0,
    gross: +gross.toFixed(2),
    net: +net.toFixed(2)
  };
}

/* ---------- auth ---------- */
async function authLogin({ username, password }) {
  if (!username || !password) throw new Error('اسم المستخدم وكلمة المرور مطلوبان');
  const user = db.get().prepare(
    `SELECT * FROM users WHERE username = ?`
  ).get(String(username).trim());
  if (!user) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
  if (!auth.verifyPassword(password, user.password_hash, user.password_salt)) {
    throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
  }
  let employee = null;
  if (user.role === 'employee' && user.employee_id) {
    employee = db.get().prepare(`SELECT * FROM employees WHERE id = ?`).get(user.employee_id);
    if (!employee) throw new Error('الموظف المرتبط غير موجود');
  }
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    employee_id: user.employee_id,
    employee
  };
}

async function authChangePassword({ user_id, oldPassword, newPassword }) {
  if (!user_id) throw new Error('المستخدم غير محدد');
  if (!newPassword || String(newPassword).length < 4) {
    throw new Error('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
  }
  const user = db.get().prepare(`SELECT * FROM users WHERE id = ?`).get(user_id);
  if (!user) throw new Error('المستخدم غير موجود');
  if (!auth.verifyPassword(oldPassword, user.password_hash, user.password_salt)) {
    throw new Error('كلمة المرور القديمة غير صحيحة');
  }
  const { hash, salt } = auth.hashPassword(newPassword);
  db.get().prepare(`UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?`).run(hash, salt, user_id);
  return { ok: true };
}

async function authResetEmployeeCredentials({ employee_id, username, password }) {
  if (!employee_id) throw new Error('الموظف مطلوب');
  if (!username || !String(username).trim()) throw new Error('اسم المستخدم مطلوب');
  if (!password || String(password).length < 4) throw new Error('كلمة المرور يجب أن تكون 4 أحرف على الأقل');

  const u = String(username).trim();
  const existing = db.get().prepare(`SELECT * FROM users WHERE employee_id = ?`).get(employee_id);
  const conflict = db.get().prepare(`SELECT * FROM users WHERE username = ? AND (employee_id IS NULL OR employee_id != ?)`).get(u, employee_id);
  if (conflict) throw new Error('اسم المستخدم مستخدم بالفعل');

  const { hash, salt } = auth.hashPassword(password);
  if (existing) {
    db.get().prepare(`UPDATE users SET username = ?, password_hash = ?, password_salt = ? WHERE id = ?`)
      .run(u, hash, salt, existing.id);
  } else {
    db.get().prepare(
      `INSERT INTO users (username, password_hash, password_salt, role, employee_id) VALUES (?, ?, ?, 'employee', ?)`
    ).run(u, hash, salt, employee_id);
  }
  return { ok: true };
}

async function authUserForEmployee({ employee_id }) {
  return db.get().prepare(`SELECT id, username, role FROM users WHERE employee_id = ?`).get(employee_id) || null;
}

/**
 * Login dropdown: list every account with a friendly display name so the
 * user can pick instead of typing. No password hashes are returned.
 */
async function authListAccounts() {
  const rows = db.get().prepare(`
    SELECT u.id, u.username, u.role, u.employee_id, e.name AS employee_name, e.role AS job_title
    FROM users u
    LEFT JOIN employees e ON e.id = u.employee_id
    ORDER BY (u.role = 'manager') DESC, COALESCE(e.name, u.username) ASC
  `).all();
  const managerLabel = settingGet('manager_role_label', 'مدير');
  const employeeLabel = settingGet('employee_role_label', 'موظف');
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role,
    employee_id: r.employee_id,
    label: r.role === 'manager'
      ? (r.employee_name || r.username)
      : (r.employee_name || r.username),
    sub: r.role === 'manager' ? managerLabel : (r.job_title || employeeLabel)
  }));
}

/* ---------- employees ---------- */
async function employeesList() {
  return db.get().prepare(`SELECT * FROM employees ORDER BY id DESC`).all();
}

async function employeesGet({ id }) {
  return db.get().prepare(`SELECT * FROM employees WHERE id = ?`).get(id);
}

async function employeesCreate({ name, role, hourly_rate, base_salary, incentive_percentage, has_incentive, has_fixed_checkin, check_in_time, username, password, visible_mgr_tabs, visible_emp_tabs }) {
  if (!name || !name.trim()) throw new Error('الاسم مطلوب');
  if (!username || !username.trim()) throw new Error('اسم المستخدم مطلوب');
  if (!password || String(password).length < 4) throw new Error('كلمة المرور يجب أن تكون 4 أحرف على الأقل');

  const u = String(username).trim();
  const conflict = db.get().prepare(`SELECT id FROM users WHERE username = ?`).get(u);
  if (conflict) throw new Error('اسم المستخدم مستخدم بالفعل');

  const tx = db.get().transaction(() => {
    const info = db.get().prepare(
      `INSERT INTO employees (name, role, hourly_rate, base_salary, incentive_percentage, has_incentive, has_fixed_checkin, check_in_time, visible_mgr_tabs, visible_emp_tabs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      name.trim(), role || '',
      Number(hourly_rate) || 0,
      Number(base_salary) || 0,
      Number(incentive_percentage) || 0,
      has_incentive !== undefined ? (has_incentive ? 1 : 0) : 1,
      has_fixed_checkin !== undefined ? (has_fixed_checkin ? 1 : 0) : 1,
      (check_in_time || '09:00').trim(),
      visible_mgr_tabs || null,
      visible_emp_tabs || null
    );

    const { hash, salt } = auth.hashPassword(password);
    db.get().prepare(
      `INSERT INTO users (username, password_hash, password_salt, role, employee_id) VALUES (?, ?, ?, 'employee', ?)`
    ).run(u, hash, salt, info.lastInsertRowid);

    return info.lastInsertRowid;
  });
  const id = tx();
  return { id };
}

async function employeesUpdate({ id, name, role, hourly_rate, base_salary, incentive_percentage, has_incentive, has_fixed_checkin, check_in_time, visible_mgr_tabs, visible_emp_tabs }) {
  if (!id) throw new Error('المعرف مطلوب');
  const existing = db.get().prepare(`SELECT * FROM employees WHERE id = ?`).get(id);
  if (!existing) throw new Error('الموظف غير موجود');
  db.get().prepare(
    `UPDATE employees SET name=?, role=?, hourly_rate=?, base_salary=?, incentive_percentage=?, has_incentive=?, has_fixed_checkin=?, check_in_time=?, visible_mgr_tabs=?, visible_emp_tabs=? WHERE id=?`
  ).run(
    name || existing.name, role !== undefined ? role : (existing.role || ''),
    Number(hourly_rate) || 0,
    Number(base_salary) || 0,
    Number(incentive_percentage) || 0,
    has_incentive !== undefined ? (has_incentive ? 1 : 0) : (existing.has_incentive !== undefined ? existing.has_incentive : 1),
    has_fixed_checkin !== undefined ? (has_fixed_checkin ? 1 : 0) : (existing.has_fixed_checkin !== undefined ? existing.has_fixed_checkin : 1),
    (check_in_time || existing.check_in_time || '09:00').trim(),
    visible_mgr_tabs !== undefined ? visible_mgr_tabs : existing.visible_mgr_tabs,
    visible_emp_tabs !== undefined ? visible_emp_tabs : existing.visible_emp_tabs,
    id
  );
  return { ok: true };
}

async function employeesDelete({ id }) {
  if (!id) throw new Error('المعرف مطلوب');
  db.get().prepare(`DELETE FROM employees WHERE id = ?`).run(id);
  return { ok: true };
}

/* ---------- attendance ---------- */
async function attendanceCheckIn({ employee_id, shift, date: dateParam }) {
  if (!employee_id) throw new Error('الموظف مطلوب');
  shift = Number(shift) || 1;
  const date = dateParam || todayISO();

  // Block new check-in if this shift has an OPEN record from a previous day (cross-midnight protection)
  const openPrev = db.get().prepare(
    `SELECT * FROM attendance
     WHERE employee_id=? AND shift=? AND check_in IS NOT NULL AND check_out IS NULL AND date < ?
     ORDER BY date DESC LIMIT 1`
  ).get(employee_id, shift, date);
  if (openPrev) {
    const shiftName = shift === 1 ? 'الأولى' : 'الثانية';
    throw new Error(`الوردية ${shiftName} مفتوحة منذ ${openPrev.date} — سجّل الانصراف أولاً قبل تسجيل حضور جديد`);
  }

  // Check if employee already has 2 shifts registered today (by themselves) - prevent a 3rd shift
  // We count DISTINCT shifts to avoid counting manager entries as separate employee shifts
  const existingToday = db.get().prepare(
    `SELECT COUNT(DISTINCT shift) as cnt FROM attendance WHERE employee_id=? AND date=? AND check_in IS NOT NULL AND source='self'`
  ).get(employee_id, date);
  if (existingToday && existingToday.cnt >= 2) {
    throw new Error('لا يمكن تسجيل أكثر من فترتين في اليوم الواحد');
  }

  // Only look for the employee's own record (source='self') — manager entries are separate
  // This prevents the case where manager registered the shift and employee is blocked
  const existingSelf = db.get().prepare(
    `SELECT * FROM attendance WHERE employee_id=? AND date=? AND shift=? AND source='self'`
  ).get(employee_id, date, shift);
  if (existingSelf && existingSelf.check_in) {
    throw new Error('تم تسجيل الحضور لهذه الوردية مسبقاً');
  }
  if (existingSelf) {
    const checkInTime2 = nowISO();
    db.get().prepare(`UPDATE attendance SET check_in=? WHERE id=?`).run(checkInTime2, existingSelf.id);
    // No late deduction here - this is updating an existing record, not a new check-in
    // Late deduction is only applied when creating new check-in records
    return { id: existingSelf.id };
  }
  const checkInTime = nowISO();
  const info = db.get().prepare(
    `INSERT INTO attendance (employee_id, shift, date, check_in, source) VALUES (?, ?, ?, ?, 'self')`
  ).run(employee_id, shift, date, checkInTime);

  // Auto late deduction: only for FIRST check-in of the day (regardless of shift)
  // Check if this is the employee's first check-in today
  try {
    const emp = db.get().prepare(`SELECT * FROM employees WHERE id = ?`).get(employee_id);
    if (emp && emp.check_in_time && emp.has_fixed_checkin === 1) {
      // Check if employee already has any self check-in today (exclude manager entries)
      const firstCheckInToday = db.get().prepare(
        `SELECT check_in FROM attendance WHERE employee_id=? AND date=? AND check_in IS NOT NULL AND source='self' ORDER BY check_in ASC LIMIT 1`
      ).get(employee_id, date);

      // Only apply late deduction if this is the FIRST self check-in of the day
      if (!firstCheckInToday || firstCheckInToday.check_in === checkInTime) {
        const now = new Date();
        // لا خصم تأخير يوم الجمعة (getDay() === 5)
        if (now.getDay() === 5) return { id: info.lastInsertRowid };
        const [expectedH, expectedM] = emp.check_in_time.split(':').map(Number);
        const expectedMinutes = expectedH * 60 + expectedM;
        const actualMinutes   = now.getHours() * 60 + now.getMinutes();
        const lateMinutes     = actualMinutes - expectedMinutes;
        if (lateMinutes > 10) {
          const points = 1 + Math.floor((lateMinutes - 10) / 5);
          db.get().prepare(
            `INSERT INTO applied_policies (employee_id, policy_id, policy_name, type, points, date, notes) VALUES (?, NULL, ?, 'penalty', ?, ?, ?)`
          ).run(
            employee_id,
            `تأخر ${lateMinutes} دقيقة`,
            points,
            date,
            `دخول متأخر ${lateMinutes} دقيقة عن وقت ${emp.check_in_time} — خصم تلقائي`
          );
        }
      }
    }
  } catch (_) {}

  return { id: info.lastInsertRowid };
}

async function attendanceCheckOut({ employee_id, shift }) {
  if (!employee_id) throw new Error('الموظف مطلوب');
  shift = Number(shift) || 1;
  const date = todayISO();
  // Prefer employee own self-record; fall back to any open record for this shift
  let existing = db.get().prepare(
    `SELECT * FROM attendance WHERE employee_id=? AND date=? AND shift=? AND source='self'`
  ).get(employee_id, date, shift);
  if (!existing || !existing.check_in || existing.check_out) {
    const fallback = db.get().prepare(
      `SELECT * FROM attendance WHERE employee_id=? AND date=? AND shift=?`
    ).get(employee_id, date, shift);
    if (fallback && fallback.check_in && !fallback.check_out) existing = fallback;
  }
  // Handle overnight shifts: if no open record today, look for most recent open record
  // within the last 2 days (to support shifts >14h that cross midnight)
  if (!existing || !existing.check_in || existing.check_out) {
    const open = db.get().prepare(
      `SELECT * FROM attendance
       WHERE employee_id=? AND shift=? AND check_in IS NOT NULL AND check_out IS NULL
       AND date >= date(?, '-2 days')
       ORDER BY date DESC, id DESC LIMIT 1`
    ).get(employee_id, shift, date);
    if (open) existing = open;
  }
  // إذا لم يوجد سجل مفتوح — أنشئ سجلاً جديداً بالانصراف فقط (بدون حضور)
  if (!existing || existing.check_out) {
    // لا يوجد سجل مفتوح → نتحقق أن الفترة لم تُسجَّل بالكامل مسبقاً
    const alreadyDone = db.get().prepare(
      `SELECT * FROM attendance WHERE employee_id=? AND date=? AND shift=? AND check_out IS NOT NULL LIMIT 1`
    ).get(employee_id, date, shift);
    if (alreadyDone) throw new Error('تم تسجيل الانصراف مسبقاً');
    // إنشاء سجل انصراف بدون حضور
    const info = db.get().prepare(
      `INSERT INTO attendance (employee_id, shift, date, check_out, source) VALUES (?, ?, ?, ?, 'self')`
    ).run(employee_id, shift, date, nowISO());
    return { id: info.lastInsertRowid };
  }
  if (existing.check_out) throw new Error('تم تسجيل الانصراف مسبقاً');
  db.get().prepare(`UPDATE attendance SET check_out=? WHERE id=?`).run(nowISO(), existing.id);
  return { id: existing.id };
}

async function attendanceListByEmployee({ employee_id, limit = 200 }) {
  return db.get().prepare(
    `SELECT * FROM attendance WHERE employee_id = ? ORDER BY date DESC, shift ASC, id DESC LIMIT ?`
  ).all(employee_id, limit);
}

async function attendanceToday({ employee_id, date }) {
  const d = date || todayISO();
  return db.get().prepare(
    `SELECT * FROM attendance WHERE employee_id = ? AND date = ? ORDER BY shift ASC`
  ).all(employee_id, d);
}

// Returns any open shifts (check_in set, check_out NULL) from previous days — for cross-midnight detection
async function attendanceOpenShifts({ employee_id }) {
  const date = todayISO();
  return db.get().prepare(
    `SELECT * FROM attendance
     WHERE employee_id = ? AND check_in IS NOT NULL AND check_out IS NULL AND date < ?
     ORDER BY date DESC, shift ASC`
  ).all(employee_id, date);
}

async function attendanceManagerEntry({ employee_id, shift, date, check_in, check_out, notes }) {
  if (!employee_id || !date || !shift) throw new Error('بيانات ناقصة');

  // Check for ANY existing record in this period (from employee OR manager) - MERGE if exists
  const existingRecord = db.get().prepare(
    `SELECT * FROM attendance WHERE employee_id=? AND date=? AND shift=?`
  ).get(employee_id, Number(shift), date);

  let recordId;
  if (existingRecord) {
    // MERGE data from existing record with manager's data
    // Keep existing check_in if it exists (from employee or previous manager entry)
    // Keep existing check_out if it exists (from employee or previous manager entry)
    // Manager's values should FILL IN the gaps (only set if existing is NULL)
    const finalCheckIn = check_in || existingRecord.check_in;
    const finalCheckOut = check_out || existingRecord.check_out;

    db.get().prepare(
      `UPDATE attendance SET check_in=?, check_out=?, source='manager', notes=? WHERE id=?`
    ).run(finalCheckIn, finalCheckOut, notes || existingRecord.notes || '', existingRecord.id);
    recordId = existingRecord.id;
  } else {
    // INSERT new record
    const info = db.get().prepare(
      `INSERT INTO attendance (employee_id, shift, date, check_in, check_out, source, notes)
       VALUES (?, ?, ?, ?, ?, 'manager', ?)`
    ).run(employee_id, Number(shift), date, check_in || null, check_out || null, notes || '');
    recordId = info.lastInsertRowid;
  }

  // Late deduction: only for FIRST check-in of the day (regardless of shift)
  // (التحقق من has_fixed_checkin = 1 فقط)
  if (check_in) {
    try {
      const emp = db.get().prepare(`SELECT * FROM employees WHERE id = ?`).get(employee_id);
      if (emp && emp.check_in_time && emp.has_fixed_checkin === 1) {
        // Check if this is the first check-in of the day for this employee
        const firstCheckInToday = db.get().prepare(
          `SELECT check_in FROM attendance WHERE employee_id=? AND date=? AND check_in IS NOT NULL ORDER BY check_in ASC LIMIT 1`
        ).get(employee_id, date);

        // Only apply late deduction if this is the FIRST check-in of the day
        if (!firstCheckInToday || firstCheckInToday.check_in === check_in) {
          const ciDate = new Date(check_in);
          // لا خصم تأخير يوم الجمعة (getDay() === 5)
          if (ciDate.getDay() === 5) return { id: recordId };
          const [expH, expM] = emp.check_in_time.split(':').map(Number);
          const expectedMinutes = expH * 60 + expM;
          const actualMinutes = ciDate.getHours() * 60 + ciDate.getMinutes();
          const lateMinutes = actualMinutes - expectedMinutes;
          if (lateMinutes > 10) {
            const points = 1 + Math.floor((lateMinutes - 10) / 5);
            db.get().prepare(
              `INSERT INTO applied_policies (employee_id, policy_id, policy_name, type, points, date, notes) VALUES (?, NULL, ?, 'penalty', ?, ?, ?)`
            ).run(
              employee_id,
              `تأخر ${lateMinutes} دقيقة`,
              points,
              date,
              `دخول متأخر ${lateMinutes} دقيقة عن وقت ${emp.check_in_time} — تسجيل يدوي من المدير`
            );
          }
        }
      }
    } catch (_) {}
  }

  return { id: recordId };
}

async function attendanceDelete({ id }) {
  if (!id) throw new Error('المعرف مطلوب');
  db.get().prepare(`DELETE FROM attendance WHERE id = ?`).run(id);
  return { ok: true };
}

async function attendanceUpdate({ id, check_in, check_out, notes }) {
  if (!id) throw new Error('المعرف مطلوب');
  db.get().prepare(
    `UPDATE attendance SET check_in=?, check_out=?, notes=? WHERE id=?`
  ).run(check_in || null, check_out || null, notes !== undefined ? notes : '', id);
  return { ok: true };
}

/* ---------- cleaning ---------- */
async function cleaningCreate({ employee_id, status, notes, date }) {
  if (!employee_id || !status) throw new Error('بيانات ناقصة');
  const info = db.get().prepare(
    `INSERT INTO cleaning (employee_id, date, status, notes) VALUES (?, ?, ?, ?)`
  ).run(employee_id, date || todayISO(), status, notes || '');
  return { id: info.lastInsertRowid };
}

async function cleaningListByEmployee({ employee_id, limit = 200 }) {
  return db.get().prepare(
    `SELECT * FROM cleaning WHERE employee_id = ? ORDER BY date DESC, id DESC LIMIT ?`
  ).all(employee_id, limit);
}

async function cleaningMonthly({ employee_id, month }) {
  const m = month || todayISO().slice(0, 7);
  // Only show completed tasks (status = 'done') in the monthly log - KPI only
  return db.get().prepare(
    `SELECT * FROM cleaning WHERE employee_id = ? AND substr(date,1,7) = ? AND status = 'done' ORDER BY date DESC, id DESC`
  ).all(employee_id, m);
}

/* ---------- adjustments ---------- */
async function adjustmentsCreate({ employee_id, type, amount, reason, date }) {
  if (!employee_id) throw new Error('الموظف مطلوب');
  if (!['deduction', 'bonus'].includes(type)) throw new Error('النوع غير صحيح');
  const a = Number(amount);
  if (!a || a <= 0) throw new Error('المبلغ غير صحيح');
  const info = db.get().prepare(
    `INSERT INTO salary_adjustments (employee_id, type, amount, reason, date) VALUES (?, ?, ?, ?, ?)`
  ).run(employee_id, type, a, reason || '', date || todayISO());
  return { id: info.lastInsertRowid };
}

async function adjustmentsListByEmployee({ employee_id, limit = 200 }) {
  return db.get().prepare(
    `SELECT * FROM salary_adjustments WHERE employee_id = ? ORDER BY date DESC, id DESC LIMIT ?`
  ).all(employee_id, limit);
}

async function adjustmentsDelete({ id }) {
  db.get().prepare(`DELETE FROM salary_adjustments WHERE id = ?`).run(id);
  return { ok: true };
}

/* ---------- advances ---------- */
async function advancesCreate({ employee_id, amount, notes, date }) {
  if (!employee_id) throw new Error('الموظف مطلوب');
  const a = Number(amount);
  if (!a || a <= 0) throw new Error('المبلغ غير صحيح');
  const info = db.get().prepare(
    `INSERT INTO advances (employee_id, amount, notes, date) VALUES (?, ?, ?, ?)`
  ).run(employee_id, a, notes || '', date || todayISO());
  return { id: info.lastInsertRowid };
}

async function advancesListByEmployee({ employee_id, limit = 200 }) {
  return db.get().prepare(
    `SELECT * FROM advances WHERE employee_id = ? ORDER BY date DESC, id DESC LIMIT ?`
  ).all(employee_id, limit);
}

async function advancesDelete({ id }) {
  db.get().prepare(`DELETE FROM advances WHERE id = ?`).run(id);
  return { ok: true };
}

/* ---------- correction requests ---------- */
async function correctionRequestCreate({ employee_id, shift, date, requested_ci, requested_co, notes }) {
  if (!employee_id) throw new Error('الموظف مطلوب');
  if (!requested_ci) throw new Error('وقت الحضور مطلوب');
  if (!date) throw new Error('التاريخ مطلوب');
  const info = db.get().prepare(
    `INSERT INTO correction_requests (employee_id, shift, date, requested_ci, requested_co, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`
  ).run(employee_id, Number(shift) || 1, date, requested_ci, requested_co || null, notes || '');
  return { id: info.lastInsertRowid };
}

async function correctionRequestListByEmployee({ employee_id }) {
  return db.get().prepare(
    `SELECT * FROM correction_requests WHERE employee_id = ? ORDER BY created_at DESC LIMIT 50`
  ).all(employee_id);
}

async function correctionRequestListByEmployeeId({ employee_id }) {
  return db.get().prepare(
    `SELECT cr.*, e.name AS employee_name FROM correction_requests cr
     JOIN employees e ON e.id = cr.employee_id
     WHERE cr.employee_id = ?
     ORDER BY cr.created_at DESC LIMIT 100`
  ).all(employee_id);
}

async function correctionRequestApply({ id, check_in, check_out }) {
  if (!id) throw new Error('المعرف مطلوب');
  const req = db.get().prepare(`SELECT * FROM correction_requests WHERE id = ?`).get(id);
  if (!req) throw new Error('الطلب غير موجود');
  const ci = check_in || req.requested_ci;
  const co = check_out || req.requested_co;
  if (!ci) throw new Error('وقت الحضور مطلوب');

  // ── تصحيح الوقت: بدّل (override) الفترة المختارة بالكامل ──
  // بخلاف attendanceManagerEntry اللي بتعمل merge، هنا لازم نبدل القيم فعلياً
  const existing = db.get().prepare(
    `SELECT * FROM attendance WHERE employee_id=? AND date=? AND shift=?`
  ).get(req.employee_id, Number(req.shift), req.date);

  if (existing) {
    // بدّل الفترة الموجودة بالأوقات الجديدة المعتمدة من المدير
    db.get().prepare(
      `UPDATE attendance SET check_in=?, check_out=?, source='manager', notes=? WHERE id=?`
    ).run(ci, co || null, req.notes || '', existing.id);
  } else {
    // لا يوجد سجل — أنشئ واحد جديد
    db.get().prepare(
      `INSERT INTO attendance (employee_id, shift, date, check_in, check_out, source, notes)
       VALUES (?, ?, ?, ?, ?, 'manager', ?)`
    ).run(req.employee_id, Number(req.shift), req.date, ci, co || null, req.notes || '');
  }

  db.get().prepare(`UPDATE correction_requests SET status = 'approved' WHERE id = ?`).run(id);
  return { ok: true };
}

async function correctionRequestReject({ id }) {
  if (!id) throw new Error('المعرف مطلوب');
  db.get().prepare(`UPDATE correction_requests SET status = 'rejected' WHERE id = ?`).run(id);
  return { ok: true };
}

/* ---------- messages ---------- */
async function messagesCreate({ employee_id, body }) {
  if (!employee_id) throw new Error('الموظف مطلوب');
  if (!body || !body.trim()) throw new Error('الرسالة فارغة');
  const info = db.get().prepare(
    `INSERT INTO messages (employee_id, body) VALUES (?, ?)`
  ).run(employee_id, body.trim());
  return { id: info.lastInsertRowid };
}

async function messagesListByEmployee({ employee_id, limit = 200 }) {
  return db.get().prepare(
    `SELECT * FROM messages WHERE employee_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`
  ).all(employee_id, limit);
}

async function messagesMarkRead({ id }) {
  db.get().prepare(
    `UPDATE messages SET read = 1, read_at = COALESCE(read_at, ?) WHERE id = ?`
  ).run(nowISO(), id);
  return { ok: true };
}

/* ---------- revenues ---------- */
async function revenuesCreate({ employee_id, cash, credit, shift, date, notes }) {
  if (!employee_id) throw new Error('الموظف مطلوب');
  const c  = Number(cash)   || 0;
  const cr = Number(credit) || 0;
  const amount = c + cr;
  // Don't save empty revenue records (both cash and credit are 0)
  if (amount === 0) {
    return { id: null, skipped: true };
  }
  const s  = Number(shift) || 1;
  const d  = date || todayISO();
  // Upsert: one record per employee+date+shift
  const existing = db.get().prepare(
    `SELECT id FROM revenues WHERE employee_id=? AND date=? AND shift=?`
  ).get(employee_id, d, s);
  if (existing) {
    db.get().prepare(
      `UPDATE revenues SET cash=?, credit=?, amount=?, notes=? WHERE id=?`
    ).run(c, cr, amount, notes || '', existing.id);
    return { id: existing.id };
  }
  const info = db.get().prepare(
    `INSERT INTO revenues (employee_id, cash, credit, amount, shift, date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(employee_id, c, cr, amount, s, d, notes || '');
  return { id: info.lastInsertRowid };
}

async function revenuesListByEmployee({ employee_id, limit = 200 }) {
  return db.get().prepare(
    `SELECT * FROM revenues WHERE employee_id = ? ORDER BY date DESC, shift ASC, id DESC LIMIT ?`
  ).all(employee_id, limit);
}

async function revenuesDelete({ id }) {
  db.get().prepare(`DELETE FROM revenues WHERE id = ?`).run(id);
  return { ok: true };
}

/* ---------- salary ---------- */
async function salarySummary({ employee_id }) {
  const emp = db.get().prepare(`SELECT * FROM employees WHERE id = ?`).get(employee_id);
  if (!emp) throw new Error('الموظف غير موجود');
  return computeSalary(emp);
}

async function salarySummaryAll() {
  const employees = db.get().prepare(`SELECT * FROM employees`).all();
  return employees.map((e) => ({ employee: e, summary: computeSalary(e) }));
}

/* ---------- policies (points system, NOT money) ---------- */
async function policiesList() {
  return db.get().prepare(`SELECT * FROM policies ORDER BY id DESC`).all();
}

async function policiesCreate({ name, type, points }) {
  if (!name || !name.trim()) throw new Error('الاسم مطلوب');
  if (!['bonus', 'penalty'].includes(type)) throw new Error('النوع غير صحيح');
  const p = Number(points);
  if (isNaN(p) || p <= 0) throw new Error('النقاط يجب أن تكون رقماً موجباً');
  const info = db.get().prepare(
    `INSERT INTO policies (name, type, points) VALUES (?, ?, ?)`
  ).run(name.trim(), type, p);
  return { id: info.lastInsertRowid };
}

async function policiesUpdate({ id, name, type, points }) {
  if (!id) throw new Error('المعرف مطلوب');
  if (!name || !name.trim()) throw new Error('الاسم مطلوب');
  if (!['bonus', 'penalty'].includes(type)) throw new Error('النوع غير صحيح');
  const p = Number(points);
  if (isNaN(p) || p <= 0) throw new Error('النقاط يجب أن تكون رقماً موجباً');
  db.get().prepare(
    `UPDATE policies SET name=?, type=?, points=? WHERE id=?`
  ).run(name.trim(), type, p, id);
  return { ok: true };
}

async function policiesDelete({ id }) {
  if (!id) throw new Error('المعرف مطلوب');
  db.get().prepare(`DELETE FROM policies WHERE id = ?`).run(id);
  return { ok: true };
}

/* ---------- applied policies (per employee) ---------- */
async function appliedPoliciesApply({ employee_id, policy_id, notes, date, points }) {
  if (!employee_id) throw new Error('الموظف مطلوب');
  if (!policy_id) throw new Error('السياسة مطلوبة');
  const policy = db.get().prepare(`SELECT * FROM policies WHERE id = ?`).get(policy_id);
  if (!policy) throw new Error('السياسة غير موجودة');
  const finalPoints = (points && Number(points) > 0) ? Number(points) : policy.points;
  const info = db.get().prepare(
    `INSERT INTO applied_policies (employee_id, policy_id, policy_name, type, points, date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    employee_id,
    policy.id,
    policy.name,
    policy.type,
    finalPoints,
    date || todayISO(),
    notes || ''
  );
  return { id: info.lastInsertRowid };
}

async function appliedPoliciesListByEmployee({ employee_id, limit = 200 }) {
  return db.get().prepare(
    `SELECT * FROM applied_policies WHERE employee_id = ? ORDER BY date DESC, id DESC LIMIT ?`
  ).all(employee_id, limit);
}

async function appliedPoliciesDelete({ id }) {
  if (!id) throw new Error('المعرف مطلوب');
  db.get().prepare(`DELETE FROM applied_policies WHERE id = ?`).run(id);
  return { ok: true };
}

async function appliedPoliciesCreateDirect({ employee_id, points, date, notes }) {
  if (!employee_id) throw new Error('الموظف مطلوب');
  const pts = Number(points);
  if (!pts || pts <= 0) throw new Error('يرجى إدخال عدد نقاط صحيح');
  if (!date) throw new Error('التاريخ مطلوب');
  db.get().prepare(
    `INSERT INTO applied_policies (employee_id, policy_id, policy_name, type, points, date, notes) VALUES (?, NULL, 'خصم مباشر', 'penalty', ?, ?, ?)`
  ).run(employee_id, pts, date, notes || '');
  return { ok: true };
}


  async function appliedPoliciesUpdatePoints({ id, points, notes }) {
    if (!id) throw new Error('المعرف مطلوب');
    if (points === undefined || points === null) throw new Error('النقاط مطلوبة');
    if (notes !== undefined) {
      db.get().prepare('UPDATE applied_policies SET points = ?, notes = ? WHERE id = ?').run(Number(points), notes, id);
    } else {
      db.get().prepare('UPDATE applied_policies SET points = ? WHERE id = ?').run(Number(points), id);
    }
    return { ok: true };
  }

  function totalPointsFor(employee_id) {
  const rows = db.get().prepare(
    `SELECT type, points FROM applied_policies WHERE employee_id = ?`
  ).all(employee_id);
  let bonus = 0, penalty = 0;
  for (const r of rows) {
    if (r.type === 'bonus') bonus += r.points || 0;
    else if (r.type === 'penalty') penalty += r.points || 0;
  }
  return {
    bonus_points: +bonus.toFixed(2),
    penalty_points: +penalty.toFixed(2),
    total_points: +(bonus - penalty).toFixed(2)
  };
}

/* ---------- settings (key/value) ---------- */
function settingGet(key, fallback = '') {
  const r = db.get().prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return r ? r.value : fallback;
}

function settingSet(key, value) {
  db.get().prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

async function settingsGetAll() {
  const rows = db.get().prepare(`SELECT key, value FROM settings`).all();
  const map = {};
  rows.forEach((r) => { map[r.key] = r.value; });
  return {
    pharmacy_daily_hours: Number(map.pharmacy_daily_hours) || 0,
    monthly_incentive_base: Number(map.monthly_incentive_base) || 0,
    manager_role_label: map.manager_role_label || 'مدير',
    employee_role_label: map.employee_role_label || 'موظف',
    _raw: map
  };
}

async function settingsUpdate({ pharmacy_daily_hours, monthly_incentive_base, manager_role_label, employee_role_label }) {
  if (pharmacy_daily_hours !== undefined) {
    const v = Number(pharmacy_daily_hours);
    if (isNaN(v) || v < 0) throw new Error('ساعات العمل اليومية غير صحيحة');
    settingSet('pharmacy_daily_hours', v);
  }
  if (monthly_incentive_base !== undefined) {
    const v = Number(monthly_incentive_base);
    if (isNaN(v) || v < 0) throw new Error('قيمة الحافز الشهري غير صحيحة');
    settingSet('monthly_incentive_base', v);
  }
  if (manager_role_label !== undefined) {
    const v = String(manager_role_label).trim();
    if (!v) throw new Error('تسمية دور المدير لا يمكن أن تكون فارغة');
    settingSet('manager_role_label', v);
  }
  if (employee_role_label !== undefined) {
    const v = String(employee_role_label).trim();
    if (!v) throw new Error('تسمية دور الموظف لا يمكن أن تكون فارغة');
    settingSet('employee_role_label', v);
  }
  return await settingsGetAll();
}

async function settingsSetKey({ key, value }) {
  if (!key) throw new Error('المفتاح مطلوب');
  const v = Number(value);
  if (isNaN(v) || v < 0) throw new Error('القيمة غير صحيحة');
  settingSet(key, v);
  return { ok: true };
}

async function settingsGetKey({ key }) {
  if (!key) throw new Error('المفتاح مطلوب');
  const v = settingGet(key, '0');
  return { key, value: Number(v) || 0 };
}

async function settingsGetMonthBases() {
  const rows = db.get().prepare(`SELECT key, value FROM settings WHERE key LIKE 'incentive_base:%'`).all();
  const map = {};
  rows.forEach((r) => { map[r.key.replace('incentive_base:', '')] = Number(r.value) || 0; });
  return map;
}

/* ---------- incentives summary ---------- */
function daysInCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

async function incentivesSummary() {
  const settings = await settingsGetAll();
  const days = daysInCurrentMonth();
  const monthlyHours = (settings.pharmacy_daily_hours || 0) * days;
  const employees = db.get().prepare(`SELECT * FROM employees ORDER BY id ASC`).all();
  const rows = employees.map((e) => {
    const pct = Number(e.incentive_percentage) || 0;
    const value = (settings.monthly_incentive_base || 0) * pct;
    const points = totalPointsFor(e.id);
    return {
      employee: e,
      incentive_percentage: pct,
      incentive_value: +value.toFixed(2),
      points
    };
  });
  return {
    settings,
    days_in_month: days,
    monthly_hours: +monthlyHours.toFixed(2),
    employees: rows
  };
}

async function employeeSummary({ employee_id }) {
  const emp = db.get().prepare(`SELECT * FROM employees WHERE id = ?`).get(employee_id);
  if (!emp) throw new Error('الموظف غير موجود');
  const settings = await settingsGetAll();
  const points = totalPointsFor(employee_id);
  const pct = Number(emp.incentive_percentage) || 0;
  const incentive_value = +((settings.monthly_incentive_base || 0) * pct).toFixed(2);
  return {
    employee: emp,
    incentive_percentage: pct,
    incentive_base: settings.monthly_incentive_base || 0,
    incentive_value,
    points
  };
}

/* ---------- exit permissions ---------- */
async function exitPermissionsRequest({ employee_id, type, notes }) {
  if (!employee_id) throw new Error('الموظف مطلوب');
  if (!['exit', 'return'].includes(type)) throw new Error('النوع غير صحيح');
  if (type === 'exit' && (!notes || !String(notes).trim())) throw new Error('الملاحظات إلزامية — اكتب سبب الخروج');
  const info = db.get().prepare(
    `INSERT INTO exit_permissions (employee_id, type, notes) VALUES (?, ?, ?)`
  ).run(employee_id, type, notes || '');
  return { id: info.lastInsertRowid };
}

async function exitPermissionsListByEmployee({ employee_id, limit = 100 }) {
  return db.get().prepare(
    `SELECT * FROM exit_permissions WHERE employee_id = ?
     ORDER BY requested_at DESC LIMIT ?`
  ).all(employee_id, limit);
}

async function exitPermissionsListAll({ limit = 300 }) {
  return db.get().prepare(
    `SELECT ep.*, e.name AS employee_name
     FROM exit_permissions ep
     JOIN employees e ON e.id = ep.employee_id
     ORDER BY ep.requested_at DESC LIMIT ?`
  ).all(limit);
}

async function exitPermissionsListToday() {
  const today = todayISO();
  return db.get().prepare(
    `SELECT ep.*, e.name AS employee_name
     FROM exit_permissions ep
     JOIN employees e ON e.id = ep.employee_id
     WHERE substr(ep.requested_at, 1, 10) = ?
     ORDER BY ep.requested_at DESC`
  ).all(today);
}

async function exitPermissionsMarkNoted({ id }) {
  if (!id) throw new Error('المعرف مطلوب');
  db.get().prepare(`UPDATE exit_permissions SET status='noted' WHERE id=?`).run(id);
  return { ok: true };
}

async function exitPermissionsApprove({ id }) {
  if (!id) throw new Error('المعرف مطلوب');

  const perm = db.get().prepare(`SELECT * FROM exit_permissions WHERE id = ?`).get(id);
  if (!perm) throw new Error('الإذن غير موجود');
  if (perm.type !== 'exit') throw new Error('يمكن الموافقة على طلبات الخروج فقط');

  // Find the next matching return request for this employee
  const returnPerm = db.get().prepare(`
    SELECT * FROM exit_permissions
    WHERE employee_id = ? AND type = 'return' AND requested_at > ?
    ORDER BY requested_at ASC LIMIT 1
  `).get(perm.employee_id, perm.requested_at);

  if (!returnPerm) throw new Error('لا يوجد طلب عودة مطابق لهذا الخروج بعد');

  // Calculate hours out
  const exitMs   = new Date(perm.requested_at).getTime();
  const returnMs = new Date(returnPerm.requested_at).getTime();
  const hours    = Math.max(0, (returnMs - exitMs) / (1000 * 60 * 60));

  // Get employee hourly rate and create deduction
  const emp = db.get().prepare(`SELECT * FROM employees WHERE id = ?`).get(perm.employee_id);
  if (!emp) throw new Error('الموظف غير موجود');

  const amount = +(hours * (emp.hourly_rate || 0)).toFixed(2);
  const date   = perm.requested_at ? perm.requested_at.slice(0, 10) : todayISO();

  const tx = db.get().transaction(() => {
    if (amount > 0) {
      db.get().prepare(
        `INSERT INTO salary_adjustments (employee_id, type, amount, reason, date)
         VALUES (?, 'deduction', ?, ?, ?)`
      ).run(perm.employee_id, amount, `خصم إذن خروج: ${hours.toFixed(2)} ساعة`, date);
    }
    db.get().prepare(`UPDATE exit_permissions SET status = 'deducted' WHERE id = ?`).run(perm.id);
    db.get().prepare(`UPDATE exit_permissions SET status = 'deducted' WHERE id = ?`).run(returnPerm.id);
  });
  tx();

  return { ok: true, deducted_amount: amount, hours_out: +hours.toFixed(2) };
}

async function exitPermissionsReject({ id }) {
  if (!id) throw new Error('المعرف مطلوب');

  const perm = db.get().prepare(`SELECT * FROM exit_permissions WHERE id = ?`).get(id);
  if (!perm) throw new Error('الإذن غير موجود');

  const tx = db.get().transaction(() => {
    db.get().prepare(`UPDATE exit_permissions SET status = 'rejected' WHERE id = ?`).run(perm.id);
    // Also reject the linked return if this is an exit
    if (perm.type === 'exit') {
      const returnPerm = db.get().prepare(`
        SELECT * FROM exit_permissions
        WHERE employee_id = ? AND type = 'return' AND requested_at > ?
        ORDER BY requested_at ASC LIMIT 1
      `).get(perm.employee_id, perm.requested_at);
      if (returnPerm) {
        db.get().prepare(`UPDATE exit_permissions SET status = 'not_deducted' WHERE id = ?`).run(returnPerm.id);
      }
    }
  });
  tx();

  return { ok: true };
}

/* ---------- archive ---------- */
function diffHoursLocal(ci, co) {
  if (!ci || !co) return 0;
  const a = new Date(ci).getTime(), b = new Date(co).getTime();
  return (isNaN(a) || isNaN(b) || b <= a) ? 0 : (b - a) / 3600000;
}

async function archiveEmployeeMonth({ employee_id, ym }) {
  if (!employee_id || !ym) throw new Error('بيانات ناقصة');
  const pattern = ym + '%';
  const attendance = db.get().prepare(
    `SELECT * FROM attendance WHERE employee_id = ? AND date LIKE ? ORDER BY date, shift`
  ).all(employee_id, pattern);
  const advances = db.get().prepare(
    `SELECT * FROM advances WHERE employee_id = ? AND date LIKE ? ORDER BY date DESC, id DESC`
  ).all(employee_id, pattern);
  const cleaning = db.get().prepare(
    `SELECT * FROM cleaning WHERE employee_id = ? AND date LIKE ? ORDER BY date DESC`
  ).all(employee_id, pattern);
  const policies = db.get().prepare(
    `SELECT * FROM applied_policies WHERE employee_id = ? AND date LIKE ? ORDER BY date DESC`
  ).all(employee_id, pattern);
  const revenues = db.get().prepare(
    `SELECT * FROM revenues WHERE employee_id = ? AND date LIKE ? ORDER BY date DESC`
  ).all(employee_id, pattern);
  const totalHours    = attendance.reduce((s, r) => s + diffHoursLocal(r.check_in, r.check_out), 0);
  const totalAdvances = advances.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalRevenues = revenues.reduce((s, r) => s + Number(r.amount || 0), 0);
  return {
    attendance, advances, cleaning, policies, revenues,
    totalHours:    +totalHours.toFixed(2),
    totalAdvances: +totalAdvances.toFixed(2),
    totalRevenues: +totalRevenues.toFixed(2)
  };
}

async function archiveAllEmployeesMonth({ ym }) {
  if (!ym) throw new Error('الشهر مطلوب');
  const employees = db.get().prepare(`SELECT * FROM employees ORDER BY name`).all();
  const pattern = ym + '%';
  return employees.map((emp) => {
    const attendance = db.get().prepare(
      `SELECT check_in, check_out FROM attendance WHERE employee_id = ? AND date LIKE ?`
    ).all(emp.id, pattern);
    const advRow = db.get().prepare(
      `SELECT COALESCE(SUM(amount),0) AS total FROM advances WHERE employee_id = ? AND date LIKE ?`
    ).get(emp.id, pattern);
    const revRow = db.get().prepare(
      `SELECT COALESCE(SUM(amount),0) AS total FROM revenues WHERE employee_id = ? AND date LIKE ?`
    ).get(emp.id, pattern);
    const policies = db.get().prepare(
      `SELECT type, points FROM applied_policies WHERE employee_id = ? AND date LIKE ?`
    ).all(emp.id, pattern);
    const totalHours    = attendance.reduce((s, r) => s + diffHoursLocal(r.check_in, r.check_out), 0);
    const bonusPoints   = policies.filter((p) => p.type === 'bonus').reduce((s, p) => s + p.points, 0);
    const penaltyPoints = policies.filter((p) => p.type !== 'bonus').reduce((s, p) => s + p.points, 0);
    return {
      employee:      emp,
      totalHours:    +totalHours.toFixed(2),
      totalAdvances: +(advRow.total || 0).toFixed(2),
      totalRevenues: +(revRow.total || 0).toFixed(2),
      bonusPoints:   +bonusPoints.toFixed(2),
      penaltyPoints: +penaltyPoints.toFixed(2)
    };
  });
}

module.exports = {
  'auth:login': authLogin,
  'auth:changePassword': authChangePassword,
  'auth:resetEmployeeCredentials': authResetEmployeeCredentials,
  'auth:userForEmployee': authUserForEmployee,
  'auth:listAccounts': authListAccounts,
  'employees:list': employeesList,
  'employees:get': employeesGet,
  'employees:create': employeesCreate,
  'employees:update': employeesUpdate,
  'employees:delete': employeesDelete,
  'attendance:checkIn': attendanceCheckIn,
  'attendance:checkOut': attendanceCheckOut,
  'attendance:listByEmployee': attendanceListByEmployee,
  'attendance:today': attendanceToday,
  'attendance:openShifts': attendanceOpenShifts,
  'attendance:managerEntry': attendanceManagerEntry,
  'attendance:delete': attendanceDelete,
  'attendance:update': attendanceUpdate,
  'cleaning:create': cleaningCreate,
  'cleaning:listByEmployee': cleaningListByEmployee,
  'cleaning:monthly': cleaningMonthly,
  'adjustments:create': adjustmentsCreate,
  'adjustments:listByEmployee': adjustmentsListByEmployee,
  'adjustments:delete': adjustmentsDelete,
  'advances:create': advancesCreate,
  'advances:listByEmployee': advancesListByEmployee,
  'advances:delete': advancesDelete,
  'correctionRequests:create': correctionRequestCreate,
  'correctionRequests:listByEmployee': correctionRequestListByEmployee,
  'correctionRequests:listByEmployeeId': correctionRequestListByEmployeeId,
  'correctionRequests:apply': correctionRequestApply,
  'correctionRequests:reject': correctionRequestReject,
  'messages:create': messagesCreate,
  'messages:listByEmployee': messagesListByEmployee,
  'messages:markRead': messagesMarkRead,
  'revenues:create': revenuesCreate,
  'revenues:listByEmployee': revenuesListByEmployee,
  'revenues:delete': revenuesDelete,
  'salary:summary': salarySummary,
  'salary:summaryAll': salarySummaryAll,
  // policies (points)
  'policies:list': policiesList,
  'policies:create': policiesCreate,
  'policies:update': policiesUpdate,
  'policies:delete': policiesDelete,
  'appliedPolicies:apply': appliedPoliciesApply,
  'appliedPolicies:listByEmployee': appliedPoliciesListByEmployee,
  'appliedPolicies:delete': appliedPoliciesDelete,
  'appliedPolicies:updatePoints': appliedPoliciesUpdatePoints,
  'appliedPolicies:createDirect': appliedPoliciesCreateDirect,
  // settings + incentives
  'settings:get': settingsGetAll,
  'settings:update': settingsUpdate,
  'settings:setKey': settingsSetKey,
  'settings:getKey': settingsGetKey,
  'settings:getMonthBases': settingsGetMonthBases,
  'incentives:summary': incentivesSummary,
  'employee:summary': employeeSummary,
  // exit permissions
  'exitPermissions:request': exitPermissionsRequest,
  'exitPermissions:listByEmployee': exitPermissionsListByEmployee,
  'exitPermissions:listAll': exitPermissionsListAll,
  'exitPermissions:listToday': exitPermissionsListToday,
  'exitPermissions:markNoted': exitPermissionsMarkNoted,
  'exitPermissions:approve': exitPermissionsApprove,
  'exitPermissions:reject': exitPermissionsReject,
  // archive
  'archive:employeeMonth': archiveEmployeeMonth,
  'archive:allEmployeesMonth': archiveAllEmployeesMonth
};
