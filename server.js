// lowend: раздаёт index.html и ведёт онлайн, роли и админку через WebSocket.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const OWNER_KEY = process.env.OWNER_KEY || '';
const ROLES_FILE = path.join(__dirname, 'roles.json');
let roles = {}; // хэш токена -> 'owner' | 'admin'
try { roles = JSON.parse(fs.readFileSync(ROLES_FILE, 'utf8')); } catch (e) {}
const saveRoles = () => { try { fs.writeFileSync(ROLES_FILE, JSON.stringify(roles)); } catch (e) {} };

const server = http.createServer((req, res) => {
  if (req.url === '/health') return res.end('ok');
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) { res.writeHead(500); return res.end('index.html not found'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const clients = new Map(); // ws -> { h, id, name, since }
const banned = new Map();  // хэш -> до какого времени бан
const roleOf = h => roles[h] || 'user';
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const online = () => new Set([...clients.values()].map(c => c.h)).size;

function broadcast() {
  const now = Date.now(), n = online();
  const list = [...clients.values()].map(c => ({ id: c.id, name: c.name, role: roleOf(c.h), age: Math.round((now - c.since) / 1000) }));
  for (const w of wss.clients) send(w, { t: 'count', n });
  for (const [ws, c] of clients) {
    const role = roleOf(c.h);
    send(ws, { t: 'me', id: c.id, role, name: c.name });
    if (role !== 'user') send(ws, { t: 'users', list });
  }
}

wss.on('connection', ws => {
  ws.alive = true; ws.fails = 0;
  ws.on('pong', () => { ws.alive = true; });
  send(ws, { t: 'count', n: online() });

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const c = clients.get(ws);

    if (m.t === 'hello') {
      if (typeof m.token !== 'string' || m.token.length < 20 || m.token.length > 200) return;
      const h = hash(m.token);
      if ((banned.get(h) || 0) > Date.now()) { send(ws, { t: 'kicked' }); return ws.close(); }
      const id = h.slice(0, 6);
      const name = String(m.name || '').replace(/[<>]/g, '').trim().slice(0, 20) || 'гость-' + id.slice(0, 3);
      clients.set(ws, { h, id, name, since: Date.now() });
      return broadcast();
    }
    if (!c) return;
    const role = roleOf(c.h);

    if (m.t === 'auth') { // вход владельца по ключу из переменной OWNER_KEY
      if (!OWNER_KEY || ws.fails >= 5) return send(ws, { t: 'authfail' });
      if (crypto.timingSafeEqual(Buffer.from(hash(m.key)), Buffer.from(hash(OWNER_KEY)))) { roles[c.h] = 'owner'; saveRoles(); return broadcast(); }
      ws.fails++; return send(ws, { t: 'authfail' });
    }
    if (role === 'user') return; // дальше только админы и владелец

    const target = () => [...clients.entries()].find(([, x]) => x.id === m.id);

    if (m.t === 'notice') {
      const text = String(m.text || '').trim().slice(0, 200);
      if (text) for (const w of wss.clients) send(w, { t: 'notice', text, from: c.name });
    } else if (m.t === 'role' && role === 'owner') {
      const tg = target(); if (!tg || roleOf(tg[1].h) === 'owner') return;
      if (m.role === 'admin') roles[tg[1].h] = 'admin'; else delete roles[tg[1].h];
      saveRoles(); broadcast();
    } else if (m.t === 'kick') {
      const tg = target(); if (!tg) return;
      const th = tg[1].h, tr = roleOf(th);
      if (th === c.h || tr === 'owner' || (tr === 'admin' && role !== 'owner')) return;
      banned.set(th, Date.now() + 10 * 60 * 1000);
      for (const [w, x] of clients) if (x.h === th) { send(w, { t: 'kicked' }); w.close(); }
    }
  });

  ws.on('close', () => { clients.delete(ws); broadcast(); });
});

setInterval(() => wss.clients.forEach(w => { if (!w.alive) return w.terminate(); w.alive = false; w.ping(); }), 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log('lowend on :' + PORT));
