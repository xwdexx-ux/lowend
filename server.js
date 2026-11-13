// lowend: раздаёт index.html и ведёт онлайн, роли и админку через WebSocket.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const { WebSocketServer } = require('ws');

const OWNER_KEY = process.env.OWNER_KEY || '';
const OWNER_NICK = String(process.env.OWNER_NICK || ''); // ник владельца: другие его занять не могут
const normNick = x => String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const ROLES_FILE = path.join(__dirname, 'roles.json');
let roles = {}; // хэш токена -> 'owner' | 'admin'
try { roles = JSON.parse(fs.readFileSync(ROLES_FILE, 'utf8')); } catch (e) {}
const saveRoles = () => {
  try { fs.writeFileSync(ROLES_FILE, JSON.stringify(roles)); } catch (e) {}
  if (mongoOn()) kvCol().then(c => c.updateOne({ _id: 'roles' }, { $set: { v: roles } }, { upsert: true })).catch(e => console.log('roles db error:', e.message));
};
async function loadRoles() { // роли админов и владельца берём из Atlas, чтобы они не пропадали после перезапуска
  if (!mongoOn()) return;
  try { const d = await (await kvCol()).findOne({ _id: 'roles' }); if (d && d.v && typeof d.v === 'object') roles = { ...roles, ...d.v }; console.log('mongo: ok, roles ' + Object.keys(roles).length); }
  catch (e) { console.log('mongo error:', e.message); }
}

// Ники: кто первым занял ник, тот им владеет. Хранится в Upstash Redis (бесплатно); без него в файле nicks.json (на Render он сбрасывается)
const UP_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, ''), UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const NICKS_FILE = path.join(__dirname, 'nicks.json');
let nicksLocal = {}; // нормализованный ник -> хэш владельца
try { nicksLocal = JSON.parse(fs.readFileSync(NICKS_FILE, 'utf8')); } catch (e) {}
// MongoDB Atlas (бесплатный M0): если задан MONGODB_URI, ники, премиум, Pro и роли хранятся там и переживают перезапуски Render. Без него работает Upstash, а без обоих файлы
const MONGO_URI = process.env.MONGODB_URI || '', mongoOn = () => !!MONGO_URI;
let mcolP = null;
function kvCol() {
  if (!mcolP) mcolP = (async () => {
    const { MongoClient } = require('mongodb');
    const c = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 8000 }); await c.connect();
    return c.db(process.env.MONGODB_DB || 'lowend').collection('kv');
  })().catch(e => { mcolP = null; throw e; });
  return mcolP;
}
const redis = async cmd => {
  const r = await fetch(UP_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + UP_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json(); if (j.error) throw new Error(j.error); return j.result;
};
async function claimNick(nn, h) { // true: ник твой, false: занят другим
  if (mongoOn()) {
    try {
      const c = await kvCol();
      try { await c.insertOne({ _id: 'nick:' + nn, v: h }); } catch (e) { if (e.code !== 11000) throw e; const d = await c.findOne({ _id: 'nick:' + nn }); if (!d || d.v !== h) return false; }
      const old = await c.findOneAndUpdate({ _id: 'hnick:' + h }, { $set: { v: nn } }, { upsert: true, returnDocument: 'before' });
      if (old && old.v && old.v !== nn) await c.deleteOne({ _id: 'nick:' + old.v, v: h }); // прежний ник освобождается
      return true;
    } catch (e) { console.log('nick db error:', e.message); return true; }
  }
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
  if (mongoOn()) {
    try {
      const c = await kvCol(), d = await c.findOne({ _id: 'hnick:' + h });
      if (d && d.v) await c.deleteOne({ _id: 'nick:' + d.v, v: h });
      await c.deleteOne({ _id: 'hnick:' + h });
    } catch (e) { console.log('nick db error:', e.message); }
    return;
  }
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

// ---------- Премиум: 30 дней за 150 Telegram Stars. Доступ к Студии. Хранится по хэшу анонимного токена (аккаунтов нет) ----------
const BOT_TOKEN = process.env.BOT_TOKEN || '';
let BOT_USER = String(process.env.BOT_USERNAME || '').replace(/^@/, '');
const BASE_URL = (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
const SUPPORT = process.env.SUPPORT_CONTACT || '';   // например @username: кому писать при проблемах с оплатой
const OWNER_TG_ID = process.env.OWNER_TG_ID || '';   // твой Telegram id: бот будет присылать уведомления об оплатах (необязательно)
const PREMIUM_STARS = 150, PREMIUM_DAYS = 30, DAY = 86400000;
const PRO_STARS = 50, PRO_DAYS = 30, AI_FREE_LIMIT = 40, AI_PRO_LIMIT = 200; // lowend AI Pro: больше сообщений и умнее модель
const PREM_FILE = path.join(__dirname, 'premium.json');
let premLocal = {}; // запасной вариант без Redis (на Render файл сбрасывается)
try { premLocal = JSON.parse(fs.readFileSync(PREM_FILE, 'utf8')); } catch (e) {}
const premCache = new Map(); // pid -> до какого времени (мс), для синхронных проверок
const pid = h => h.slice(0, 48);
const redisOn = () => !!(UP_URL && UP_TOKEN);
async function kvGet(k) {
  if (mongoOn()) { try { const d = await (await kvCol()).findOne({ _id: k }); return Number(d && d.v) || 0; } catch (e) { console.log('premium db error:', e.message); } }
  if (redisOn()) { try { return Number(await redis(['GET', k])) || 0; } catch (e) { console.log('premium db error:', e.message); } }
  return premLocal[k] || 0;
}
async function kvSet(k, v) {
  if (v > 0) premLocal[k] = v; else delete premLocal[k];
  try { fs.writeFileSync(PREM_FILE, JSON.stringify(premLocal)); } catch (e) {}
  if (mongoOn()) { try { const c = await kvCol(); if (v > 0) await c.updateOne({ _id: k }, { $set: { v } }, { upsert: true }); else await c.deleteOne({ _id: k }); } catch (e) { console.log('premium db error:', e.message); } return; }
  if (redisOn()) { try { await redis(v > 0 ? ['SET', k, String(v)] : ['DEL', k]); } catch (e) { console.log('premium db error:', e.message); } }
}
async function getPremium(p) { const v = await kvGet('prem:' + p); premCache.set(p, v); return v; }
async function setPremium(p, until) { premCache.set(p, until); await kvSet('prem:' + p, until); }
async function addPremium(p, days) { // продлевает от текущего конца, если премиум ещё действует
  const until = Math.max(Date.now(), await getPremium(p)) + days * DAY;
  await setPremium(p, until); return until;
}
const isPrem = p => (premCache.get(p) || 0) > Date.now();
// lowend AI Pro: хранится так же, как premium, под ключом pro:<pid>
const proCache = new Map();
async function getPro(p) { const v = await kvGet('pro:' + p); proCache.set(p, v); return v; }
async function setPro(p, until) { proCache.set(p, until); await kvSet('pro:' + p, until); }
async function addPro(p, days) { const until = Math.max(Date.now(), await getPro(p)) + days * DAY; await setPro(p, until); return until; }
const isProNow = p => (proCache.get(p) || 0) > Date.now();
async function aiTier(h) { // staff: владелец и админы (у них всё включено), pro: оплатил, free: остальные
  if (['owner', 'admin'].includes(roles[h])) return 'staff';
  const p = pid(h); // значение уже в кэше после входа (hello/sync) и оплаты: лишний запрос в Redis на каждое сообщение не нужен
  return (proCache.has(p) ? proCache.get(p) : await getPro(p)) > Date.now() ? 'pro' : 'free';
}
async function hasStudio(h) { const p = pid(h); return ['owner', 'admin'].includes(roles[h]) || (premCache.has(p) ? premCache.get(p) : await getPremium(p)) > Date.now(); }
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

// Бот: /start, оплата Stars, /paysupport. Оплата идёт в боте, сайт только открывает ссылку на бота.
const tg = async (method, body) => {
  const r = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  const j = await r.json(); if (!j.ok) throw new Error(method + ': ' + j.description); return j.result;
};
const say = (chat, text, extra) => tg('sendMessage', { chat_id: chat, text, ...extra }).catch(e => console.log('tg error:', e.message));
const TXT = {
  ru: {
    hello: 'lowend: басс-буст и студия видео.\n\nПремиум даёт Студию: видео со своим текстом поверх любимого трека. Купить его можно на сайте, в карточке «Premium».',
    open: 'Открыть lowend',
    invTitle: 'lowend Premium', invDesc: '30 дней доступа к Студии: видео со своим текстом поверх трека.', invLabel: 'Premium · 30 дней',
    paid: d => 'Оплата прошла. Премиум активен до ' + d + '. Вернись на сайт: Студия уже открыта.',
    restored: d => 'Премиум восстановлен на этом устройстве, он действует до ' + d + '.',
    nothing: 'Не нашёл активного премиума, оплаченного с этого Telegram-аккаунта.',
    support: 'Если оплата прошла, а премиум не появился, или нужен возврат: напиши ' + (SUPPORT || 'владельцу сайта') + ' и приложи скриншот оплаты. Возврат Stars делает владелец.',
    fail: 'Не получилось. Попробуй ещё раз с сайта.',
    invTitleP: 'lowend AI Pro', invDescP: '30 дней lowend AI Pro: больше сообщений и более умная модель.', invLabelP: 'AI Pro · 30 дней',
    paidP: d => 'Оплата прошла. lowend AI Pro активен до ' + d + '. Вернись на сайт: ИИ уже стал умнее.',
    restoredP: d => 'lowend AI Pro восстановлен на этом устройстве, он действует до ' + d + '.',
    nothingP: 'Не нашёл активного lowend AI Pro, оплаченного с этого Telegram-аккаунта.'
  },
  en: {
    hello: 'lowend: bass boost and a video studio.\n\nPremium unlocks the Studio: make videos with your own text over your favorite track. Buy it on the site, in the “Premium” card.',
    open: 'Open lowend',
    invTitle: 'lowend Premium', invDesc: '30 days of Studio access: videos with your own text over your track.', invLabel: 'Premium · 30 days',
    paid: d => 'Payment received. Premium is active until ' + d + '. Go back to the site: the Studio is unlocked.',
    restored: d => 'Premium restored on this device. It is valid until ' + d + '.',
    nothing: 'I could not find active premium paid from this Telegram account.',
    support: 'If you paid but premium did not appear, or you need a refund: message ' + (SUPPORT || 'the site owner') + ' with a screenshot of the payment. Refunds are made by the owner.',
    fail: 'Something went wrong. Try again from the site.',
    invTitleP: 'lowend AI Pro', invDescP: '30 days of lowend AI Pro: more messages and a smarter model.', invLabelP: 'AI Pro · 30 days',
    paidP: d => 'Payment received. lowend AI Pro is active until ' + d + '. Go back to the site: the AI is smarter now.',
    restoredP: d => 'lowend AI Pro restored on this device. It is valid until ' + d + '.',
    nothingP: 'I could not find active lowend AI Pro paid from this Telegram account.'
  }
};
const paidSeen = new Set();
async function onUpdate(u) {
  if (u.pre_checkout_query) { // Telegram ждёт ответ в течение 10 секунд
    const q = u.pre_checkout_query, pl0 = q.invoice_payload || '', want = /^prem:[0-9a-f]{48}$/.test(pl0) ? PREMIUM_STARS : /^pro:[0-9a-f]{48}$/.test(pl0) ? PRO_STARS : 0, ok = !!want && q.currency === 'XTR' && q.total_amount === want;
    return tg('answerPreCheckoutQuery', ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: 'Invalid payment' }).catch(e => console.log('tg error:', e.message));
  }
  const m = u.message; if (!m || !m.chat) return;
  const L = TXT[String((m.from || {}).language_code || '').startsWith('ru') ? 'ru' : 'en'];
  const dateOf = ms => new Date(ms).toLocaleDateString(L === TXT.ru ? 'ru-RU' : 'en-GB');
  const site = BASE_URL ? { reply_markup: { inline_keyboard: [[{ text: L.open, url: BASE_URL }]] } } : {};
  if (m.successful_payment) {
    const sp = m.successful_payment, id = sp.telegram_payment_charge_id;
    if (!/^(prem|pro):[0-9a-f]{48}$/.test(sp.invoice_payload || '') || paidSeen.has(id)) return;
    paidSeen.add(id);
    if (mongoOn()) { try { await (await kvCol()).insertOne({ _id: 'pay:' + id, v: 1, p: sp.invoice_payload, tg: m.from.id, at: Date.now() }); } catch (e) { if (e.code === 11000) return; console.log('pay db error:', e.message); } }
    else if (redisOn()) { try { if ((await redis(['SET', 'pay:' + id, JSON.stringify({ p: sp.invoice_payload, tg: m.from.id, at: Date.now() }), 'NX'])) !== 'OK') return; } catch (e) {} }
    const isP = sp.invoice_payload.startsWith('pro:'), p = sp.invoice_payload.split(':')[1];
    const until = isP ? await addPro(p, PRO_DAYS) : await addPremium(p, PREMIUM_DAYS);
    const tk = (isP ? 'tgpro:' : 'tgprem:') + m.from.id, prev = await kvGet(tk); await kvSet(tk, Math.max(prev, until)); // чтобы можно было восстановить на другом устройстве
    console.log((isP ? 'pro' : 'premium') + ' paid:', p.slice(0, 6), 'tg', m.from.id, 'charge', id);
    broadcast();
    if (OWNER_TG_ID) say(OWNER_TG_ID, 'Оплата' + (isP ? ' AI Pro' : '') + ': ' + (isP ? PRO_STARS : PREMIUM_STARS) + ' Stars от ' + (m.from.username ? '@' + m.from.username : m.from.id) + '\nдля id ' + p.slice(0, 6) + '\ncharge id: ' + id);
    return say(m.chat.id, (isP ? L.paidP : L.paid)(dateOf(until)), site);
  }
  const text = String(m.text || '');
  if (text.startsWith('/paysupport')) {
    if (OWNER_TG_ID) say(OWNER_TG_ID, '/paysupport от ' + (m.from.username ? '@' + m.from.username : m.from.id));
    return say(m.chat.id, L.support);
  }
  if (text.startsWith('/start')) {
    const par = text.split(/\s+/)[1] || '', mm = /^(p?)([br])_([0-9a-f]{48})$/.exec(par);
    if (mm) {
      const isP = mm[1] === 'p';
      if (mm[2] === 'b') { // купить
        return tg('sendInvoice', { chat_id: m.chat.id, title: isP ? L.invTitleP : L.invTitle, description: isP ? L.invDescP : L.invDesc, payload: (isP ? 'pro:' : 'prem:') + mm[3], currency: 'XTR', prices: [{ label: isP ? L.invLabelP : L.invLabel, amount: isP ? PRO_STARS : PREMIUM_STARS }] })
          .catch(e => { console.log('tg error:', e.message); say(m.chat.id, L.fail); });
      }
      // восстановить на новом токене
      const until = await kvGet((isP ? 'tgpro:' : 'tgprem:') + m.from.id);
      if (until <= Date.now()) return say(m.chat.id, isP ? L.nothingP : L.nothing);
      if (isP) { if (until > await getPro(mm[3])) await setPro(mm[3], until); } else if (until > await getPremium(mm[3])) await setPremium(mm[3], until);
      broadcast();
      return say(m.chat.id, (isP ? L.restoredP : L.restored)(dateOf(until)), site);
    }
  }
  return say(m.chat.id, L.hello, site);
}
async function startBot() {
  if (!BOT_TOKEN) return console.log('BOT_TOKEN не задан: бот и оплата выключены');
  try {
    const me = await tg('getMe'); BOT_USER = BOT_USER || me.username;
    await tg('setMyCommands', { commands: [{ command: 'start', description: 'Start' }, { command: 'paysupport', description: 'Payment help' }] }).catch(() => {});
    if (BASE_URL) { // вебхук: Telegram сам будит сервер на Render
      await tg('setWebhook', { url: BASE_URL + '/tg', secret_token: hash(BOT_TOKEN).slice(0, 32), allowed_updates: ['message', 'pre_checkout_query'] });
      return console.log('bot @' + BOT_USER + ': webhook ' + BASE_URL + '/tg');
    }
    await tg('deleteWebhook'); console.log('bot @' + BOT_USER + ': polling');
    let off = 0;
    for (;;) {
      try {
        const ups = await tg('getUpdates', { offset: off, timeout: 30, allowed_updates: ['message', 'pre_checkout_query'] });
        for (const u of ups) { off = u.update_id + 1; try { await onUpdate(u); } catch (e) { console.log('bot error:', e.message); } }
      } catch (e) { console.log('poll error:', e.message); await new Promise(r => setTimeout(r, 5000)); }
    }
  } catch (e) { console.log('bot start error:', e.message); }
}
const SYS = 'Ты помощник видеостудии сайта lowend. Верни ТОЛЬКО JSON без пояснений и без markdown с полями: ' +
  'text (строка до 150 символов, \\n для переноса), font (old|thin|sans|display|mono|serif; old это стиль референса пользователя: Inter Light, суженный до 71%, строки вплотную; thin это тот же Inter Light обычной ширины), resolution (одно из: 1022x576, 1280x720, 1920x1080, 720x1280, 1080x1920, 1080x1080; в current оно называется res; 1022x576 это размер по умолчанию, 16:9), ' +
  'duration (секунды, число от 5 до 300), fade (секунды плавного появления текста из темноты, 0-10), track (точное название из savedTracks или null), color (hex текста), bg (hex фона), progress (true|false). ' +
  'Поля, которые пользователь не просил менять, оставляй такими же, как в current.';
const EDIT_FIELDS = 'music (номер видео, из которого брать музыку, с 1), also (true: клипы брать и из видео с музыкой), ' +
  'res (\"same:N\" = такое же разрешение, как у видео номер N; или WxH, например 1080x1920, 720x1280, 1280x720, 1080x1080, 2160x3840), ' +
  'len (длина эдита, секунды 3-120), start (с какой секунды брать музыку), tempo (fast = каждый бит, mid, slow, mix = вразнобой), ' +
  'text (надпись или символы поверх видео, \\n для переноса; пустая строка убирает), textPos (top|center|bottom), textColor (hex), textFont (old|thin|sans|display|mono|serif), textSize (2-16, % высоты кадра; маленький символ 3-4, обычный 7, большой 10-14), textDur (сколько секунд надпись видна с начала эдита, потом плавно гаснет; 0 = весь эдит), textFade (секунды плавного исчезновения, 0.3-3), ' +
  'shake (true|false: тряска кадра на ударе), glitch (true|false: глитч-полосы на ударе), letterbox (true|false: чёрные кинополосы сверху и снизу), fadeIn и fadeOut (секунды: появление из чёрного в начале и уход в чёрное в конце всего видео), textStart (через сколько секунд появляется надпись), texts (до 5 дополнительных надписей: [{text,textPos,textSize,textColor,textDur,textStart,textFade}]), filter (none|bright|bw|warm|cool|moody|vivid; bright = светлый фильтр, осветляет кадр), vignette (true|false), grain (true|false), flash (true|false: вспышка на каждом ударе), zoom (true|false: пульс приближения на ударе), fps (30|60), quality (fast|high|max)';
const SYS_EDIT = 'Ты помощник видео-эдитора сайта lowend. Пользователь описывает монтаж: клипы из его видео режутся вразброс под биты музыки, которая берётся из одного из видео. ' +
  'Тебе дают список видео (номер, имя, размер, длина) и current (текущие настройки). Верни ТОЛЬКО JSON без пояснений и без markdown с полями, которые пользователь просил изменить: ' + EDIT_FIELDS + '. ' +
  'Если пользователь просит качество «очень хорошее» или «лучшее», ставь quality high или max и fps 60. Поля, которые не просили менять, не включай.';
const aiHits = new Map();
// Gemini: gemini-2.5-flash закрыт Google 16.10.2026 (отсюда 404), поэтому пробуем список моделей; рабочая запоминается
const goodBy = { free: '', pro: '' };
const deadUntil = new Map(); // модель -> до какого времени её пропускаем (404: такой модели нет, 429/503: перегружена), чтобы не тратить на неё запрос каждый раз
const noThink = new Set();   // модели, которые не принимают thinkingConfig
// «Размышление» ИИ ограничено по токенам: немного думает, но не долго, как в Claude. Меняется переменными AI_THINK_FREE / AI_THINK_PRO (0 = совсем без размышления)
const THINK_FREE = Number.isFinite(+process.env.AI_THINK_FREE) && process.env.AI_THINK_FREE !== undefined && process.env.AI_THINK_FREE !== '' ? +process.env.AI_THINK_FREE : 512;
const THINK_PRO = Number.isFinite(+process.env.AI_THINK_PRO) && process.env.AI_THINK_PRO !== undefined && process.env.AI_THINK_PRO !== '' ? +process.env.AI_THINK_PRO : 1024;
async function geminiText(key, systemText, contents, pro, long, maxTok, thinkOverride) {
  const flash = [goodBy.free, process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
  const proOnly = [goodBy.pro, process.env.GEMINI_PRO_MODEL, 'gemini-3.1-pro-preview'].filter(Boolean);
  let models = [...new Set((pro ? [...proOnly, ...flash] : flash).filter(Boolean))];
  const alive = models.filter(m => (deadUntil.get(m) || 0) < Date.now());
  if (alive.length) models = alive;
  let last;
  outer: for (const model of models) {
    const isPro = pro && proOnly.includes(model) && !flash.includes(model);
    for (let attempt = 0; attempt < 2; attempt++) {
      const think = !noThink.has(model), budget = thinkOverride !== undefined ? thinkOverride : (isPro ? THINK_PRO : THINK_FREE); // ограниченный бюджет размышления: ответ остаётся быстрым
      const gen = { responseMimeType: 'application/json', maxOutputTokens: maxTok || (think ? budget + 1500 : 6000) };
      if (think) gen.thinkingConfig = { thinkingBudget: budget };
      try {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(long ? (isPro ? 55000 : 40000) : (isPro ? 25000 : 15000)),
          body: JSON.stringify({ systemInstruction: { parts: [{ text: systemText }] }, contents, generationConfig: gen })
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) { goodBy[isPro ? 'pro' : 'free'] = model; return ((j.candidates || [])[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join(''); }
        last = new Error('Gemini ' + r.status + ' (' + model + '): ' + JSON.stringify(j).slice(0, 300));
        if (r.status === 400 && think && /think/i.test(JSON.stringify(j))) { noThink.add(model); continue; } // модель не принимает thinkingConfig: повторяем без него
        if (model === goodBy.free) goodBy.free = ''; if (model === goodBy.pro) goodBy.pro = '';
        if ([404, 429, 503].includes(r.status)) deadUntil.set(model, Date.now() + (r.status === 404 ? 30 * 60000 : r.status === 429 ? 60000 : 20000));
        if (![404, 429, 503].includes(r.status) && !isPro) break outer; // 400/403 на обычной модели: ключ или запрос, другая не поможет. Pro-модель просто пропускаем
        break;
      } catch (e) { // таймаут или сеть: пробуем следующую
        last = new Error('Gemini (' + model + '): ' + e.message);
        if (isPro) deadUntil.set(model, Date.now() + 30000);
        break;
      }
    }
  }
  throw last || new Error('Gemini: no model');
}
function studioAI(req, res, h) {
  const out = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const GKEY = process.env.GEMINI_API_KEY, AKEY = process.env.ANTHROPIC_API_KEY;
  if (!GKEY && !AKEY) return out(501, { error: 'ИИ не подключён: добавь на сервере GEMINI_API_KEY (бесплатно). / AI is not connected: add GEMINI_API_KEY on the server.' });
  const hits = (aiHits.get(h) || []).filter(t => Date.now() - t < 3600000);
  if (hits.length >= 20) return out(429, { error: 'Лимит: 20 запросов ИИ в час. / Limit: 20 AI requests per hour.' });
  if (aiHits.size > 5000) aiHits.clear();
  aiHits.set(h, [...hits, Date.now()]);
  let body = ''; req.on('data', d => { body += d; if (body.length > 8000) req.destroy(); });
  req.on('end', async () => {
    try {
      const b = JSON.parse(body);
      const edit = b.mode === 'edit', sysP = edit ? SYS_EDIT : SYS;
      const user = edit
        ? JSON.stringify({ request: String(b.prompt).slice(0, 500), videos: (Array.isArray(b.videos) ? b.videos : []).slice(0, 12).map((v, i) => ({ n: i + 1, name: String((v || {}).name || '').slice(0, 60), w: +(v || {}).w || 0, h: +(v || {}).h || 0, dur: +(v || {}).dur || 0 })), current: b.current })
        : JSON.stringify({ request: String(b.prompt).slice(0, 500), savedTracks: b.tracks, current: b.current });
      let text;
      if (GKEY) { // Gemini (есть бесплатный тариф)
        text = await geminiText(GKEY, sysP, [{ role: 'user', parts: [{ text: user }] }], false, false, edit ? 900 : 700, 0);
      } else { // Claude (платный)
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': AKEY, 'anthropic-version': '2023-06-01' },
          signal: AbortSignal.timeout(25000),
          body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: edit ? 700 : 400, system: sysP, messages: [{ role: 'user', content: user }] })
        });
        const j = await r.json();
        if (!r.ok) throw new Error('Claude ' + r.status + ': ' + JSON.stringify(j).slice(0, 300));
        text = (j.content || []).map(c => c.text || '').join('');
      }
      text = text.replace(/```json|```/g, '').trim();
      out(200, JSON.parse(text));
    } catch (e) { console.log('studio ai error:', e.message); out(500, { error: 'ИИ не смог обработать запрос. / AI could not process the request.' }); }
  });
}

// lowend AI: чат внутри сайта. Отвечает на любые сообщения и, если просят, ещё и выставляет настройки звука.
const SOUND_SYS = 'Ты lowend AI, дружелюбный чат-ассистент внутри сайта lowend (обработка музыки: slowed, reverb, bass boost, nightcore, 8D). ' +
  'Тебя, lowend AI, и сайт lowend создал nexide (by nexide). Если спрашивают, кто тебя создал или чей ты, отвечай, что тебя создал nexide. Не говори, что тебя создал Google или другая компания. Если прямо спрашивают, на какой модели ты работаешь, скажи, что не знаешь подробностей, не выдумывай. ' +
  'Отвечай на ЛЮБЫЕ сообщения естественно и по делу, как ассистент в чате: приветствия, вопросы про музыку, звук и сайт, обычный разговор. Пиши коротко, на языке пользователя, обычным текстом (без markdown-заголовков), не выдумывай факты. ' +
  'Верни ТОЛЬКО JSON без markdown: {"say": "твой ответ"}. ' +
  'Пользователь может прикреплять фото, видео (оно приходит как несколько кадров по порядку, без звука), PDF и текстовые файлы. Внимательно изучи вложения и сделай то, о чём просит пользователь: опиши, ответь на вопрос, прочитай текст, объясни, подбери звук под настроение картинки и так далее. Если вложение передано, не говори, что не видишь его. Если пользователь говорит про вложение, а его нет, скажи, что ничего не получил. ' +
  'Только если пользователь просит изменить звук, добавь в тот же JSON нужные поля: speed (0.3-2, 1 = оригинал, slowed ~0.8-0.9, nightcore ~1.25-1.35), bass (0-40 дБ), reverb (0-100), pan (0-100, 8D), vol (0-400, обычно 100), treble (0-20), echo (0-100), muffle (0-100, «из-под воды»), sub (0-100), dist (0-100). ' +
  'Поля, которые не просили менять, не включай. Если просят найти или подобрать песню, добавь search (строка для поиска). ' +
  'Не ставь bass выше 20 и sub выше 60 без явной просьбы: на динамике телефона сверхнизкие частоты не слышны, лучше умеренный bass и немного dist.';
const VIDEO_SYS = 'Если пользователь просит сделать видео, эдит или слайдшоу из его видео, добавь в JSON поле video: {\"type\":\"edit\", поля: ' + EDIT_FIELDS + '}. ' +
  'Эдит (нарезка клипов из прикреплённых видео вразброс под биты, можно фильтры и надпись поверх) сайт собирает прямо в этом чате сразу после твоего ответа. Никуда не перекидывай, Студию и кнопки не упоминай: в say коротко скажи в настоящем времени, что собираешь эдит и что настроил (музыка, длина, темп, надпись). Эдит ещё не готов в момент твоего ответа: никогда не пиши «сделал», «готово», «получилось», сайт сам сообщит, когда файл собран. Символы и надпись для text бери ТОЛЬКО из сообщений пользователя и копируй их посимвольно, ничего не заменяя похожими знаками. Никогда не угадывай символ по кадрам видео (кадры мелкие, ты ошибёшься). Ник, имя пользователя и @-теги в text не добавляй, если пользователь сам не попросил. Если пользователь хочет символ «как на видео» и не написал его в чате, не добавляй text и попроси прислать символ текстом (скопировать и вставить). Если просят «светлый фильтр», ставь filter bright. ' +
  'По умолчанию музыка берётся из видео 1, а разрешение такое же, как у видео 1 (res: \"same:1\"); меняй это, только если пользователь просил другое. Не включай в video поля, которые не просили менять. Если прикреплённых видео нет, попроси прикрепить и не добавляй video. ' +
  'Если дан последний эдит (lastEdit) и пользователь просит его изменить («убери», «оставь», «сделай меньше», «только в начале»), бери за основу lastEdit: верни в video ВСЕ его поля, поменяв только то, что просили. Умеешь ТОЛЬКО то, что есть в списке полей. Если просят то, чего там нет (замедление, переходы, субтитры по словам, свои эффекты), честно скажи, что этого пока нет, предложи ближайшее из списка и не обещай невозможного. Положение надписи (textPos) по умолчанию center, меняй только по просьбе. «Только в начале на N секунд и уходит с затемнением» = textDur N и textFade 1. «Большой символ убери» = убери text или уменьши textSize, не убирай остальное.';
// Надпись эдита берём только из слов пользователя: ИИ путает символы на мелких кадрах и дописывает ники.
// Если пользователь прислал символ (например ℏ), он ставится как есть. @ник убирается, если пользователь его не писал.
const SYM_RE = /[\u2100-\u214F\u2190-\u23FF\u25A0-\u27BF\u2B00-\u2BFF\u3000-\u30FF\u0370-\u03FF\p{So}\p{Sm}][\uFE0E\uFE0F]?/gu;
const DEF_SYM = process.env.EDIT_SYMBOL || '\u210f'; // символ по умолчанию, если пользователь сказал «тот символ», а сам его не написал (можно сменить переменной EDIT_SYMBOL)
const symOf = t => (String(t || '').match(SYM_RE) || []).filter(m => !/\p{Extended_Pictographic}/u.test(m)).join('').trim();
function fixVideoText(v, said, all) {
  const o = { ...v }, said0 = String(said || ''), all0 = String(all || said0);
  const wants = /символ|надпис|symbol|caption|logo|лого/i.test(said0);
  const dropsIt = /убер|удал|без |remove|delete|without/i.test(said0) && !/оставь|остав|keep|добав|add|маленьк|small/i.test(said0);
  const sym = symOf(said0) || symOf(all0); // что пользователь сам прислал в этом чате
  let txt = typeof o.text === 'string' ? o.text.replace(/@[\w.]{2,}/g, m => all0.toLowerCase().includes(m.toLowerCase()) ? m : '').replace(/[ \t]+\n/g, '\n').trim() : '';
  const mine = txt && (all0.includes(txt) || (sym && txt.includes(sym))); // надпись должна быть из слов пользователя, а не придумана по кадрам
  if (txt && !mine) txt = '';
  if (sym && sym.length <= 8 && wants && !txt.includes(sym) && !dropsIt) txt = sym;
  if (!txt && wants && !dropsIt) txt = DEF_SYM;
  if (typeof o.text === 'string' || txt) o.text = txt;
  if (Array.isArray(o.texts)) o.texts = o.texts.filter(x => x && typeof x.text === 'string' && x.text.trim() && (all0.includes(x.text.trim()) || (sym && x.text.includes(sym)))); // доп. надписи тоже только из слов пользователя
  return o;
}
const soundHits = new Map();
// Задачи ИИ: ответ считается на сервере и хранится 10 минут. Если телефон ушёл в TikTok и связь оборвалась, сайт заберёт готовый ответ по id
const aiJobs = new Map(); // id -> { th, st: 'run'|'done', code, body, at }
setInterval(() => { const now = Date.now(); for (const [k, v] of aiJobs) if (now - v.at > 600000) aiJobs.delete(k); }, 60000).unref();

// Чтение тела запроса с лимитом: при превышении отвечаем 413, а не оставляем запрос висеть
function readBody(req, res, max, cb) {
  const fail = () => { if (!res.headersSent) { res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' }); res.end(JSON.stringify({ error: 'Вложения слишком большие. / Attachments are too large.' })); } };
  if (Number(req.headers['content-length'] || 0) > max) return fail();
  let size = 0, dead = false; const parts = [];
  req.on('data', d => { if (dead) return; size += d.length; if (size > max) { dead = true; parts.length = 0; return fail(); } parts.push(d); });
  req.on('end', () => { if (!dead) cb(Buffer.concat(parts).toString('utf8')); });
  req.on('error', () => {});
}
const IMG_OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']), B64 = /^[A-Za-z0-9+/]+={0,2}$/;
function cleanAttach(a) { // фото, PDF и текстовые файлы от клиента: проверяем типы, размеры и base64
  const out = { images: [], pdfs: [], files: [], note: '' };
  if (!a || typeof a !== 'object') return out;
  let total = 0;
  for (const x of (Array.isArray(a.images) ? a.images : []).slice(0, 12)) {
    if (!x || !IMG_OK.has(x.mime) || typeof x.data !== 'string' || x.data.length > 2.5e6 || !B64.test(x.data)) continue;
    total += x.data.length; out.images.push({ mime: x.mime, data: x.data });
  }
  for (const x of (Array.isArray(a.pdfs) ? a.pdfs : []).slice(0, 2)) {
    if (!x || typeof x.data !== 'string' || x.data.length > 6.9e6 || !B64.test(x.data)) continue;
    total += x.data.length; out.pdfs.push({ name: String(x.name || 'file.pdf').slice(0, 80), data: x.data });
  }
  for (const x of (Array.isArray(a.files) ? a.files : []).slice(0, 4)) {
    if (!x || typeof x.text !== 'string') continue;
    out.files.push({ name: String(x.name || 'file').slice(0, 80), text: x.text.slice(0, 15000) });
  }
  out.note = String(a.note || '').replace(/[\r\n]+/g, ' ').slice(0, 400);
  if (total > 9e6) return { images: [], pdfs: [], files: [], note: '', tooBig: true };
  return out;
}
const hasAttach = a => !!(a && (a.images.length || a.pdfs.length || a.files.length));
function soundAI(req, res) {
  const out = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const GKEY = process.env.GEMINI_API_KEY, AKEY = process.env.ANTHROPIC_API_KEY;
  if (!GKEY && !AKEY) return out(501, { error: 'ИИ не подключён: добавь на сервере GEMINI_API_KEY (бесплатно). / AI is not connected: add GEMINI_API_KEY on the server.' });
  readBody(req, res, 10e6, async body => {
    try {
      const th = hash(req.headers['x-token'] || ''), tier = await aiTier(th), now = Date.now(), smart = tier !== 'free';
      if (tier !== 'staff') { // у владельца и админов лимита нет
        const key = tier === 'pro' ? 'p:' + th : 'i:' + ipOf(req), max = tier === 'pro' ? AI_PRO_LIMIT : AI_FREE_LIMIT;
        if (soundHits.size > 5000) soundHits.clear();
        const hits = (soundHits.get(key) || []).filter(t => now - t < 3600000);
        if (hits.length >= max) { const hint = tier === 'free'; return out(429, { error: 'Лимит: ' + max + ' сообщений в час' + (hint ? ' (в Pro: ' + AI_PRO_LIMIT + ')' : '') + '. / Limit: ' + max + ' messages per hour' + (hint ? ' (Pro: ' + AI_PRO_LIMIT + ')' : '') + '.' }); }
        soundHits.set(key, [...hits, now]);
      }
      const b = JSON.parse(body);
      // история чата: только user/assistant, роли чередуются, начинается с user
      const msgs = [];
      for (const m of (Array.isArray(b.messages) ? b.messages : []).slice(-12)) {
        const role = m.role === 'assistant' ? 'assistant' : 'user', text = String(m.text || '').slice(0, 1500).trim();
        if (!text) continue;
        if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].text += '\n' + text; else msgs.push({ role, text });
      }
      while (msgs.length && msgs[0].role !== 'user') msgs.shift();
      if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return out(400, { error: 'empty' });
      const att = cleanAttach(b.attach);
      if (att.tooBig) return out(413, { error: 'Вложения слишком большие. / Attachments are too large.' });
      const last = msgs[msgs.length - 1], userSaid = last.text, userAll = msgs.filter(m => m.role === 'user').map(m => m.text).join('\n'); // что пользователь написал сам, без вложений
      if (att.note) last.text += '\n[' + att.note + ']';
      for (const f of att.files) last.text += '\n\n[Файл: ' + f.name + ']\n' + f.text;
      const withFiles = hasAttach(att);
      const studioOk = await hasStudio(th).catch(() => false);
      const vids = (Array.isArray(b.videos) ? b.videos : []).slice(0, 12).map((v, i) => (i + 1) + ') «' + String((v || {}).n || 'video').replace(/["\r\n]/g, ' ').slice(0, 50) + '» ' + (+(v || {}).w || 0) + 'x' + (+(v || {}).h || 0) + ', ' + Math.round(+(v || {}).dur || 0) + ' с').join('; ');
      const lastEditS = b.lastEdit && typeof b.lastEdit === 'object' ? JSON.stringify(b.lastEdit).slice(0, 1200) : '';
      // реальное состояние сборки сообщает сайт: без этого ИИ выдумывал «эдит обрабатывается», хотя ничего не запущено
      const es = b.editState && typeof b.editState === 'object' ? b.editState : {}, estate = ['running', 'done', 'failed'].includes(es.st) ? es.st : 'idle';
      const editStateS = '\nСостояние сборки эдита (достоверно, сообщает сам сайт): ' + (estate === 'running' ? 'сборка идёт прямо сейчас, сайт сам показывает прогресс и выдаст файл. Если спрашивают «что там», «готово», «когда», скажи, что сборка идёт, и не запускай новую.' : estate === 'done' ? 'последний эдит уже собран и показан в чате.' : estate === 'failed' ? 'последняя сборка НЕ удалась' + (es.err ? ' (' + String(es.err).replace(/[\r\n]+/g, ' ').slice(0, 160) + ')' : '') + '. Так и скажи, не говори, что он собирается.' : 'сейчас ничего не собирается.') + ' Сборка запускается ТОЛЬКО если ты вернул поле video. Если video не вернул, никогда не пиши «собираю», «обрабатывается», «скоро будет», «готово».';
      const sys = SOUND_SYS + '\nЯзык интерфейса: ' + (b.lang === 'ru' ? 'ru' : 'en') + '. Текущие настройки звука: ' + JSON.stringify(b.current || {}) +
        '\nВидео-студия: ' + (studioOk ? 'доступна этому пользователю. ' + VIDEO_SYS + (lastEditS ? ' Последний эдит (lastEdit): ' + lastEditS + '.' : '') + (vids ? ' Видео, которые пользователь прикрепил (по номерам): ' + vids + '.' : ' Видео пока не прикреплены.') : 'недоступна этому пользователю (нужен Premium). Если просят сделать видео или эдит, скажи об этом и не добавляй поле video.');
      const sysFull = sys + (studioOk ? editStateS : '');
      const attachIdx = msgs.length - 1;
      const ask = async turns => {
        if (GKEY) {
          const contents = turns.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] }));
          if (withFiles) contents[attachIdx].parts.push(...att.images.map(x => ({ inlineData: { mimeType: x.mime, data: x.data } })), ...att.pdfs.map(x => ({ inlineData: { mimeType: 'application/pdf', data: x.data } })));
          return geminiText(GKEY, sysFull, contents, smart, withFiles);
        }
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': AKEY, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(withFiles ? 50000 : 30000),
          body: JSON.stringify({ model: smart ? (process.env.ANTHROPIC_PRO_MODEL || 'claude-sonnet-5-5') : (process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5'), max_tokens: 900, system: sysFull, messages: turns.map((m, i) => ({ role: m.role, content: i === attachIdx && withFiles ? [...att.images.map(x => ({ type: 'image', source: { type: 'base64', media_type: x.mime, data: x.data } })), ...att.pdfs.map(x => ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: x.data } })), { type: 'text', text: m.text }] : m.text })) })
        });
        const j = await r.json();
        if (!r.ok) throw new Error('Claude ' + r.status + ': ' + JSON.stringify(j).slice(0, 300));
        return (j.content || []).map(c => c.text || '').join('');
      };
      // модель может ответить не JSON-ом (например, на «привет»): тогда весь текст и есть ответ
      const parseAI = txt => {
        let o; const clean = txt.replace(/```json|```/g, '').trim();
        try { o = JSON.parse(clean); } catch (e) { const m = clean.match(/\{[\s\S]*\}/); try { o = m ? JSON.parse(m[0]) : null; } catch (e2) { o = null; } }
        if (!o || typeof o !== 'object') o = { say: clean };
        return o;
      };
      let text = await ask(msgs), o = parseAI(text);
      // ИИ написал «собираю эдит», а поле video не вернул: ничего бы не запустилось. Просим исправиться один раз, иначе честно говорим, что сборки нет
      const hasVid = x => !!(x && x.video && typeof x.video === 'object' && x.video.type === 'edit');
      const claimsBuild = x => /собира|соберу|сборк|запустил|запускаю|обрабатыва|рендер|оставляю|убираю|меняю|сохраняю|эдит\s+(уже\s+)?(готов|собран)|видео\s+(уже\s+)?(готов|собран)|появится в чате|скоро (всё|он|будет|появ)|будет готов|building|processing|rendering|will appear|(edit|video|it)\s+(is|'s)\s+(ready|done)|in progress/i.test(x);
      if (studioOk && estate !== 'running' && vids && !hasVid(o) && claimsBuild(String(o.say || ''))) {
        try {
          const t2 = await ask([...msgs, { role: 'assistant', text: JSON.stringify({ say: String(o.say) }) }, { role: 'user', text: '[сообщение сайта, не от пользователя] Ты написал, что делаешь эдит, но не вернул поле video, поэтому ничего не запустилось. Верни ответ ещё раз, обязательно с полем video (учти lastEdit, если он есть). Если сделать это нельзя, честно напиши в say, что ничего не собирается, и почему.' }]);
          const o2 = parseAI(t2); if (hasVid(o2)) o = o2;
        } catch (e) { console.log('ai retry error:', e.message); }
        if (!hasVid(o) && claimsBuild(String(o.say || ''))) o.say = b.lang === 'ru' ? 'Сейчас ничего не собирается: сборка не запустилась. Напиши ещё раз, что изменить в эдите, и я соберу его заново.' : 'Nothing is being built right now: the build did not start. Tell me again what to change in the edit and I will rebuild it.';
      }
      const keep = {}; for (const k of ['say', 'speed', 'bass', 'reverb', 'pan', 'vol', 'treble', 'echo', 'muffle', 'sub', 'dist', 'search']) if (o[k] !== undefined) keep[k] = o[k];
      if (studioOk && o.video && typeof o.video === 'object' && o.video.type === 'edit' && JSON.stringify(o.video).length < 3000) { keep.video = fixVideoText(o.video, userSaid, userAll); if (/символ|надпис/i.test(keep.say || '')) keep.say = String(keep.say).replace(/«[^»]*»/g, keep.video.text ? '«' + keep.video.text.replace(/\n/g, ' ') + '»' : ''); }
      if (!keep.say) throw new Error('empty reply: ' + text.slice(0, 200));
      out(200, keep);
    } catch (e) { console.log('ai error:', e.message); out(500, { error: 'ИИ не смог обработать запрос. / AI could not process the request.' }); }
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

const fileCache = new Map(); // имя -> { m: mtime, raw, gz }
function sendCached(req, res, name, type, cc) {
  const fp = path.join(__dirname, name), bad = () => { res.writeHead(500); res.end(name + ' not found'); };
  fs.stat(fp, (e, st) => {
    if (e) return bad();
    const go = ent => {
      const h = { 'Content-Type': type, 'Cache-Control': cc, Vary: 'Accept-Encoding' };
      if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { h['Content-Encoding'] = 'gzip'; res.writeHead(200, h); res.end(ent.gz); } else { res.writeHead(200, h); res.end(ent.raw); }
    };
    const hit = fileCache.get(name);
    if (hit && hit.m === st.mtimeMs) return go(hit);
    fs.readFile(fp, (err, raw) => { if (err) return bad(); const ent = { m: st.mtimeMs, raw, gz: zlib.gzipSync(raw, { level: 9 }) }; fileCache.set(name, ent); go(ent); });
  });
}
const APP_FILES = { '/inter-light.woff': 'font/woff', '/manifest.webmanifest': 'application/manifest+json', '/sw.js': 'application/javascript; charset=utf-8',
  '/icon-192.png': 'image/png', '/icon-512.png': 'image/png', '/apple-touch-icon.png': 'image/png' };
const server = http.createServer((req, res) => {
  if (req.url === '/health') return res.end('ok');
  const pth = req.url.split('?')[0];
  if (pth === '/api/ai' && req.method === 'POST') {
    const jid = String(req.headers['x-job'] || '');
    if (/^[a-f0-9]{16,32}$/.test(jid) && aiJobs.size < 2000) {
      const job = { th: hash(req.headers['x-token'] || ''), st: 'run', at: Date.now() }; aiJobs.set(jid, job);
      const end = res.end.bind(res);
      res.end = b => { job.st = 'done'; job.code = res.statusCode || 200; job.body = b; job.at = Date.now(); try { return end(b); } catch (e) {} };
    }
    return soundAI(req, res);
  }
  if (pth === '/api/ai/job') { // забрать ответ ИИ, который досчитался, пока сайт был свёрнут
    const j = aiJobs.get(new URL(req.url, 'http://x').searchParams.get('id') || '');
    if (!j || j.th !== hash(req.headers['x-token'] || '')) return json(res, 404, { error: 'gone' });
    if (j.st !== 'done') return json(res, 202, { st: 'run' });
    res.writeHead(j.code, { 'Content-Type': 'application/json' }); return res.end(j.body);
  }
  if (pth === '/api/search') return musicSearch(req, res);
  if (pth === '/api/preview') return musicPreview(req, res);
  if (pth === '/tg' && req.method === 'POST') { // вебхук Telegram
    if (!BOT_TOKEN || req.headers['x-telegram-bot-api-secret-token'] !== hash(BOT_TOKEN).slice(0, 32)) { res.writeHead(403); return res.end(); }
    let b = ''; req.on('data', d => { b += d; if (b.length > 200000) req.destroy(); });
    return req.on('end', async () => { try { await onUpdate(JSON.parse(b)); } catch (e) { console.log('bot error:', e.message); } res.writeHead(200); res.end('ok'); });
  }
  if (pth === '/api/premium/link') { // ссылка на бота: купить (b) или восстановить (r)
    const tk = String(req.headers['x-token'] || '');
    if (tk.length < 20 || tk.length > 200) return json(res, 400, { error: 'bad token' });
    if (!BOT_TOKEN || !BOT_USER) return json(res, 501, { error: 'payments off' });
    const sq = new URL(req.url, 'http://x').searchParams, mode = sq.get('r') ? 'r' : 'b', pro = sq.get('pro') ? 'p' : '';
    return json(res, 200, { url: 'https://t.me/' + BOT_USER + '?start=' + pro + mode + '_' + pid(hash(tk)) });
  }
  if (pth === '/studio.js' || pth === '/api/studio-ai') { // только админы, владелец и премиум
    const th = hash(req.headers['x-token'] || '');
    return hasStudio(th).then(ok => {
      if (!ok) { res.writeHead(403); return res.end('forbidden'); }
      if (pth === '/api/studio-ai' && req.method === 'POST') return studioAI(req, res, th);
      if (pth === '/api/studio-ai') { res.writeHead(405); return res.end(); }
      sendCached(req, res, 'studio.js', 'application/javascript; charset=utf-8', 'no-store');
    }).catch(() => { res.writeHead(500); res.end('error'); });
  }
  const file = req.url.split('?')[0], type = APP_FILES[file];
  if (type) return fs.readFile(path.join(__dirname, file.slice(1)), (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': file === '/sw.js' ? 'no-cache' : 'public, max-age=86400' });
    res.end(data);
  });
  sendCached(req, res, 'index.html', 'text/html; charset=utf-8', 'no-cache');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
const clients = new Map(); // ws -> { h, id, name, since }
const banned = new Map();  // хэш -> до какого времени бан
const roleOf = h => roles[h] || 'user';
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const online = () => new Set([...clients.values()].map(c => c.h)).size;

function broadcast() {
  const now = Date.now(), n = online();
  const list = [...clients.values()].map(c => ({ id: c.id, name: c.name, role: roleOf(c.h), prem: isPrem(pid(c.h)), pro: isProNow(pid(c.h)), age: Math.round((now - c.since) / 1000) }));
  for (const w of wss.clients) send(w, { t: 'count', n });
  for (const [ws, c] of clients) {
    const role = roleOf(c.h);
    send(ws, { t: 'me', id: c.id, role, name: c.name, premium: premCache.get(pid(c.h)) || 0, pro: proCache.get(pid(c.h)) || 0 });
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
      await Promise.all([getPremium(pid(h)), getPro(pid(h))]);
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
    if (m.t === 'sync') { await Promise.all([getPremium(pid(c.h)), getPro(pid(c.h))]); return broadcast(); } // сайт вернулся из Telegram: обновить премиум
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
    } else if (m.t === 'grant' && role === 'owner') { // выдать премиум (days > 0 добавляет дни) или снять (days = 0)
      const tg2 = target(); if (!tg2 || roleOf(tg2[1].h) === 'owner') return;
      const p = pid(tg2[1].h), days = Math.round(Number(m.days));
      if (m.kind === 'pro') { if (days === 0) await setPro(p, 0); else if (days > 0 && days <= 3650) await addPro(p, days); else return; }
      else if (days === 0) await setPremium(p, 0); else if (days > 0 && days <= 3650) await addPremium(p, days); else return;
      broadcast();
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
loadRoles().then(() => server.listen(PORT, '0.0.0.0', () => {
  console.log('lowend on :' + PORT); startBot();
  if (BASE_URL && process.env.KEEP_ALIVE === '1') setInterval(() => fetch(BASE_URL + '/health').catch(() => {}), 10 * 60 * 1000); // KEEP_ALIVE=1: не даём серверу уснуть
}));
