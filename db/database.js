const path = require('path');
const { app } = require('electron');
const Database = require('better-sqlite3');
const schema = require('./schema');
const auth = require('./auth');

let db;

function init() {
  const dbPath = path.join(app.getPath('userData'), 'attendance.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  schema.apply(db);
  seedDefaultManager();
  return db;
}

function seedDefaultManager() {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'manager'`).get();
  if (row.c > 0) return;
  const { hash, salt } = auth.hashPassword('admin123');
  db.prepare(
    `INSERT INTO users (username, password_hash, password_salt, role) VALUES (?, ?, ?, 'manager')`
  ).run('admin', hash, salt);
}

function get() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function close() {
  if (db) { try { db.close(); } catch (_) {} db = null; }
}

function reinit() {
  close();
  return init();
}

module.exports = { init, get, close, reinit };
