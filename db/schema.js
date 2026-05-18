const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT,
  hourly_rate REAL NOT NULL DEFAULT 0,
  base_salary REAL NOT NULL DEFAULT 0,
  incentive_percentage REAL NOT NULL DEFAULT 0,
  check_in_time TEXT NOT NULL DEFAULT '09:00',
  has_incentive INTEGER NOT NULL DEFAULT 1,
  has_fixed_checkin INTEGER NOT NULL DEFAULT 1,
  visible_mgr_tabs TEXT DEFAULT NULL,
  visible_emp_tabs TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('manager','employee')),
  employee_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_users_emp ON users(employee_id);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  shift INTEGER NOT NULL,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  source TEXT NOT NULL DEFAULT 'self',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_attendance_emp ON attendance(employee_id, date);

CREATE TABLE IF NOT EXISTS cleaning (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cleaning_emp ON cleaning(employee_id, date);

CREATE TABLE IF NOT EXISTS salary_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  reason TEXT,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_adj_emp ON salary_adjustments(employee_id, date);

CREATE TABLE IF NOT EXISTS advances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  notes TEXT,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_adv_emp ON advances(employee_id, date);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  read_at TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_msg_emp ON messages(employee_id, created_at);

CREATE TABLE IF NOT EXISTS revenues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_rev_emp ON revenues(employee_id, date);

CREATE TABLE IF NOT EXISTS policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('bonus','penalty')),
  points REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applied_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  policy_id INTEGER,
  policy_name TEXT NOT NULL,
  type TEXT NOT NULL,
  points REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_applied_emp ON applied_policies(employee_id, date);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS correction_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  shift INTEGER NOT NULL DEFAULT 1,
  date TEXT NOT NULL,
  requested_ci TEXT,
  requested_co TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_correction_emp ON correction_requests(employee_id, created_at);

CREATE TABLE IF NOT EXISTS exit_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('exit','return')),
  notes TEXT,
  requested_at TEXT DEFAULT (datetime('now','localtime')),
  status TEXT NOT NULL DEFAULT 'pending',
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_exit_perm_emp ON exit_permissions(employee_id, requested_at);
`;

function ensureColumn(db, table, column, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}

function apply(db) {
  db.exec(SCHEMA_SQL);
  ensureColumn(db, 'employees', 'incentive_percentage', 'REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'employees', 'check_in_time', "TEXT NOT NULL DEFAULT '09:00'");
  ensureColumn(db, 'employees', 'has_incentive', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'employees', 'has_fixed_checkin', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'employees', 'visible_mgr_tabs', 'TEXT DEFAULT NULL');
  ensureColumn(db, 'employees', 'visible_emp_tabs', 'TEXT DEFAULT NULL');
  ensureColumn(db, 'revenues', 'cash',   'REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'revenues', 'credit', 'REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'revenues', 'shift',  'INTEGER NOT NULL DEFAULT 1');
}

module.exports = { apply };
