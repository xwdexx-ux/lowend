// lowend: раздаёт index.html и ведёт онлайн, роли, админку и премиум (Telegram Stars).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const OWNER_KEY = process.env.OWNER_KEY || '';
const OWNER_NICK = String(process.env.OWNER_NICK || ''); // ник владельца: другие его занять не могут
const normNick = x => String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const ROLES_FILE = path.join(__dirname, 'roles.json');
let roles = {}; // хэш токена -> 'owner' | 'admin'
try { roles = JSON.parse(fs.readFileSync(ROLES_FILE, 'utf8')); } catch (e) {}
const saveRoles = () => { try { fs.writeFileSync(ROLES_FILE, JSON.stringify(roles)); } catch (e) {} };

// Ники: кто первым занял ник, тот им владеет. Хранится в Upstash Redis (бесплатно); без него в файле nicks.json (на Render он сбрасывается)
const UP_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, ''), UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const NICKS_FILE = path.join(__dirname, 'nicks.json');
let nicksLocal = {}; // нормализованный ник -> хэш владельца
try { nicksLocal = JSON.parse(fs.readFileSync(NICKS_FILE, 'utf8')); } catch (e) {}
const redis = async cmd => {
  const r = await fetch(UP_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + UP_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json(); if (j.error) throw new Error(j.error); return j.result;
};
async function claimNick(nn, h) { // true: ник твой, false: занят другим
  if (UP_URL && UP_TOKEN) {
    try {
      if ((await redis(['SET', 'nick:' + nn, h, 'NX'])) !== 'OK' && (await redis(['GET', 'nick:' + nn])) !== h) return false;
      const old = await redis(['GETSET', 'hnick:' + h, nn]);
      if (old && old !== nn) await redis(['DEL', 'nick:' + old]); // прежний ник освобождается
      return true;
    } catch (e) { console.log('nick db error:', e.message); return true; } // база не ответила: не блокируем вход
  }
  if (nicksLocal[nn] && nicksLocal[nn] !== h) return false;
  for (const k of Object.keys(nicksLocal)) if (nicksLocal[k] === h && k !== nn) delete nicksLocal[k];
  nicksLocal[nn] = h;
  try { fs.writeFileSync(NICKS_FILE, JSON.stringify(nicksLocal)); } catch (e) {}
  return true;
}
async function releaseNick(h) { // выход из аккаунта: ник снова свободен
  if (UP_URL && UP_TOKEN) {
    try {
      const nn = await redis(['GET', 'hnick:' + h]);
      if (nn && (await redis(['GET', 'nick:' + nn])) === h) await redis(['DEL', 'nick:' + nn]);
      await redis(['DEL', 'hnick:' + h]);
    } catch (e) { console.log('nick db error:', e.message); }
    return;
  }
  let ch = false;
  for (const k of Object.keys(nicksLocal)) if (nicksLocal[k] === h) { delete nicksLocal[k]; ch = true; }
  if (ch) try { fs.writeFileSync(NICKS_FILE, JSON.stringify(nicksLocal)); } catch (e) {}
}
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const keyOk = k => !!OWNER_KEY && typeof k === 'string' && k.length > 0 && crypto.timingSafeEqual(Buffer.from(hash(k)), Buffer.from(hash(OWNER_KEY)));
// Премиум за 50 звёзд Telegram: бот @Lowendeebot, вебхук /tg/webhook, срок хранится в Upstash Redis (без базы: premium.json, на Render он сбрасывается)
const BOT = process.env.BOT_TOKEN || '', TG_SECRET = process.env.TG_SECRET || '', BOT_NAME = process.env.BOT_USERNAME || 'Lowendeebot';
const PRICE = 50, PREM_MS = 30 * 86400000, HAS_DB = !!(UP_URL && UP_TOKEN);
const CODE_RE = /^[0-9a-f]{24}$/, PAYLOAD_RE = /^p:[0-9a-f]{64}$/;
const kvLocal = new Map();
const kvSet = async (k, v, ttl) => {
  if (HAS_DB) return redis(ttl ? ['SET', k, v, 'EX', ttl] : ['SET', k, v]);
  if (kvLocal.size > 5000) kvLocal.clear();
  kvLocal.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 });
};
const kvGet = async k => {
  if (HAS_DB) return redis(['GET', k]);
  const e = kvLocal.get(k); if (!e) return null;
  if (e.exp && e.exp < Date.now()) { kvLocal.delete(k); return null; }
  return e.v;
};
const kvTake = async k => { if (HAS_DB) return redis(['GETDEL', k]); const v = await kvGet(k); kvLocal.delete(k); return v; };
const kvNew = async (k, ttl) => { // true: ключа не было, мы его создали
  if (HAS_DB) return (await redis(['SET', k, '1', 'NX', 'EX', ttl])) === 'OK';
  if (await kvGet(k)) return false; await kvSet(k, '1', ttl); return true;
};
const PREM_FILE = path.join(__dirname, 'premium.json');
let premLocal = {}; try { premLocal = JSON.parse(fs.readFileSync(PREM_FILE, 'utf8')); } catch (e) {}
const premCache = new Map();
async function premUntil(h, fresh) { // до какого времени (мс) у этого токена премиум
  const c = premCache.get(h);
  if (!fresh && c && Date.now() - c.t < 30000) return c.v;
  const v = HAS_DB ? (+(await redis(['GET', 'prem:' + h])) || 0) : (premLocal[h] || 0);
  premCache.set(h, { v, t: Date.now() }); return v;
}
const isPremium = async h => {
  try { return (await premUntil(h)) > Date.now(); }
  catch (e) { console.log('prem db error:', e.message); const c = premCache.get(h); return !!c && c.v > Date.now(); }
};
async function addPremium(h) { // +30 дней (если премиум уже есть, добавляется к его концу)
  const cur = await premUntil(h, true), until = Math.max(Date.now(), cur) + PREM_MS;
  if (HAS_DB) await redis(['SET', 'prem:' + h, String(until)]);
  else { premLocal[h] = until; try { fs.writeFileSync(PREM_FILE, JSON.stringify(premLocal)); } catch (e) {} }
  premCache.set(h, { v: until, t: Date.now() }); return until;
}
async function tg(method, body) {
  try {
    const r = await fetch('https://api.telegram.org/bot' + BOT + '/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json(); if (!j.ok) console.log('tg', method, j.description); return !!j.ok;
  } catch (e) { console.log('tg error', method); return false; }
}
const sendInvoice = (chat, h) => tg('sendInvoice', {
  chat_id: chat, title: 'lowend: премиум на 30 дней', description: 'Студия lowend: видео с твоим текстом поверх музыки. Доступ на 30 дней.',
  payload: 'p:' + h, currency: 'XTR', prices: [{ label: 'Премиум 30 дней', amount: PRICE }]
});
async function tgUpdate(u) {
  const q = u.pre_checkout_query;
  if (q) { // Telegram ждёт ответ не дольше 10 секунд
    const ok = q.currency === 'XTR' && q.total_amount === PRICE && PAYLOAD_RE.test(q.invoice_payload || '');
    await tg('answerPreCheckoutQuery', ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: 'Счёт не подходит. Открой бота с сайта заново.' });
    return;
  }
  const m = u.message; if (!m || !m.chat || m.chat.type !== 'private') return;
  const sp = m.successful_payment;
  if (sp) {
    if (sp.currency !== 'XTR' || sp.total_amount < PRICE || !PAYLOAD_RE.test(sp.invoice_payload || '')) return;
    const id = String(sp.telegram_payment_charge_id || ''); if (!id) return;
    if (!(await kvNew('pay:' + id, 604800))) return; // этот платёж уже учтён
    let until;
    try { until = await addPremium(sp.invoice_payload.slice(2)); }
    catch (e) { await kvTake('pay:' + id).catch(() => {}); throw e; } // не записалось: пусть Telegram повторит
    await tg('sendMessage', { chat_id: m.chat.id, text: 'Готово! Премиум включён до ' + new Date(until).toLocaleDateString('ru-RU') + '. Вернись на сайт: студия уже открыта.' });
    return;
  }
  const cm = String(m.text || '').match(/^\/(start|buy)(?:@\w+)?(?:\s+(\S+))?/);
  if (!cm) return;
  let h = null;
  if (cm[2] && CODE_RE.test(cm[2])) { h = await kvTake('pcode:' + cm[2]); if (h) await kvSet('tgh:' + m.chat.id, h, 86400); }
  if (!h) h = await kvGet('tgh:' + m.chat.id);
  if (!h) return void await tg('sendMessage', { chat_id: m.chat.id, text: 'Чтобы купить премиум, нажми «Купить премиум» на сайте lowend.onrender.com. Так я пойму, кому его включить.' });
  await sendInvoice(m.chat.id, h);
}
function tgWebhook(req, res) {
  const given = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  if (!BOT || !TG_SECRET || !crypto.timingSafeEqual(Buffer.from(hash(given)), Buffer.from(hash(TG_SECRET)))) { res.writeHead(403); return res.end('no'); }
  let body = '', dead = false;
  req.on('data', d => { body += d; if (body.length > 100000 && !dead) { dead = true; req.destroy(); } });
  req.on('end', async () => {
    if (dead) return;
    let u; try { u = JSON.parse(body); } catch (e) { res.writeHead(400); return res.end('bad'); }
    try { await tgUpdate(u); res.writeHead(200); res.end('ok'); }
    catch (e) { console.log('webhook error:', e.message); res.writeHead(500); res.end('err'); }
  });
}
const premHits = new Map();
function premLimited(req, max) {
  const ip = ipOf(req), now = Date.now();
  if (premHits.size > 5000) premHits.clear();
  const h = (premHits.get(ip) || []).filter(t => now - t < 60000);
  if (h.length >= max) return true;
  premHits.set(ip, [...h, now]); return false;
}
const tokOf = req => { const t = String(req.headers['x-token'] || ''); return t.length >= 20 && t.length <= 200 ? t : ''; };
async function premStatus(req, res) {
  const out = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  const tk = tokOf(req); if (!tk) return out(400, { error: 'bad token' });
  if (premLimited(req, 60)) return out(429, { error: 'limit' });
  const until = await premUntil(hash(tk)).catch(() => 0);
  out(200, { premium: until > Date.now(), until: until > Date.now() ? until : 0 });
}
async function premCode(req, res) { // одноразовый код: связывает покупку в боте с этим устройством
  const out = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  const tk = tokOf(req); if (!tk) return out(400, { error: 'bad token' });
  if (!BOT || !TG_SECRET) return out(501, { error: 'Оплата не настроена.' });
  if (premLimited(req, 10)) return out(429, { error: 'limit' });
  try {
    const code = crypto.randomBytes(12).toString('hex');
    await kvSet('pcode:' + code, hash(tk), 3600);
    out(200, { link: 'https://t.me/' + BOT_NAME + '?start=' + code });
  } catch (e) { console.log('code error:', e.message); out(500, { error: 'fail' }); }
}
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

// Поиск треков: каталог iTunes (30-секундные превью), всё идёт через сервер, чтобы не упираться в CORS
const searchHits = new Map();
const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
function limited(req, max) {
  const ip = ipOf(req), now = Date.now();
  if (searchHits.size > 5000) searchHits.clear();
  const h = (searchHits.get(ip) || []).filter(t => now - t < 60000);
  if (h.length >= max) return true;
  searchHits.set(ip, [...h, now]); return false;
}
async function musicSearch(req, res) {
  const out = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (limited(req, 30)) return out(429, { error: 'Слишком часто, подожди минуту.' });
  const q = (new URL(req.url, 'http://x').searchParams.get('q') || '').trim().slice(0, 100);
  if (!q) return out(200, []);
  try {
    const r = await fetch('https://itunes.apple.com/search?media=music&entity=song&limit=15&term=' + encodeURIComponent(q));
    const j = await r.json();
    out(200, (j.results || []).filter(x => x.previewUrl).map(x => ({
      title: x.trackName, artist: x.artistName, preview: x.previewUrl,
      art: String(x.artworkUrl100 || '').replace('100x100', '200x200')
    })));
  } catch (e) { out(502, { error: 'Поиск сейчас недоступен.' }); }
}
const previewOk = u => u.protocol === 'https:' && /(^|\.)(mzstatic\.com|itunes\.apple\.com)$/.test(u.hostname);
async function musicPreview(req, res) {
  if (limited(req, 20)) { res.writeHead(429); return res.end('limit'); }
  try {
    const u = new URL(new URL(req.url, 'http://x').searchParams.get('u') || '');
    if (!previewOk(u)) throw 0;
    const r = await fetch(u);
    if (!r.ok || !previewOk(new URL(r.url))) throw 0;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8e6) throw 0;
    res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || 'audio/mp4', 'Cache-Control': 'public, max-age=3600' });
    res.end(buf);
  } catch (e) { res.writeHead(502); res.end('bad'); }
}

const APP_FILES = { '/manifest.webmanifest': 'application/manifest+json', '/sw.js': 'application/javascript; charset=utf-8',
  '/icon-192.png': 'image/png', '/icon-512.png': 'image/png', '/apple-touch-icon.png': 'image/png' };
const server = http.createServer((req, res) => {
  if (req.url === '/health') return res.end('ok');
  const pth = req.url.split('?')[0];
  if (pth === '/api/search') return musicSearch(req, res);
  if (pth === '/api/preview') return musicPreview(req, res);
  if (pth === '/tg/webhook' && req.method === 'POST') return tgWebhook(req, res);
  if (pth === '/api/premium' && req.method === 'POST') return premStatus(req, res);
  if (pth === '/api/premium/code' && req.method === 'POST') return premCode(req, res);
  const staff = ['owner', 'admin'].includes(roles[hash(req.headers['x-token'] || '')]); // только админы и владелец
  if (req.url === '/studio.js' || req.url === '/api/studio-ai') {
    return Promise.resolve(staff || isPremium(hash(req.headers['x-token'] || ''))).then(ok => { // админы, владелец и обладатели премиума
      if (!ok) { res.writeHead(403); return res.end('forbidden'); }
      if (req.url === '/api/studio-ai' && req.method === 'POST') return studioAI(req, res, hash(req.headers['x-token']));
      return fs.readFile(path.join(__dirname, 'studio.js'), (err, data) => {
        if (err) { res.writeHead(500); return res.end('studio.js not found'); }
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(data);
      });
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

  ws.on('message', async raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const c = clients.get(ws);

    if (m.t === 'hello') {
      if (typeof m.token !== 'string' || m.token.length < 20 || m.token.length > 200) return;
      const h = hash(m.token);
      if ((banned.get(h) || 0) > Date.now()) { send(ws, { t: 'kicked' }); return ws.close(); }
      if (m.key && ws.fails < 5) { // ключ владельца, запомненный на устройстве: вход без повторного ввода после обновления
        if (keyOk(m.key)) { if (roles[h] !== 'owner') { roles[h] = 'owner'; saveRoles(); } }
        else { ws.fails++; send(ws, { t: 'authfail' }); }
      }
      const id = h.slice(0, 6);
      const given = String(m.name || '').replace(/[<>]/g, '').trim().slice(0, 20), nn = normNick(given);
      let name = given || 'гость-' + id.slice(0, 3);
      if (given && !nn) name = 'гость-' + id.slice(0, 3);
      else if (nn) {
        const ok = normNick(OWNER_NICK) === nn ? roles[h] === 'owner' : await claimNick(nn, h);
        if (!ok) { name = 'гость-' + id.slice(0, 3); send(ws, { t: 'nickTaken' }); }
      }
      if (ws.readyState !== 1) return;
      clients.set(ws, { h, id, name, since: Date.now() });
      return broadcast();
    }
    if (!c) return;
    if (m.t === 'logout') {
      await releaseNick(c.h);
      if (roles[c.h]) { delete roles[c.h]; saveRoles(); }
      clients.delete(ws); send(ws, { t: 'loggedout' }); return broadcast();
    }
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
