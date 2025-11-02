// db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'school.sqlite');

const mkdirp = require('fs').promises;
const fs = require('fs');

async function ensureDataFolder() {
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) await mkdirp.mkdir(dir, { recursive: true });
}

async function init() {
  await ensureDataFolder();
  const db = new sqlite3.Database(dbPath);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','teacher','student'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      roll TEXT NOT NULL,
      class TEXT NOT NULL,
      section TEXT NOT NULL,
      notes TEXT DEFAULT '',
      attendance INTEGER DEFAULT 0,
      UNIQUE(roll, class, section)
    )`);
  });
  return db;
}

module.exports = { init, dbPath };
