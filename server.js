const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();

const app = express(); 
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });
const DB_FILE = './data.db';
const db = new sqlite3.Database(DB_FILE);

// Initialize database tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    owner_id INTEGER,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    file_id INTEGER,
    FOREIGN KEY (file_id) REFERENCES files(id)
  )`);
});

// Middleware - check login token
function authMiddleware(req, res, next) {
  const token = req.headers.authorization || req.query.token;
  if (!token) return res.status(401).json({ message: 'Please log in first' });

  db.get('SELECT user_id FROM sessions WHERE token = ?', [token], (err, row) => {
    if (err || !row) return res.status(401).json({ message: 'Invalid session token' });
    req.userId = row.user_id;
    next();
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// User Authentication Routes
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], function (err) {
    if (err) return res.status(400).json({ message: 'Username already exists' });
    res.json({ message: 'Registration successful' });
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT id FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
    if (!user) return res.status(401).json({ message: 'Login failed' });

    const token = uuidv4();
    db.run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', [token, user.id], (err) => {
      if (err) return res.status(500).json({ message: 'Failed to create session' });
      res.json({ token });
    });
  });
});

app.get('/api/me', authMiddleware, (req, res) => {
  db.get('SELECT username FROM users WHERE id = ?', [req.userId], (err, row) => {
    if (!row) return res.status(404).json({ message: 'User not found' });
    res.json({ username: row.username });
  });
});

// File Operations
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  const storedName = req.file.filename;
  const filename = req.file.originalname;

  db.run(
    'INSERT INTO files (filename, stored_name, owner_id) VALUES (?, ?, ?)',
    [filename, storedName, req.userId],
    (err) => {
      if (err) return res.status(500).json({ message: 'File upload failed' });
      res.json({ message: 'File uploaded successfully' });
    }
  );
});

app.get('/api/files', authMiddleware, (req, res) => {
  db.all(`
    SELECT files.id, files.filename, files.stored_name, users.username AS owner
    FROM files
    JOIN users ON files.owner_id = users.id
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to retrieve files' });
    const files = rows.map(row => ({
      id: row.stored_name,
      filename: row.filename,
      owner: row.owner
    }));
    res.json(files);
  });
});

app.get('/api/read/:id', authMiddleware, (req, res) => {
  const fileId = req.params.id;

  db.get('SELECT stored_name FROM files WHERE stored_name = ? AND owner_id = ?', [fileId, req.userId], (err, file) => {
    if (!file) return res.status(403).send('Permission denied');
    const content = fs.readFileSync(path.join('uploads', fileId), 'utf-8');
    res.send(content);
  });
});

app.delete('/api/delete/:id', authMiddleware, (req, res) => {
  const fileId = req.params.id;

  db.get('SELECT owner_id FROM files WHERE stored_name = ?', [fileId], (err, file) => {
    if (!file || file.owner_id !== req.userId) {
      return res.status(403).json({ message: 'You do not have permission to delete this file' });
    }

    db.run('DELETE FROM files WHERE stored_name = ?', [fileId], (err) => {
      if (err) return res.status(500).json({ message: 'Failed to delete file' });

      const filePath = path.join('uploads', fileId);
      fs.unlink(filePath, () => res.json({ message: 'File deleted' }));
    });
  });
});

app.get('/api/download/:id', authMiddleware, (req, res) => {
  const fileId = req.params.id;

  db.get('SELECT filename, owner_id FROM files WHERE stored_name = ?', [fileId], (err, file) => {
    if (!file) return res.status(404).json({ message: 'File not found' });

    if (file.owner_id !== req.userId) {
      return res.status(403).json({ message: 'Only the file owner can download this file' });
    }

    res.download(path.join('uploads', fileId), file.filename);
  });
});

// Share Operations
app.post('/api/share/:id', authMiddleware, (req, res) => {
  const fileId = req.params.id;

  db.get('SELECT id, owner_id FROM files WHERE stored_name = ?', [fileId], (err, file) => {
    if (!file || file.owner_id !== req.userId) {
      return res.status(403).json({ message: 'Only the file owner can share this file' });
    }

    const shareId = uuidv4();
    db.run('INSERT INTO shares (id, file_id) VALUES (?, ?)', [shareId, file.id], (err) => {
      if (err) return res.status(500).json({ message: 'Failed to create share link' });
      res.json({ shareId });
    });
  });
});

app.get('/api/share/:shareId', (req, res) => {
  const shareId = req.params.shareId;

  db.get(`
    SELECT files.filename, files.stored_name FROM shares
    JOIN files ON shares.file_id = files.id
    WHERE shares.id = ?`,
    [shareId],
    (err, row) => {
      if (!row) return res.status(404).send('Invalid share link');

      const content = fs.readFileSync(path.join('uploads', row.stored_name), 'utf-8');
      res.send(content);
    }
  );
});

app.get('/api/share-download/:shareId', (req, res) => {
  const shareId = req.params.shareId;

  db.get(`
    SELECT files.filename, files.stored_name
    FROM shares
    JOIN files ON shares.file_id = files.id
    WHERE shares.id = ?
  `, [shareId], (err, file) => {
    if (!file) return res.status(404).json({ message: 'Invalid share link' });

    const filePath = path.join('uploads', file.stored_name);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.download(filePath, file.filename);
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});