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
  css.textContent = `#studio{position:fixed;inset:0;z-index:80;background:#000;overflow:auto;padding:16px}
#studio .box{max-width:760px;margin:0 auto;padding-bottom:60px}
#studio .bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
#studio h2{margin:0}
#studio canvas{width:100%;height:auto;border-radius:12px;border:1px solid var(--edge);display:block}
#studio .f{display:grid;gap:6px;margin-top:14px}
#studio label{font-weight:600;font-size:14px}
#studio input[type=text],#studio input[type=number],#studio select,#studio textarea{width:100%;background:var(--field);border:1px solid var(--edge);border-radius:12px;padding:11px 12px;color:var(--text);font:inherit}
#studio textarea{min-height:84px;resize:vertical}
#studio .two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#studio input[type=color]{width:100%;height:44px;border:1px solid var(--edge);border-radius:12px;background:var(--field);padding:4px}
#studio video{width:100%;margin-top:12px;border-radius:12px}`;
  document.head.append(css);

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
      <div id="stOut"></div></div>`;
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
  }
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
