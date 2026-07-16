/* 本地全栈知识管理系统：Node 内置 HTTP + SQLite，无需额外安装依赖。 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const db = new DatabaseSync(path.join(ROOT, 'knowledge-system.sqlite'));

db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '📚',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notebooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notebook_id INTEGER NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL DEFAULT '',
    options_json TEXT NOT NULL DEFAULT '[]',
    formula TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    difficulty INTEGER NOT NULL DEFAULT 2,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reviews (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    last_reviewed_at TEXT,
    PRIMARY KEY (user_id, item_id)
  );
`);

const now = () => new Date().toISOString();
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
const error = (res, status, message) => json(res, status, { error: message });
const hashPassword = password => { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`; };
const verifyPassword = (password, stored) => { const [salt, hash] = String(stored).split(':'); const candidate = crypto.scryptSync(password, salt, 64).toString('hex'); return hash && crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex')); };
const publicUser = user => ({ id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar });
const createToken = userId => { const token = crypto.randomBytes(32).toString('hex'); const expiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(); db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(token, userId, expiry); return token; };
const clean = value => String(value ?? '').trim();

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let content = ''; let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > 2 * 1024 * 1024) { reject(new Error('请求内容过大')); req.destroy(); } else content += chunk; });
    req.on('end', () => { try { resolve(content ? JSON.parse(content) : {}); } catch { reject(new Error('请求格式无效')); } });
    req.on('error', reject);
  });
}
function auth(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?`).get(token, now());
  return row ? { user: row, token } : null;
}
function requireAuth(req, res) { const session = auth(req); if (!session) { error(res, 401, '请先登录。'); return null; } return session; }
function ownBook(userId, bookId) { return db.prepare('SELECT * FROM notebooks WHERE id=? AND user_id=?').get(Number(bookId), userId); }
function ownItem(userId, itemId) { return db.prepare('SELECT * FROM items WHERE id=? AND user_id=?').get(Number(itemId), userId); }
function itemView(row) { return { ...row, options: JSON.parse(row.options_json || '[]') }; }
function defaultBooks(userId) {
  const stamp = now();
  db.prepare('INSERT INTO notebooks(user_id,name,description,created_at) VALUES(?,?,?,?)').run(userId, '我的复习本', '用于日常知识点与词汇复习', stamp);
  db.prepare('INSERT INTO notebooks(user_id,name,description,created_at) VALUES(?,?,?,?)').run(userId, '错题本', '用于重点复习与易错内容', stamp);
}
function listBooks(userId) {
  return db.prepare(`SELECT n.*, COUNT(i.id) AS item_count FROM notebooks n LEFT JOIN items i ON i.notebook_id=n.id WHERE n.user_id=? GROUP BY n.id ORDER BY n.created_at ASC`).all(userId);
}
function normalizeEntry(entry, mode) {
  const type = ['knowledge', 'quick', 'mcq', 'formula', 'math'].includes(entry.type) ? entry.type : mode;
  const prompt = clean(entry.prompt);
  const answer = clean(entry.answer);
  const options = Array.isArray(entry.options) ? entry.options.map(clean).filter(Boolean).slice(0, 8) : [];
  return { type, prompt, answer, options, formula: clean(entry.formula), tags: clean(entry.tags), difficulty: Math.min(5, Math.max(1, Number(entry.difficulty) || 2)) };
}
function insertItem(userId, bookId, entry) {
  const value = normalizeEntry(entry, 'knowledge');
  if (!value.prompt) return null;
  const stamp = now();
  const result = db.prepare(`INSERT INTO items(user_id,notebook_id,type,prompt,answer,options_json,formula,tags,difficulty,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(userId, bookId, value.type, value.prompt, value.answer, JSON.stringify(value.options), value.formula, value.tags, value.difficulty, stamp, stamp);
  return ownItem(userId, result.lastInsertRowid);
}

async function api(req, res, url) {
  const { pathname } = url;
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const body = await parseBody(req); const username = clean(body.username); const password = String(body.password || ''); const nickname = clean(body.nickname) || username;
    if (username.length < 2 || username.length > 30) return error(res, 400, '账号长度应为 2 到 30 个字符。');
    if (password.length < 6) return error(res, 400, '密码至少需要 6 位。');
    try {
      const result = db.prepare('INSERT INTO users(username,password_hash,nickname,avatar,created_at) VALUES(?,?,?,?,?)').run(username, hashPassword(password), nickname.slice(0, 30), '📚', now());
      defaultBooks(Number(result.lastInsertRowid)); const user = db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid); return json(res, 201, { token: createToken(user.id), user: publicUser(user) });
    } catch { return error(res, 409, '该账号已存在。'); }
  }
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await parseBody(req); const user = db.prepare('SELECT * FROM users WHERE username=?').get(clean(body.username));
    if (!user || !verifyPassword(String(body.password || ''), user.password_hash)) return error(res, 401, '账号或密码错误。');
    return json(res, 200, { token: createToken(user.id), user: publicUser(user) });
  }
  if (req.method === 'POST' && pathname === '/api/auth/logout') { const session = auth(req); if (session) db.prepare('DELETE FROM sessions WHERE token=?').run(session.token); return json(res, 200, { ok: true }); }

  const session = requireAuth(req, res); if (!session) return;
  const userId = session.user.id;
  if (req.method === 'GET' && pathname === '/api/auth/me') return json(res, 200, { user: publicUser(session.user) });
  if (req.method === 'PUT' && pathname === '/api/profile') {
    const body = await parseBody(req); const nickname = clean(body.nickname).slice(0, 30); const avatar = clean(body.avatar).slice(0, 300);
    if (!nickname) return error(res, 400, '昵称不能为空。');
    db.prepare('UPDATE users SET nickname=?, avatar=? WHERE id=?').run(nickname, avatar || '📚', userId);
    return json(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(userId)) });
  }
  if (req.method === 'GET' && pathname === '/api/dashboard') {
    const stats = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN type='mcq' THEN 1 ELSE 0 END) AS mcq, SUM(CASE WHEN type IN ('formula','math') THEN 1 ELSE 0 END) AS math FROM items WHERE user_id=?`).get(userId);
    return json(res, 200, { books: listBooks(userId), stats: { total: stats.total || 0, mcq: stats.mcq || 0, math: stats.math || 0 } });
  }
  if (req.method === 'GET' && pathname === '/api/notebooks') return json(res, 200, { books: listBooks(userId) });
  if (req.method === 'POST' && pathname === '/api/notebooks') {
    const body = await parseBody(req); const name = clean(body.name).slice(0, 40); if (!name) return error(res, 400, '复习本名称不能为空。');
    const result = db.prepare('INSERT INTO notebooks(user_id,name,description,created_at) VALUES(?,?,?,?)').run(userId, name, clean(body.description).slice(0, 100), now());
    return json(res, 201, { book: ownBook(userId, result.lastInsertRowid) });
  }
  const bookMatch = pathname.match(/^\/api\/notebooks\/(\d+)(?:\/(items|bulk|study))?$/);
  if (bookMatch) {
    const book = ownBook(userId, bookMatch[1]); if (!book) return error(res, 404, '未找到复习本。'); const action = bookMatch[2];
    if (req.method === 'DELETE' && !action) { db.prepare('DELETE FROM notebooks WHERE id=? AND user_id=?').run(book.id, userId); return json(res, 200, { ok: true }); }
    if (req.method === 'GET' && action === 'items') {
      const sort = url.searchParams.get('sort') === 'asc' ? 'ASC' : 'DESC'; const q = clean(url.searchParams.get('q')); const rows = q ? db.prepare(`SELECT * FROM items WHERE user_id=? AND notebook_id=? AND (prompt LIKE ? OR answer LIKE ? OR tags LIKE ?) ORDER BY created_at ${sort}`).all(userId, book.id, `%${q}%`, `%${q}%`, `%${q}%`) : db.prepare(`SELECT * FROM items WHERE user_id=? AND notebook_id=? ORDER BY created_at ${sort}`).all(userId, book.id);
      return json(res, 200, { book, items: rows.map(itemView) });
    }
    if (req.method === 'POST' && action === 'items') { const body = await parseBody(req); const item = insertItem(userId, book.id, body); return item ? json(res, 201, { item: itemView(item) }) : error(res, 400, '题目内容不能为空。'); }
    if (req.method === 'POST' && action === 'bulk') {
      const body = await parseBody(req); const entries = Array.isArray(body.entries) ? body.entries : []; let added = 0; const duplicate = [];
      const seen = new Set(db.prepare('SELECT lower(trim(prompt)) AS prompt FROM items WHERE user_id=? AND notebook_id=?').all(userId, book.id).map(row => row.prompt));
      for (const raw of entries) { const entry = normalizeEntry(raw, body.mode || 'knowledge'); const key = entry.prompt.toLowerCase(); if (!entry.prompt) continue; if (seen.has(key)) { duplicate.push(entry.prompt); continue; } if (insertItem(userId, book.id, entry)) { seen.add(key); added += 1; } }
      return json(res, 201, { added, duplicate });
    }
    if (req.method === 'POST' && action === 'study') {
      const body = await parseBody(req); const count = Math.min(Math.max(Number(body.count) || 20, 1), 200); const rows = db.prepare('SELECT * FROM items WHERE user_id=? AND notebook_id=? ORDER BY RANDOM() LIMIT ?').all(userId, book.id, count);
      return json(res, 200, { book, items: rows.map(itemView) });
    }
  }
  const itemMatch = pathname.match(/^\/api\/items\/(\d+)(?:\/review)?$/);
  if (itemMatch) {
    const item = ownItem(userId, itemMatch[1]); if (!item) return error(res, 404, '未找到内容。');
    if (req.method === 'DELETE') { db.prepare('DELETE FROM items WHERE id=? AND user_id=?').run(item.id, userId); return json(res, 200, { ok: true }); }
    if (req.method === 'PUT' && !pathname.endsWith('/review')) {
      const body = await parseBody(req); const value = normalizeEntry(body, item.type); if (!value.prompt) return error(res, 400, '题目内容不能为空。');
      db.prepare('UPDATE items SET type=?,prompt=?,answer=?,options_json=?,formula=?,tags=?,difficulty=?,updated_at=? WHERE id=? AND user_id=?').run(value.type, value.prompt, value.answer, JSON.stringify(value.options), value.formula, value.tags, value.difficulty, now(), item.id, userId);
      return json(res, 200, { item: itemView(ownItem(userId, item.id)) });
    }
    if (req.method === 'POST' && pathname.endsWith('/review')) {
      const body = await parseBody(req); const correct = Boolean(body.correct); db.prepare(`INSERT INTO reviews(user_id,item_id,correct_count,incorrect_count,last_reviewed_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET correct_count=correct_count+excluded.correct_count,incorrect_count=incorrect_count+excluded.incorrect_count,last_reviewed_at=excluded.last_reviewed_at`).run(userId, item.id, correct ? 1 : 0, correct ? 0 : 1, now());
      return json(res, 200, { ok: true });
    }
  }
  return error(res, 404, '接口不存在。');
}

const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname); if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(ROOT, `.${pathname}`); if (!file.startsWith(ROOT)) return error(res, 403, '禁止访问。');
  fs.stat(file, (statError, stats) => {
    if (statError || !stats.isFile()) return error(res, 404, '文件不存在。');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': pathname.includes('offline-dictionary') ? 'public, max-age=86400' : 'no-cache' }); fs.createReadStream(file).pipe(res);
  });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else if (req.method === 'GET') serveStatic(req, res, url); else error(res, 405, '不支持该请求方式。'); }
  catch (err) { console.error(err); error(res, 500, err.message || '服务器错误。'); }
});
server.listen(PORT, () => console.log(`知识管理系统已启动：http://localhost:${PORT}`));
