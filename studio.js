// Студия lowend: видео с текстом поверх музыки. Этот файл сервер отдаёт только админам и владельцу.
(() => {
  if (window.openStudio) return;
  const EN = {"— выбрать —": "— select —", "Inter Light, узкий (как в референсе)": "Inter Light, narrow (like the reference)", "Inter Light (обычная ширина)": "Inter Light (normal width)", "Обычный": "Regular", "Жирный": "Bold", "Моно": "Mono", "Курсив с засечками": "Italic serif", "16:9 · 1022×576 (как в твоём видео)": "16:9 · 1022×576 (like in your video)", "Между началом и концом меньше секунды. Трек длится ": "Start and end are less than a second apart. Track length: ", "Скачать видео (": "Download video (", "Сохранить в Фото": "Save to Photos", "Скачать файл (в «Файлы»)": "Download file (to Files)", "Готово! Нажми «Сохранить в Фото» и выбери «Сохранить видео».": "Done! Tap “Save to Photos” and choose “Save Video”.", "Готово!": "Done!", "Не получилось записать видео.": "Could not record the video.", "Записываю: ": "Recording: ", " с. Не закрывай страницу и не блокируй экран.": " s. Don’t close the page or lock the screen.", "Этот браузер не умеет записывать видео.": "This browser can’t record video.", "Трек не найден.": "Track not found.", "Сначала загрузи трек на главной или выбери сохранённый.": "First load a track on the main screen or pick a saved one.", "ИИ думает…": "AI is thinking…", "Готово. Проверь превью и нажми «Сделать видео».": "Done. Check the preview and tap “Make video”.", "ИИ недоступен.": "AI is unavailable.", "Сначала загрузи трек на главной.": "Load a track on the main screen first.", "Название пресета:": "Preset name:", "Текущий трек на главной": "Current track on the main screen", "Трек на главной: ": "Main track: ", ". Секунды отсчитываются по времени самого трека.": ". Seconds are counted by the track’s own time.", "Студия": "Studio", "Закрыть": "Close", "ИИ-помощник (необязательно)": "AI assistant (optional)", "Например: как в прошлый раз, но текст lowend и 30 секунд": "E.g. like last time, but with the text “lowend” and 30 seconds", "ИИ": "AI", "Трек": "Track", "Мои пресеты (стиль без текста)": "My presets (style without text)", "Сохранить": "Save", "Удалить пресет": "Delete preset", "Текст": "Text", "Начало = позиция плеера": "Start = player position", "Конец = позиция плеера": "End = player position", "Шрифт": "Font", "Разрешение": "Resolution", "Цвет текста": "Text color", "Цвет фона": "Background color", "Размер текста": "Text size", "Длина (сек, 0 = до конца)": "Length (sec, 0 = to the end)", "Появление из темноты (сек)": "Fade in from black (sec)", "Начать трек с (сек)": "Start track at (sec)", "Закончить на (сек, 0 = до конца)": "End at (sec, 0 = to the end)", "Затухание звука в конце (сек)": "Audio fade-out at the end (sec)", "Полоска прогресса внизу": "Progress bar at the bottom", "Сделать видео": "Make video"};
  const tr = x => (typeof lang !== 'undefined' && lang === 'en' && EN[x]) || x; // язык берём с сайта
  const FONTS = {
    old: '300 {s}px "Lowend Inter", -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif',
    thin: '300 {s}px "Lowend Inter", -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif',
    sans: '400 {s}px "Instrument Sans", sans-serif',
    display: '800 {s}px "Bricolage Grotesque", sans-serif',
    mono: '400 {s}px "Space Mono", monospace',
    serif: 'italic 400 {s}px Georgia, serif'
  };
  const FONT_NAMES = { old: 'Inter Light, узкий (как в референсе)', thin: 'Inter Light (обычная ширина)', sans: 'Обычный', display: 'Жирный', mono: 'Моно', serif: 'Курсив с засечками' };
  // стиль референса: Inter Light, суженный до 71% (замер по скриншоту: высота/ширина строки даёт 70,5%), межстрочный 1,095,
  // чуть скруглённые края (тонкая обводка в цвет текста), текст чуть ниже центра, пустые строки не нужны
  const FSTYLE = { old: { sx: .71, lh: 1.095, dy: .024, noBlank: true, round: .006 } };
  // Inter Light отдаёт сервер (inter-light.woff). Без него canvas рисует системным шрифтом и текст выглядит «не таким»
  const ensureInter = async () => {
    try {
      if (![...document.fonts].some(f => String(f.family).replace(/[\"']/g, '') === 'Lowend Inter')) document.fonts.add(new FontFace('Lowend Inter', 'url(/inter-light.woff)', { weight: '300' }));
      await document.fonts.load('300 40px "Lowend Inter"', 'aя(');
    } catch (e) {}
  };
  const RES = { '1022x576': '16:9 · 1022×576 (как в твоём видео)', '1280x720': '16:9 · 720p', '1920x1080': '16:9 · 1080p', '720x1280': '9:16 · 720p', '1080x1920': '9:16 · 1080p', '1080x1080': '1:1 · 1080', '3840x2160': '16:9 · 4K · 3840×2160', '2160x3840': '9:16 · 4K · 2160×3840' };
  const SIZE_RES = { '16:9': '1280x720', '9:16': '720x1280', '1:1': '1080x1080' };
  const d = { v: 2, text: '', font: 'old', size: 15, color: '#ffffff', bg: '#000000', res: '1022x576', dur: 60, progress: false, fade: 2.6, start: 0, end: 0, afade: 3 };
  // студия помнит последние настройки, поэтому «как в прошлый раз» работает и после перезагрузки
  try { Object.assign(d, JSON.parse(localStorage.getItem('lowend_studio2') || '{}')); } catch (e) {}
  if (d.v !== 2) { d.v = 2; d.font = 'old'; d.size = 15; } // старые сохранения: переходим на шрифт референса
  d.start = 0; d.end = 0; // начало и конец не запоминаем: у каждого трека свои
  if (!FONTS[d.font]) d.font = 'old';
  if (!RES[d.res]) d.res = '1022x576';
  const keep = () => { try { localStorage.setItem('lowend_studio2', JSON.stringify(d)); } catch (e) {} };
  // пресеты: сохраняют стиль (без текста), чтобы выбирать «мой стиль» в один клик
  const STYLE = ['font', 'size', 'color', 'bg', 'res', 'dur', 'progress', 'fade', 'afade'], PKEY = 'lowend_presets';
  const getP = () => { try { return JSON.parse(localStorage.getItem(PKEY) || '{}'); } catch (e) { return {}; } };
  const setP = o => { try { localStorage.setItem(PKEY, JSON.stringify(o)); } catch (e) {} };
  function fillPresets(pick) {
    const sel = $('stPreset'); sel.innerHTML = '';
    const first = document.createElement('option'); first.value = ''; first.textContent = tr('— выбрать —'); sel.append(first);
    Object.keys(getP()).forEach(k => { const o = document.createElement('option'); o.value = o.textContent = k; sel.append(o); });
    if (pick) sel.value = pick;
  }
  let root = null, cv = null, busy = false;

  const css = document.createElement('style');
  css.textContent = `#studio{position:fixed;inset:0;z-index:80;background:#000;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;-webkit-text-size-adjust:100%;padding:16px}
#studio .box{max-width:760px;margin:0 auto;padding-bottom:60px;min-width:0}
#studio .f,#studio .two>*{min-width:0}
#studio .bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
#studio h2{margin:0}
#studio canvas{width:100%;height:auto;border-radius:12px;border:1px solid var(--edge);display:block}
#studio .f{display:grid;gap:6px;margin-top:14px}
#studio label{font-weight:600;font-size:14px}
#studio input[type=text],#studio input[type=number],#studio select,#studio textarea{width:100%;background:var(--field);border:1px solid var(--edge);border-radius:12px;padding:11px 12px;color:var(--text);font:inherit;font-size:16px;max-width:100%;box-sizing:border-box}
#studio textarea{min-height:84px;resize:vertical}
#studio .two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
#studio input[type=color]{width:100%;height:44px;border:1px solid var(--edge);border-radius:12px;background:var(--field);padding:4px}
#studio video{width:100%;max-width:100%;margin-top:12px;border-radius:12px}`;
  document.head.append(css);
  document.addEventListener('gesturestart', e => { if (root && !root.hidden) e.preventDefault(); }, { passive: false }); // iOS: без щипка-приближения в студии

  function wrap(g, text, maxW) {
    const out = [];
    String(text).split('\n').forEach(par => {
      let line = '';
      par.split(' ').forEach(w => { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; });
      out.push(line);
    });
    return out;
  }
  function draw(g, w, h, prog, t) {
    const a = (d.fade > 0 && t !== undefined) ? Math.min(1, t / d.fade) : 1; // плавное появление текста из темноты
    g.globalAlpha = 1; g.fillStyle = d.bg; g.fillRect(0, 0, w, h);
    const fs = Math.round(h * d.size / 100), st = FSTYLE[d.font] || {}, sx = st.sx || 1;
    g.font = FONTS[d.font].replace('{s}', fs); g.fillStyle = d.color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fontKerning = 'normal'; g.textRendering = 'geometricPrecision';
    let lines = wrap(g, d.text, w * .84 / sx); if (st.noBlank) lines = lines.filter(Boolean);
    const lh = fs * (st.lh || 1.35), y0 = h * (.5 + (st.dy || 0)) - (lines.length - 1) * lh / 2;
    g.globalAlpha = a; g.save(); g.scale(sx, 1);
    if (st.round) { g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = fs * st.round; g.strokeStyle = d.color; }
    lines.forEach((l, i) => { const x = w / 2 / sx, y = y0 + i * lh; g.fillText(l, x, y); if (st.round) g.strokeText(l, x, y); });
    g.restore();
    if (d.progress) {
      const bw = w * .84, bh = Math.max(3, h * .005), x = w * .08, y = h * .93;
      g.globalAlpha = .25 * a; g.fillRect(x, y, bw, bh); g.globalAlpha = a; g.fillRect(x, y, bw * prog, bh);
    }
  }
  function preview() {
    keep();
    const [w, h] = d.res.split('x').map(Number);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    draw(cv.getContext('2d'), w, h, .3);
  }
  function autoText() {
    const p = [];
    if (S.speed < 1) p.push('slowed'); else if (S.speed > 1) p.push('speed up');
    if (S.bass > 0) p.push('bass'); if (S.reverb > 0) p.push('reverb'); if (S.pan > 0) p.push('8D');
    return (title || 'lowend') + (p.length ? '\n(' + p.join(' + ') + ')' : '');
  }
  function sync() {
    $('stText').value = d.text; $('stFont').value = d.font; $('stSize').value = d.size; $('stColor').value = d.color;
    $('stBg').value = d.bg; $('stRes').value = d.res; $('stDur').value = d.dur; $('stFade').value = d.fade; $('stStart').value = d.start; $('stEnd').value = d.end; $('stAfade').value = d.afade; $('stProg').checked = d.progress; preview();
  }
  function applyAI(j) {
    if (typeof j.text === 'string') d.text = j.text.slice(0, 200);
    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    if (has(FONTS, j.font)) d.font = j.font;
    if (has(RES, j.resolution)) d.res = j.resolution; else if (has(SIZE_RES, j.size)) d.res = SIZE_RES[j.size];
    if (j.fade != null && isFinite(+j.fade)) d.fade = Math.max(0, Math.min(10, +j.fade));
    if (+j.duration) d.dur = Math.max(5, Math.min(300, Math.round(+j.duration)));
    if (/^#[0-9a-f]{6}$/i.test(j.color)) d.color = j.color;
    if (/^#[0-9a-f]{6}$/i.test(j.bg)) d.bg = j.bg;
    if (typeof j.progress === 'boolean') d.progress = j.progress;
    if (j.track) { const o = [...$('stTrack').options].find(o => o.textContent === j.track); if (o) $('stTrack').value = o.value; }
    sync();
  }
  async function askAI() {
    const prompt = $('stAI').value.trim(), st = $('stStatus'); if (!prompt) return;
    st.textContent = tr('ИИ думает…');
    try {
      const all = await tx('readonly', s => s.getAll());
      const r = await fetch('/api/studio-ai', { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': tok },
        body: JSON.stringify({ prompt, tracks: all.map(t => t.title), current: { ...d, track: $('stTrack').selectedOptions[0].textContent } }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      applyAI(j); st.textContent = tr('Готово. Проверь превью и нажми «Сделать видео».');
    } catch (e) { st.textContent = e.message || tr('ИИ недоступен.'); }
  }
  async function render() {
    if (busy) return; busy = true; const st = $('stStatus'), btn = $('stGo'); btn.disabled = true;
    try {
      const sel = $('stTrack').value;
      if (sel !== 'cur') {
        const t = (await tx('readonly', s => s.getAll())).find(x => String(x.id) === sel); if (!t) throw new Error(tr('Трек не найден.'));
        await loadFile(t.blob, t.title, true); setSettings(t.speed, t.bass, t.reverb, t.pan, t.vol, t.treble, t.echo, t.muffle, t.sub || 0, t.dist || 0);
      }
      if (!buffer) throw new Error(tr('Сначала загрузи трек на главной или выбери сохранённый.'));
      initAudio(); if (ctx.state !== 'running') await ctx.resume();
      try { await ensureInter(); await document.fonts.load('800 40px "Bricolage Grotesque"'); await document.fonts.load('400 40px "Space Mono"'); await document.fonts.load('400 40px "Instrument Sans"'); } catch (e) {}
      const uhd = /^(3840x2160|2160x3840)$/.test(d.res); // 4K: нужен уровень H.264 5.1
      const type = [...(uhd ? ['video/mp4;codecs=avc1.640033,mp4a.40.2'] : []), 'video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4D401F,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
      if (!type) throw new Error(tr('Этот браузер не умеет записывать видео.'));
      const endT = d.end > 0 ? Math.min(d.end, buffer.duration) : buffer.duration; // «закончить на»: 0 = до конца трека
      const room = (endT - (d.start || 0)) / S.speed;
      if (room < 1) throw new Error(tr('Между началом и концом меньше секунды. Трек длится ') + fmt(buffer.duration) + '.');
      const len = d.end > 0 ? room : (d.dur > 0 ? Math.min(d.dur, room) : room); // длина 0 = до конца трека
      const [w, h] = d.res.split('x').map(Number); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.textRendering = 'geometricPrecision'; g.fontKerning = 'normal'; const dest = ctx.createMediaStreamDestination(), fadeG = ctx.createGain(); nodes.out.connect(fadeG); fadeG.connect(dest);
      const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: Math.max(w, h) >= 3840 ? 45e6 : Math.max(w, h) >= 1920 ? 20e6 : 12e6, audioBitsPerSecond: 256000 });
      const chunks = []; mr.ondataavailable = e => e.data.size && chunks.push(e.data);
      const stopped = new Promise(r => mr.onstop = r);
      draw(g, w, h, 0, 0); mr.start(1000); outEl.play().catch(() => {}); startAt(d.start || 0);
      const af = Math.min(d.afade || 0, len), now = ctx.currentTime; // звук плавно затихает к концу видео
      fadeG.gain.setValueAtTime(1, now);
      if (af > 0) { fadeG.gain.setValueAtTime(1, now + len - af); fadeG.gain.linearRampToValueAtTime(0, now + len); }
      const t0 = performance.now(), ms = len * 1000;
      await new Promise(done => (function tick() {
        const el = performance.now() - t0; draw(g, w, h, Math.min(1, el / ms), el / 1000);
        st.textContent = tr('Записываю: ') + Math.round(el / 1000) + ' / ' + Math.round(len) + tr(' с. Не закрывай страницу и не блокируй экран.');
        el >= ms ? done() : requestAnimationFrame(tick);
      })());
      mr.stop(); await stopped; stopSrc(); playing = false; outEl.pause(); setPlayUI(); nodes.out.disconnect(fadeG); fadeG.disconnect();
      const blob = new Blob(chunks, { type: type.split(';')[0] }), url = URL.createObjectURL(blob), ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
      $('stOut').innerHTML = ''; const v = document.createElement('video'); v.src = url; v.controls = true; v.playsInline = true;
      const a = document.createElement('a'); a.href = url; a.download = (title || 'video') + '.' + ext; a.textContent = tr('Скачать видео (') + ext + ')';
      a.className = 'btn'; a.style.cssText = 'display:block;text-align:center;margin-top:10px;text-decoration:none';
      $('stOut').append(v);
      // iPhone: через меню «Поделиться» видео сохраняется прямо в Фото, а не в «Файлы»
      const probe = new File([blob], 'v.' + ext, { type: blob.type }), canShare = !!(navigator.canShare && navigator.canShare({ files: [probe] }));
      if (canShare) {
        const sv = document.createElement('button'); sv.className = 'btn'; sv.style.cssText = 'display:block;width:100%;margin-top:10px'; sv.textContent = tr('Сохранить в Фото');
        sv.onclick = async () => { try { await navigator.share({ files: [new File([blob], (title || 'video') + '.' + ext, { type: blob.type })] }); } catch (e) {} };
        $('stOut').append(sv); a.className = 'btn ghost'; a.textContent = tr('Скачать файл (в «Файлы»)');
      }
      $('stOut').append(a); st.textContent = canShare ? tr('Готово! Нажми «Сохранить в Фото» и выбери «Сохранить видео».') : tr('Готово!'); preview();
    } catch (e) { st.textContent = e.message || tr('Не получилось записать видео.'); }
    busy = false; btn.disabled = false;
  }

  async function build() {
    root = document.createElement('div'); root.id = 'studio';
    root.innerHTML = `<div class="box">
      <div class="bar"><h2>${tr('Студия')}</h2><button class="btn ghost sm" id="stClose">${tr('Закрыть')}</button></div>
      <canvas id="stCanvas"></canvas>
      <div class="f"><label for="stAI">${tr('ИИ-помощник (необязательно)')}</label>
        <div class="src"><input type="text" id="stAI" placeholder="${tr('Например: как в прошлый раз, но текст lowend и 30 секунд')}"><button class="btn ghost sm" id="stAIgo">${tr('ИИ')}</button></div></div>
      <div class="f"><label for="stTrack">${tr('Трек')}</label><select id="stTrack"></select></div>
      <div class="f"><label for="stPreset">${tr('Мои пресеты (стиль без текста)')}</label>
        <div class="src"><select id="stPreset"></select><button class="btn ghost sm" id="stPSave">${tr('Сохранить')}</button><button class="btn ghost sm" id="stPDel" aria-label="${tr('Удалить пресет')}">✕</button></div></div>
      <div class="f"><label for="stText">${tr('Текст')}</label><textarea id="stText"></textarea></div>
      <p class="hint" id="stLen" style="margin-top:14px"></p>
      <div class="src" style="margin-top:6px"><button class="btn ghost sm" id="stHereA" style="flex:1">${tr('Начало = позиция плеера')}</button><button class="btn ghost sm" id="stHereB" style="flex:1">${tr('Конец = позиция плеера')}</button></div>
      <div class="two">
        <div class="f"><label for="stFont">${tr('Шрифт')}</label><select id="stFont">${Object.entries(FONT_NAMES).map(([k, v]) => `<option value="${k}">${tr(v)}</option>`).join('')}</select></div>
        <div class="f"><label for="stRes">${tr('Разрешение')}</label><select id="stRes">${Object.entries(RES).map(([k, v]) => `<option value="${k}">${tr(v)}</option>`).join('')}</select></div>
        <div class="f"><label for="stColor">${tr('Цвет текста')}</label><input type="color" id="stColor"></div>
        <div class="f"><label for="stBg">${tr('Цвет фона')}</label><input type="color" id="stBg"></div>
        <div class="f"><label for="stSize">${tr('Размер текста')}</label><input type="range" id="stSize" min="4" max="16" step="0.5"></div>
        <div class="f"><label for="stDur">${tr('Длина (сек, 0 = до конца)')}</label><input type="number" id="stDur" min="0" max="300"></div>
        <div class="f"><label for="stFade">${tr('Появление из темноты (сек)')}</label><input type="number" id="stFade" min="0" max="10" step="0.1"></div>
        <div class="f"><label for="stStart">${tr('Начать трек с (сек)')}</label><input type="number" id="stStart" min="0" step="0.1"></div>
        <div class="f"><label for="stEnd">${tr('Закончить на (сек, 0 = до конца)')}</label><input type="number" id="stEnd" min="0" step="0.1"></div>
        <div class="f"><label for="stAfade">${tr('Затухание звука в конце (сек)')}</label><input type="number" id="stAfade" min="0" max="15" step="0.5"></div>
      </div>
      <label style="display:flex;gap:8px;align-items:center;margin-top:14px"><input type="checkbox" id="stProg"> ${tr('Полоска прогресса внизу')}</label>
      <button class="btn" id="stGo" style="width:100%;margin-top:16px">${tr('Сделать видео')}</button>
      <p class="hint" id="stStatus" style="margin-top:10px;text-align:center"></p>
      <div id="stOut"></div>${edHTML()}</div>`;
    document.body.append(root); cv = $('stCanvas');
    $('stClose').onclick = () => root.hidden = true;
    $('stGo').onclick = render; $('stAIgo').onclick = askAI;
    $('stAI').addEventListener('keydown', e => e.key === 'Enter' && askAI());
    const bind = (id, key, fn = v => v) => $(id).oninput = e => { d[key] = fn(e.target.type === 'checkbox' ? e.target.checked : e.target.value); preview(); };
    bind('stText', 'text'); bind('stFont', 'font'); bind('stRes', 'res'); bind('stColor', 'color'); bind('stBg', 'bg'); bind('stProg', 'progress');
    bind('stSize', 'size', Number); bind('stDur', 'dur', v => (+v === 0 ? 0 : Math.max(5, Math.min(300, +v || 60))));
    bind('stFade', 'fade', v => Math.max(0, Math.min(10, +v || 0)));
    bind('stStart', 'start', v => Math.max(0, +v || 0)); bind('stEnd', 'end', v => Math.max(0, +v || 0));
    const here = key => { if (!buffer) { $('stStatus').textContent = tr('Сначала загрузи трек на главной.'); return; } d[key] = Math.round(pos() * 10) / 10; sync(); };
    $('stHereA').onclick = () => here('start'); $('stHereB').onclick = () => here('end'); bind('stAfade', 'afade', v => Math.max(0, Math.min(15, +v || 0)));
    $('stProg').onchange = $('stProg').oninput;
    fillPresets();
    $('stPreset').onchange = e => {
      const pr = getP()[e.target.value]; if (!pr) return;
      STYLE.forEach(k => { if (pr[k] !== undefined) d[k] = pr[k]; });
      if (!FONTS[d.font]) d.font = 'thin'; if (!RES[d.res]) d.res = '1022x576'; sync();
    };
    $('stPSave').onclick = () => {
      const name = (prompt(tr('Название пресета:')) || '').trim().slice(0, 30); if (!name) return;
      const all = getP(); all[name] = Object.fromEntries(STYLE.map(k => [k, d[k]])); setP(all); fillPresets(name);
    };
    $('stPDel').onclick = () => { const k = $('stPreset').value; if (!k) return; const all = getP(); delete all[k]; setP(all); fillPresets(); };
    edWire();
  }
  // --- эдит: поиск битов и план нарезки (чистые функции) ---
  function edPeaks(buf, cutoff) { // моменты резких ударов в звуке, секунды
    const sr = buf.sampleRate, hop = Math.max(1, Math.round(sr * .01)), n = Math.floor(buf.length / hop);
    const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
    const al = 1 - Math.exp(-2 * Math.PI * cutoff / sr); let lp = 0;
    const env = new Float32Array(n);
    for (let f = 0; f < n; f++) { let s = 0; for (let i = f * hop, e = i + hop; i < e; i++) { lp += al * ((a[i] + b[i]) * .5 - lp); s += lp * lp; } env[f] = Math.sqrt(s / hop); }
    const fl = new Float32Array(n); for (let i = 1; i < n; i++) fl[i] = Math.max(0, env[i] - env[i - 1]);
    const pre = new Float64Array(n + 1); for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + fl[i];
    const out = [];
    for (let i = 3; i < n - 3; i++) {
      const lo = Math.max(0, i - 50), hi = Math.min(n, i + 51), mean = (pre[hi] - pre[lo]) / (hi - lo);
      if (fl[i] <= mean * 1.6 + 1e-5) continue;
      let top = true; for (let j = i - 3; j <= i + 3; j++) if (fl[j] > fl[i]) { top = false; break; }
      if (top) out.push(i * hop / sr);
    }
    return out;
  }
  function edBeats(buf, from, to) { // времена от начала куска (0..to-from)
    const dur = to - from; let p = edPeaks(buf, 180);
    const win = x => x.filter(t => t >= from && t < to).map(t => t - from);
    let w = win(p);
    if (w.length < dur * .8) { const q = win(edPeaks(buf, 4000)); w = [...w, ...q].sort((x, y) => x - y).filter((t, i, arr) => !i || t - arr[i - 1] > .08); }
    return w;
  }
  function edCuts(peaks, len, gaps, rnd) { // точки склейки: на ближайший бит после минимальной паузы
    const pick = () => gaps[Math.floor(rnd() * gaps.length)];
    const cuts = [0]; let last = 0, pi = 0, g = pick();
    while (last < len - .2) {
      while (pi < peaks.length && peaks[pi] < last + g) pi++;
      const next = (pi < peaks.length && peaks[pi] - (last + g) < .35) ? peaks[pi] : last + g;
      if (next >= len - .15) break;
      cuts.push(next); last = next; g = pick();
    }
    cuts.push(len); return cuts;
  }
  function edPlan(cuts, pool, rnd) { // pool: [{dur, used}], used общий для копий одного видео
    const segs = []; let prev = -1;
    for (let i = 0; i < cuts.length - 1; i++) {
      const dur = cuts[i + 1] - cuts[i], opts = pool.map((_, k) => k).filter(k => k !== prev), k = opts[Math.floor(rnd() * opts.length)], p = pool[k];
      const room = Math.max(0, p.dur - dur - .1); let off = 0;
      for (let t = 0; t < 10; t++) { off = rnd() * room; if (!p.used.some(([x, y]) => off < y && off + dur > x)) break; }
      p.used.push([off, off + dur]); segs.push({ t0: cuts[i], t1: cuts[i + 1], k, off }); prev = k;
    }
    return segs;
  }
  // --- эдит: интерфейс, ИИ, фильтры, надписи и сборка видео ---
  Object.assign(EN, { 'Эдит из видео (клипы под бит)': 'Video edit (clips on the beat)', 'Сделать эдит': 'Make the edit', 'Добавь хотя бы одно видео.': 'Add at least one video.', 'Разбираю музыку…': 'Analyzing the music…', 'Быстро (каждый бит)': 'Fast (every beat)', 'Средне': 'Medium', 'Медленно': 'Slow', 'Вразнобой': 'Mixed', 'Темп нарезки': 'Cutting pace', 'Длина эдита (сек)': 'Edit length (s)', 'Музыка с (сек)': 'Music from (s)', 'Клипы брать и из видео с музыкой': 'Also use the music video for clips', 'Скачать видео (': 'Download video (', 'Надпись и символы поверх (необязательно)': 'Text and symbols on top (optional)', 'Фильтр': 'Filter', 'Без фильтра': 'No filter', 'Чёрно-белый': 'Black & white', 'Тёплый': 'Warm', 'Холодный': 'Cool', 'Мрачный': 'Moody', 'Яркий': 'Vivid', 'Виньетка': 'Vignette', 'Зерно': 'Film grain', 'Вспышка на ударе': 'Flash on beat', 'Пульс приближения на ударе': 'Zoom pulse on beat', 'Качество': 'Quality', 'Высокое': 'High', 'Максимум': 'Maximum', 'Быстро': 'Fast', 'Кадров в секунду': 'Frames per second', 'Положение надписи': 'Text position', 'Сверху': 'Top', 'По центру': 'Center', 'Снизу': 'Bottom', 'Опиши эдит словами': 'Describe the edit', 'ИИ думает…': 'AI is thinking…' });
  let edItems = [], edMusic = 0; const edCustom = new Set();
  const edMsg = m => { const s = $('edStatus'); if (s) s.textContent = m; };
  const evenN = n => Math.max(2, Math.round(n / 2) * 2);
  const edHTML = () => `<details id="edBox" style="margin-top:26px"><summary style="font-weight:600;cursor:pointer">${tr('Эдит из видео (клипы под бит)')}</summary>
      <p class="hint" style="margin-top:10px">${tr('Добавь видео: из одного возьмётся музыка, из остальных нарежутся клипы вразброс под биты.')}</p>
      <div class="f"><label for="edAI">${tr('Опиши эдит словами')}</label><div class="src"><input type="text" id="edAI" placeholder="${tr('Например: разрешение как у первого видео, быстро, ч/б, надпись ★ nexide')}"><button class="btn ghost sm" id="edAIgo">${tr('ИИ')}</button></div></div>
      <input type="file" id="edFiles" accept="video/*" multiple style="margin-top:12px">
      <div id="edList"></div>
      <div class="two">
        <div class="f"><label for="edTempo">${tr('Темп нарезки')}</label><select id="edTempo"><option value="fast">${tr('Быстро (каждый бит)')}</option><option value="mid" selected>${tr('Средне')}</option><option value="slow">${tr('Медленно')}</option><option value="mix">${tr('Вразнобой')}</option></select></div>
        <div class="f"><label for="edRes">${tr('Разрешение')}</label><select id="edRes"></select></div>
        <div class="f"><label for="edLen">${tr('Длина эдита (сек)')}</label><input type="number" id="edLen" min="3" max="120" value="15"></div>
        <div class="f"><label for="edStart">${tr('Музыка с (сек)')}</label><input type="number" id="edStart" min="0" step="0.1" value="0"></div>
        <div class="f"><label for="edFilter">${tr('Фильтр')}</label><select id="edFilter"><option value="none">${tr('Без фильтра')}</option><option value="bw">${tr('Чёрно-белый')}</option><option value="warm">${tr('Тёплый')}</option><option value="cool">${tr('Холодный')}</option><option value="moody">${tr('Мрачный')}</option><option value="vivid">${tr('Яркий')}</option></select></div>
        <div class="f"><label for="edQ">${tr('Качество')}</label><select id="edQ"><option value="high" selected>${tr('Высокое')}</option><option value="max">${tr('Максимум')}</option><option value="fast">${tr('Быстро')}</option></select></div>
        <div class="f"><label for="edFps">${tr('Кадров в секунду')}</label><select id="edFps"><option value="60" selected>60</option><option value="30">30</option></select></div>
      </div>
      <div style="display:grid;gap:8px;margin-top:14px">
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="edVig"> ${tr('Виньетка')}</label>
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="edGrain"> ${tr('Зерно')}</label>
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="edFlash"> ${tr('Вспышка на ударе')}</label>
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="edZoom"> ${tr('Пульс приближения на ударе')}</label>
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="edAlso"> ${tr('Клипы брать и из видео с музыкой')}</label>
      </div>
      <div class="f"><label for="edText">${tr('Надпись и символы поверх (необязательно)')}</label><textarea id="edText" placeholder="★ nexide ★"></textarea></div>
      <div class="two">
        <div class="f"><label for="edTextPos">${tr('Положение надписи')}</label><select id="edTextPos"><option value="center">${tr('По центру')}</option><option value="top">${tr('Сверху')}</option><option value="bottom">${tr('Снизу')}</option></select></div>
        <div class="f"><label for="edTextFont">${tr('Шрифт')}</label><select id="edTextFont">${Object.entries(FONT_NAMES).map(([k, v]) => `<option value="${k}">${tr(v)}</option>`).join('')}</select></div>
        <div class="f"><label for="edTextColor">${tr('Цвет текста')}</label><input type="color" id="edTextColor" value="#ffffff"></div>
        <div class="f"><label for="edTextSize">${tr('Размер текста')}</label><input type="range" id="edTextSize" min="3" max="16" step="0.5" value="7"></div>
      </div>
      <button class="btn" id="edGo" style="width:100%;margin-top:16px">${tr('Сделать эдит')}</button>
      <p class="hint" id="edStatus" style="margin-top:10px;text-align:center"></p>
      <div id="edOut"></div></details>`;
  const ED_RES = ['1080x1920', '720x1280', '2160x3840', '1920x1080', '1280x720', '3840x2160', '1080x1080'];
  function edResOpts() {
    const sel = $('edRes'); if (!sel) return; const keep = sel.value || '1080x1920'; sel.innerHTML = '';
    const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); };
    ED_RES.forEach(v => add(v, (v.split('x')[0] * 1 < v.split('x')[1] * 1 ? '9:16' : v.split('x')[0] === v.split('x')[1] ? '1:1' : '16:9') + ' · ' + v.replace('x', '×')));
    edCustom.forEach(v => add(v, v.replace('x', '×')));
    edItems.forEach((it, i) => add('v:' + i, tr('Как у ') + '«' + it.name.slice(0, 24) + '» (' + evenN(it.w) + '×' + evenN(it.h) + ')'));
    sel.value = [...sel.options].some(o => o.value === keep) ? keep : '1080x1920';
  }
  function edList() {
    const box = $('edList'); if (!box) return; box.innerHTML = '';
    if (edMusic >= edItems.length) edMusic = 0;
    edItems.forEach((it, i) => {
      const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px';
      const lb = document.createElement('label'); lb.style.cssText = 'display:flex;gap:8px;align-items:center;flex:1;min-width:0;font-weight:400';
      const rd = document.createElement('input'); rd.type = 'radio'; rd.name = 'edMusic'; rd.checked = i === edMusic; rd.onchange = () => { edMusic = i; };
      const nm = document.createElement('span'); nm.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; nm.textContent = (i + 1) + '. ' + it.name + ' · ' + Math.round(it.dur) + tr(' с');
      lb.append(rd, nm);
      const x = document.createElement('button'); x.className = 'btn ghost sm'; x.textContent = '✕'; x.onclick = () => { URL.revokeObjectURL(it.url); edItems.splice(i, 1); edList(); };
      row.append(lb, x); box.append(row);
    });
    if (edItems.length) { const h = document.createElement('p'); h.className = 'hint'; h.textContent = tr('Кружок = откуда брать музыку.'); box.append(h); }
    edResOpts();
  }
  async function edAdd(files) {
    for (const f of files) {
      if (edItems.length >= 12) { edMsg(tr('Максимум 12 видео.')); break; }
      const url = URL.createObjectURL(f), v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = url;
      const ok = await new Promise(res => { v.onloadedmetadata = () => res(true); v.onerror = () => res(false); setTimeout(() => res(false), 8000); });
      if (!ok || !isFinite(v.duration) || v.duration < .5) { URL.revokeObjectURL(url); edMsg(tr('Не получилось открыть ') + f.name); continue; }
      edItems.push({ file: f, url, dur: v.duration, name: f.name, w: v.videoWidth || 1080, h: v.videoHeight || 1920 });
    }
    edList();
  }
  const FILTERS = ['none', 'bw', 'warm', 'cool', 'moody', 'vivid'], TEMPOS = ['fast', 'mid', 'slow', 'mix'], POS = ['top', 'center', 'bottom'], QS = ['fast', 'high', 'max'];
  function edRead() {
    return { music: edMusic + 1, also: $('edAlso').checked, res: $('edRes').value, len: +$('edLen').value || 15, start: +$('edStart').value || 0, tempo: $('edTempo').value,
      text: $('edText').value, textPos: $('edTextPos').value, textColor: $('edTextColor').value, textFont: $('edTextFont').value, textSize: +$('edTextSize').value || 7,
      filter: $('edFilter').value, vignette: $('edVig').checked, grain: $('edGrain').checked, flash: $('edFlash').checked, zoom: $('edZoom').checked, fps: +$('edFps').value || 60, quality: $('edQ').value };
  }
  function edApply(j) { // настройки от ИИ: всё проверяем
    const setv = (id, v) => { const el = $(id); if (el) el.value = v; }, setc = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
    if (+j.music >= 1 && +j.music <= edItems.length) edMusic = Math.round(+j.music) - 1;
    if (typeof j.also === 'boolean') setc('edAlso', j.also);
    if (typeof j.res === 'string') {
      let m;
      if ((m = /^same:(\d+)$/.exec(j.res))) { if (edItems[+m[1] - 1]) { edList(); setv('edRes', 'v:' + (+m[1] - 1)); } }
      else if ((m = /^(\d{3,4})x(\d{3,4})$/.exec(j.res)) && +m[1] >= 240 && +m[2] >= 240 && +m[1] <= 3840 && +m[2] <= 3840) {
        const val = evenN(+m[1]) + 'x' + evenN(+m[2]); if (!ED_RES.includes(val)) edCustom.add(val); edResOpts(); setv('edRes', val);
      }
    }
    if (+j.len) setv('edLen', Math.max(3, Math.min(120, Math.round(+j.len))));
    if (j.start != null && isFinite(+j.start) && +j.start >= 0) setv('edStart', Math.round(+j.start * 10) / 10);
    if (TEMPOS.includes(j.tempo)) setv('edTempo', j.tempo);
    if (typeof j.text === 'string') setv('edText', j.text.slice(0, 200));
    if (POS.includes(j.textPos)) setv('edTextPos', j.textPos);
    if (/^#[0-9a-f]{6}$/i.test(j.textColor)) setv('edTextColor', j.textColor);
    if (Object.prototype.hasOwnProperty.call(FONTS, j.textFont)) setv('edTextFont', j.textFont);
    if (+j.textSize) setv('edTextSize', Math.max(3, Math.min(16, +j.textSize)));
    if (FILTERS.includes(j.filter)) setv('edFilter', j.filter);
    ['vignette:edVig', 'grain:edGrain', 'flash:edFlash', 'zoom:edZoom'].forEach(p => { const [k, id] = p.split(':'); if (typeof j[k] === 'boolean') setc(id, j[k]); });
    if (+j.fps === 30 || +j.fps === 60) setv('edFps', +j.fps);
    if (QS.includes(j.quality)) setv('edQ', j.quality);
    edList();
  }
  async function edAIgo() {
    const prompt = $('edAI').value.trim(); if (!prompt) return; edMsg(tr('ИИ думает…'));
    try {
      const r = await fetch('/api/studio-ai', { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': tok },
        body: JSON.stringify({ mode: 'edit', prompt, videos: edItems.map(i => ({ name: i.name, w: i.w, h: i.h, dur: Math.round(i.dur) })), current: edRead() }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      edApply(j); edMsg(tr('Готово. Проверь настройки и нажми «Сделать эдит».'));
    } catch (e) { edMsg(e.message || tr('ИИ недоступен.')); }
  }
  function edShow(blob, type, name) {
    const out = $('edOut'); out.innerHTML = '';
    const url = URL.createObjectURL(blob), ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
    const v = document.createElement('video'); v.src = url; v.controls = true; v.playsInline = true; out.append(v);
    const a = document.createElement('a'); a.href = url; a.download = name + '.' + ext; a.className = 'btn'; a.style.cssText = 'display:block;text-align:center;margin-top:10px;text-decoration:none'; a.textContent = tr('Скачать видео (') + ext + ')';
    const probe = new File([blob], 'v.' + ext, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [probe] })) {
      const sv = document.createElement('button'); sv.className = 'btn'; sv.style.cssText = 'display:block;width:100%;margin-top:10px'; sv.textContent = tr('Сохранить в Фото');
      sv.onclick = async () => { try { await navigator.share({ files: [new File([blob], name + '.' + ext, { type: blob.type })] }); } catch (e) {} };
      out.append(sv); a.className = 'btn ghost'; a.textContent = tr('Скачать файл (в «Файлы»)');
    }
    out.append(a);
  }
  // фильтры без ctx.filter (его нет в Safari): режимы наложения работают везде
  let noiseCv = null, noisePat = null;
  function edFx(g, w, h, E, fl) {
    const f = E.filter;
    if (f !== 'none') {
      g.save();
      if (f === 'bw') { g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); }
      else if (f === 'warm') { g.globalCompositeOperation = 'soft-light'; g.fillStyle = 'rgba(255,150,40,.5)'; g.fillRect(0, 0, w, h); }
      else if (f === 'cool') { g.globalCompositeOperation = 'soft-light'; g.fillStyle = 'rgba(40,120,255,.5)'; g.fillRect(0, 0, w, h); }
      else if (f === 'moody') { g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(120,135,175,.6)'; g.fillRect(0, 0, w, h); }
      else if (f === 'vivid') { g.globalCompositeOperation = 'soft-light'; g.globalAlpha = .7; g.drawImage(g.canvas, 0, 0); }
      g.restore();
    }
    if (E.vignette) { const r = Math.hypot(w, h) / 2, gr = g.createRadialGradient(w / 2, h / 2, r * .35, w / 2, h / 2, r); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    if (E.grain) {
      if (!noisePat) { noiseCv = document.createElement('canvas'); noiseCv.width = noiseCv.height = 256; const n = noiseCv.getContext('2d'), im = n.createImageData(256, 256); for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } n.putImageData(im, 0, 0); noisePat = g.createPattern(noiseCv, 'repeat'); }
      g.save(); g.translate(-Math.random() * 256, -Math.random() * 256); g.globalCompositeOperation = 'overlay'; g.globalAlpha = .2; g.fillStyle = noisePat; g.fillRect(0, 0, w + 256, h + 256); g.restore();
    }
    if (E.flash && fl > 0) { g.fillStyle = 'rgba(255,255,255,' + (.45 * fl).toFixed(3) + ')'; g.fillRect(0, 0, w, h); }
  }
  function edTextDraw(g, w, h, E, t) {
    const txt = String(E.text || '').trim(); if (!txt) return;
    const fs = Math.round(h * E.textSize / 100), st = FSTYLE[E.textFont] || {}, sx = st.sx || 1;
    g.save(); g.font = FONTS[E.textFont].replace('{s}', fs); g.fillStyle = E.textColor; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fontKerning = 'normal';
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = fs * .25;
    let lines = wrap(g, txt, w * .84 / sx); if (st.noBlank) lines = lines.filter(Boolean);
    const lh = fs * (st.lh || 1.3), cy = E.textPos === 'top' ? h * .14 : E.textPos === 'bottom' ? h * .86 : h * .5, y0 = cy - (lines.length - 1) * lh / 2;
    g.globalAlpha = Math.min(1, t / .5); g.scale(sx, 1);
    lines.forEach((l, i) => g.fillText(l, w / 2 / sx, y0 + i * lh)); g.restore();
  }
  async function edRender() {
    if (busy) return;
    if (!edItems.length) return edMsg(tr('Добавь хотя бы одно видео.'));
    busy = true; const btn = $('edGo'); btn.disabled = true; const pool = [];
    try {
      const E = edRead(), mi = Math.min(edMusic, edItems.length - 1), music = edItems[mi];
      initAudio(); if (ctx.state !== 'running') await ctx.resume();
      try { await ensureInter(); await document.fonts.load('800 40px "Bricolage Grotesque"'); await document.fonts.load('400 40px "Space Mono"'); await document.fonts.load('400 40px "Instrument Sans"'); } catch (e) {}
      edMsg(tr('Разбираю музыку…'));
      let buf; try { buf = await ctx.decodeAudioData(await music.file.arrayBuffer()); } catch (e) { throw new Error(tr('Не получилось достать звук из видео ') + music.name); }
      const start = Math.max(0, E.start), len = Math.min(Math.max(3, E.len), 120, buf.duration - start);
      if (len < 2) throw new Error(tr('В видео с музыкой после этой секунды меньше 2 секунд звука. Его длина: ') + Math.round(buf.duration) + tr(' с'));
      let srcIdx = edItems.map((_, i) => i).filter(i => i !== mi);
      if (!srcIdx.length || E.also) srcIdx = edItems.map((_, i) => i);
      const usedBy = {}, per = srcIdx.length === 1 ? 2 : 1;
      for (const i of srcIdx) for (let k = 0; k < per; k++) {
        const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.src = edItems[i].url;
        v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none'; root.append(v);
        pool.push({ v, dur: edItems[i].dur, used: usedBy[i] || (usedBy[i] = []) });
      }
      edMsg(tr('Готовлю клипы…'));
      await Promise.all(pool.map(p => new Promise(res => { p.v.onloadeddata = res; p.v.onerror = res; setTimeout(res, 10000); p.v.play().then(() => p.v.pause(), () => {}); })));
      const gaps = { fast: [.3], mid: [.6], slow: [1.2], mix: [.3, .6, .3, 1.2, .45] }[E.tempo] || [.6];
      const cuts = edCuts(edBeats(buf, start, start + len), len, gaps, Math.random), segs = edPlan(cuts, pool, Math.random);
      let w, h; const vm = /^v:(\d+)$/.exec(E.res);
      if (vm && edItems[+vm[1]]) { w = evenN(edItems[+vm[1]].w); h = evenN(edItems[+vm[1]].h); } else [w, h] = E.res.split('x').map(Number);
      const fps = E.fps === 30 ? 30 : 60, c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      const cover = (v, z) => { const vw = v.videoWidth, vh = v.videoHeight; if (!vw) return; const k = Math.max(w / vw, h / vh) * z; g.drawImage(v, (w - vw * k) / 2, (h - vh * k) / 2, vw * k, vh * k); };
      const type = ['video/mp4;codecs=avc1.64002A,mp4a.40.2', 'video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4D401F,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
      if (!type) throw new Error(tr('Этот браузер не умеет записывать видео.'));
      const dest = ctx.createMediaStreamDestination(), fadeG = ctx.createGain(), src = ctx.createBufferSource(); src.buffer = buf; src.connect(fadeG); fadeG.connect(dest);
      const stream = new MediaStream([...c.captureStream(fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const q = E.quality === 'max' ? { k: .32, cap: 80e6 } : E.quality === 'fast' ? { k: .12, cap: 30e6 } : { k: .2, cap: 50e6 };
      const mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: Math.round(Math.min(q.cap, Math.max(6e6, w * h * fps * q.k))), audioBitsPerSecond: 256000 });
      const chunks = []; mr.ondataavailable = e => e.data.size && chunks.push(e.data);
      const stopped = new Promise(r => mr.onstop = r);
      const seek = (v, t) => new Promise(res => { const f = () => { v.removeEventListener('seeked', f); res(); }; v.addEventListener('seeked', f); v.currentTime = t; setTimeout(f, 1500); });
      await seek(pool[segs[0].k].v, segs[0].off); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); cover(pool[segs[0].k].v, 1);
      mr.start(1000); src.start(0, start, len);
      const af = Math.min(d.afade || 0, len), now = ctx.currentTime; fadeG.gain.setValueAtTime(1, now);
      if (af > 0) { fadeG.gain.setValueAtTime(1, now + len - af); fadeG.gain.linearRampToValueAtTime(0, now + len); }
      let cur = -1; const t0 = performance.now();
      await new Promise(done => (function tick() {
        const t = (performance.now() - t0) / 1000; let i = cur < 0 ? 0 : cur;
        while (i < segs.length - 1 && t >= segs[i].t1) i++;
        if (i !== cur) {
          if (cur >= 0) pool[segs[cur].k].v.pause();
          pool[segs[i].k].v.play().catch(() => {}); cur = i;
          if (i + 1 < segs.length) { const nv = pool[segs[i + 1].k].v; nv.pause(); nv.currentTime = segs[i + 1].off; } // следующий клип готовим заранее
        }
        const dt = t - segs[cur].t0, v = pool[segs[cur].k].v;
        if (!v.seeking && v.readyState >= 2) cover(v, E.zoom ? 1 + .08 * Math.pow(Math.max(0, 1 - dt / .22), 2) : 1);
        edFx(g, w, h, E, Math.max(0, 1 - dt / .12)); edTextDraw(g, w, h, E, t);
        edMsg(tr('Записываю: ') + Math.round(t) + ' / ' + Math.round(len) + tr(' с. Не закрывай страницу и не блокируй экран.'));
        t >= len ? done() : requestAnimationFrame(tick);
      })());
      mr.stop(); await stopped; try { src.stop(); } catch (e) {} fadeG.disconnect();
      edShow(new Blob(chunks, { type: type.split(';')[0] }), type, 'lowend-edit');
      edMsg(tr('Готово!'));
    } catch (e) { edMsg(e.message || tr('Не получилось собрать эдит.')); }
    pool.forEach(p => { p.v.pause(); p.v.remove(); });
    busy = false; btn.disabled = false;
  }
  function edWire() {
    $('edFiles').onchange = async e => { const fl = [...e.target.files]; e.target.value = ''; await edAdd(fl); };
    $('edGo').onclick = edRender; $('edAIgo').onclick = edAIgo; $('edAI').addEventListener('keydown', e => e.key === 'Enter' && edAIgo()); edList();
  }
  // чат lowend AI передаёт сюда настройки и прикреплённые видео: Студия открывается уже настроенной, остаётся нажать кнопку
  window.studioFromChat = async (spec, files) => {
    if (!spec || typeof spec !== 'object') return;
    await window.openStudio();
    if (spec.type === 'text') { applyAI(spec); $('stStatus').textContent = tr('ИИ настроил видео. Проверь превью и нажми «Сделать видео».'); return; }
    const key = f => f.name + ':' + f.size, have = new Set(edItems.map(i => key(i.file)));
    await edAdd((files || []).filter(f => !have.has(key(f))));
    const idx = n => { const f = (files || [])[n - 1]; return f ? edItems.findIndex(i => key(i.file) === key(f)) + 1 : 0; };
    const s = { ...spec }; if (+s.music) s.music = idx(+s.music) || undefined;
    const m = /^same:(\d+)$/.exec(String(s.res || '')); if (m) s.res = idx(+m[1]) ? 'same:' + idx(+m[1]) : undefined;
    edApply(s); $('edBox').open = true; $('edBox').scrollIntoView({ block: 'start' });
    edMsg(tr('ИИ всё настроил. Проверь настройки и нажми «Сделать эдит».'));
  };
  window.studioLang = async () => { if (!root || busy) return; const open = !root.hidden; root.remove(); root = null; if (open) await window.openStudio(); fillPresetsSafe(); };
  const fillPresetsSafe = () => { if (root) fillPresets(); };
  window.openStudio = async () => {
    if (!root) await build();
    root.hidden = false;
    const all = await tx('readonly', s => s.getAll()), sel = $('stTrack'), keep = sel.value;
    sel.innerHTML = '<option value="cur">' + tr('Текущий трек на главной') + '</option>' + all.map(t => `<option value="${t.id}">${t.title.replace(/</g, '&lt;')}</option>`).join('');
    if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
    if (!d.text) d.text = autoText();
    await ensureInter();
    $('stLen').textContent = buffer ? tr('Трек на главной: ') + fmt(buffer.duration) + tr('. Секунды отсчитываются по времени самого трека.') : '';
    sync();
  };
})();
