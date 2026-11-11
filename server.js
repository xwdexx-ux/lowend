// lowend: раздаёт index.html и ведёт онлайн, роли и админку через WebSocket.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const OWNER_KEY = process.env.OWNER_KEY || '';
const ROLES_FILE = path.join(__dirname, 'roles.json');
let roles = {}; // хэш токена -> 'owner' | 'admin'
try { roles = JSON.parse(fs.readFileSync(ROLES_FILE, 'utf8')); } catch (e) {}
const saveRoles = () => { try { fs.writeFileSync(ROLES_FILE, JSON.stringify(roles)); } catch (e) {} };

const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const SYS = 'Ты помощник видеостудии сайта lowend. Верни ТОЛЬКО JSON без пояснений и без markdown с полями: ' +
  'text (строка до 150 символов, \\n для переноса), font (old|thin|sans|display|mono|serif; old это стиль старого видео пользователя: узкий шрифт, строки вплотную), resolution (одно из: 1022x576, 1280x720, 1920x1080, 720x1280, 1080x1920, 1080x1080; в current оно называется res; 1022x576 это размер по умолчанию, 16:9), ' +
  'duration (секунды, число от 5 до 300), fade (секунды плавного появления текста из темноты, 0-10), track (точное название из savedTracks или null), color (hex текста), bg (hex фона), progress (true|false). ' +
  'Поля, которые пользователь не просил менять, оставляй такими же, как в current.';
const aiHits = new Map();
function studioAI(req, res, h) {
  const out = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const GKEY = process.env.GEMINI_API_KEY, AKEY = process.env.ANTHROPIC_API_KEY;
  if (!GKEY && !AKEY) return out(501, { error: 'ИИ не подключён: добавь на сервере GEMINI_API_KEY (бесплатно).' });
  const hits = (aiHits.get(h) || []).filter(t => Date.now() - t < 3600000);
  if (hits.length >= 20) return out(429, { error: 'Лимит: 20 запросов ИИ в час.' });
  aiHits.set(h, [...hits, Date.now()]);
  let body = ''; req.on('data', d => { body += d; if (body.length > 8000) req.destroy(); });
  req.on('end', async () => {
    try {
      const b = JSON.parse(body);
      const user = JSON.stringify({ request: String(b.prompt).slice(0, 500), savedTracks: b.tracks, current: b.current });
      let text;
      if (GKEY) { // Gemini (есть бесплатный тариф)
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': GKEY },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: SYS }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json' } })
        });
        const j = await r.json();
        text = ((j.candidates || [])[0]?.content?.parts || []).map(p => p.text || '').join('');
      } else { // Claude (платный)
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': AKEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 400, system: SYS, messages: [{ role: 'user', content: user }] })
        });
        const j = await r.json();
        text = (j.content || []).map(c => c.text || '').join('');
      }
      text = text.replace(/```json|```/g, '').trim();
      out(200, JSON.parse(text));
    } catch (e) { out(500, { error: 'ИИ не смог обработать запрос.' }); }
  });
}

const APP_FILES = { '/manifest.webmanifest': 'application/manifest+json', '/sw.js': 'application/javascript; charset=utf-8',
  '/icon-192.png': 'image/png', '/icon-512.png': 'image/png', '/apple-touch-icon.png': 'image/png' };
const server = http.createServer((req, res) => {
  if (req.url === '/health') return res.end('ok');
  const staff = ['owner', 'admin'].includes(roles[hash(req.headers['x-token'] || '')]); // только админы и владелец
  if (req.url === '/studio.js' || req.url === '/api/studio-ai') {
    if (!staff) { res.writeHead(403); return res.end('forbidden'); }
    if (req.url === '/api/studio-ai' && req.method === 'POST') return studioAI(req, res, hash(req.headers['x-token']));
    return fs.readFile(path.join(__dirname, 'studio.js'), (err, data) => {
      if (err) { res.writeHead(500); return res.end('studio.js not found'); }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  }
  const file = req.url.split('?')[0], type = APP_FILES[file];
  if (type) return fs.readFile(path.join(__dirname, file.slice(1)), (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': file === '/sw.js' ? 'no-cache' : 'public, max-age=86400' });
    res.end(data);
  });
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) { res.writeHead(500); return res.end('index.html not found'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
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
