// server.js
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { init } = require('./db');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_this_in_prod';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 }
}));

let db;
init().then(d => db = d).catch(err => { console.error(err); process.exit(1); });

/* ---- Middleware ---- */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (req.session && req.session.user && roles.includes(req.session.user.role)) return next();
    return res.status(403).json({ error: 'Forbidden' });
  };
}

/* ---- Auth routes ---- */
app.post('/api/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Missing fields' });
  const hash = await bcrypt.hash(password, 10);
  const id = uuidv4();
  const stmt = db.prepare('INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)');
  stmt.run(id, name, email, hash, role, function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already registered' });
      return res.status(500).json({ error: 'DB error' });
    }
    req.session.user = { id, name, email, role };
    res.json({ ok: true, user: { id, name, email, role } });
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.user = { id: row.id, name: row.name, email: row.email, role: row.role };
    res.json({ ok: true, user: req.session.user });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session || !req.session.user) return res.json({ user: null });
  res.json({ user: req.session.user });
});

/* ---- Student CRUD ---- */

/* Create student (admin or teacher) */
app.post('/api/students', requireAuth, requireRole('admin', 'teacher'), (req, res) => {
  const { name, roll, class: className, section, notes } = req.body;
  if (!name || !roll || !className || !section) return res.status(400).json({ error: 'Missing fields' });
  const id = uuidv4();
  const stmt = db.prepare('INSERT INTO students (id,name,roll,class,section,notes) VALUES (?,?,?,?,?,?)');
  stmt.run(id, name, roll, className, section, notes || '', function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Duplicate student (roll + class + section)' });
      return res.status(500).json({ error: 'DB error' });
    }
    res.json({ ok: true, id });
  });
});

/* Read students (all roles can view) */
app.get('/api/students', requireAuth, (req, res) => {
  const q = req.query.q || '';
  const cls = req.query.class || '';
  const section = req.query.section || '';
  let sql = 'SELECT * FROM students WHERE 1=1';
  const params = [];
  if (q) { sql += ' AND (name LIKE ? OR roll LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (cls) { sql += ' AND class = ?'; params.push(cls); }
  if (section) { sql += ' AND section = ?'; params.push(section); }
  db.all(sql + ' ORDER BY class, section, roll', params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ students: rows });
  });
});

/* Update student (admin/teacher) */
app.put('/api/students/:id', requireAuth, requireRole('admin','teacher'), (req, res) => {
  const id = req.params.id;
  const { name, roll, class: className, section, notes, attendance } = req.body;
  const stmt = db.prepare('UPDATE students SET name=?, roll=?, class=?, section=?, notes=?, attendance=? WHERE id=?');
  stmt.run(name, roll, className, section, notes || '', attendance || 0, id, function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Duplicate student (roll + class + section)' });
      return res.status(500).json({ error: 'DB error' });
    }
    if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  });
});

/* Delete student (admin only) */
app.delete('/api/students/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM students WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  });
});

/* ---- Helper: create default admin if none ---- */
function createDefaultAdmin() {
  db.get('SELECT COUNT(*) as cnt FROM users', async (err, row) => {
    if (err) return console.error(err);
    if (row && row.cnt === 0) {
      const id = uuidv4();
      const hash = await bcrypt.hash('admin123', 10);
      db.run('INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)',
        [id, 'Administrator', 'admin@example.com', hash, 'admin'], (e) => {
          if (e) console.error('Failed creating default admin:', e);
          else console.log('Default admin created: admin@example.com / admin123');
        });
    }
  });
}

/* ---- Start server after DB is ready ---- */
const startServer = () => {
  createDefaultAdmin();
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
  });
};

setTimeout(() => {
  if (!db) { console.error('DB not ready'); process.exit(1); }
  startServer();
}, 500);
