// Студия lowend: видео с текстом поверх музыки. Этот файл сервер отдаёт только админам и владельцу.
(() => {
  if (window.openStudio) return;
  const EN = {"— выбрать —": "— select —", "Inter Light, узкий (как в референсе)": "Inter Light, narrow (like the reference)", "Inter Light (обычная ширина)": "Inter Light (normal width)", "Обычный": "Regular", "Жирный": "Bold", "Моно": "Mono", "Курсив с засечками": "Italic serif", "16:9 · 1022×576 (как в твоём видео)": "16:9 · 1022×576 (like in your video)", "Между началом и концом меньше секунды. Трек длится ": "Start and end are less than a second apart. Track length: ", "Скачать видео (": "Download video (", "Сохранить в Фото": "Save to Photos", "Скачать файл (в «Файлы»)": "Download file (to Files)", "Готово! Нажми «Сохранить в Фото» и выбери «Сохранить видео».": "Done! Tap “Save to Photos” and choose “Save Video”.", "Готово!": "Done!", "Не получилось записать видео.": "Could not record the video.", "Записываю: ": "Recording: ", " с.": " s.", "Этот браузер не умеет записывать видео.": "This browser can’t record video.", "Трек не найден.": "Track not found.", "Сначала загрузи трек на главной или выбери сохранённый.": "First load a track on the main screen or pick a saved one.", "ИИ думает…": "AI is thinking…", "Готово. Проверь превью и нажми «Сделать видео».": "Done. Check the preview and tap “Make video”.", "ИИ недоступен.": "AI is unavailable.", "Сначала загрузи трек на главной.": "Load a track on the main screen first.", "Название пресета:": "Preset name:", "Текущий трек на главной": "Current track on the main screen", "Трек на главной: ": "Main track: ", ". Секунды отсчитываются по времени самого трека.": ". Seconds are counted by the track’s own time.", "Студия": "Studio", "Закрыть": "Close", "ИИ-помощник (необязательно)": "AI assistant (optional)", "Например: как в прошлый раз, но текст lowend и 30 секунд": "E.g. like last time, but with the text “lowend” and 30 seconds", "ИИ": "AI", "Трек": "Track", "Мои пресеты (стиль без текста)": "My presets (style without text)", "Сохранить": "Save", "Удалить пресет": "Delete preset", "Текст": "Text", "Начало = позиция плеера": "Start = player position", "Конец = позиция плеера": "End = player position", "Шрифт": "Font", "Разрешение": "Resolution", "Цвет текста": "Text color", "Цвет фона": "Background color", "Размер текста": "Text size", "Длина (сек, 0 = до конца)": "Length (sec, 0 = to the end)", "Появление из темноты (сек)": "Fade in from black (sec)", "Начать трек с (сек)": "Start track at (sec)", "Закончить на (сек, 0 = до конца)": "End at (sec, 0 = to the end)", "Затухание звука в конце (сек)": "Audio fade-out at the end (sec)", "Полоска прогресса внизу": "Progress bar at the bottom", "Сделать видео": "Make video"};
  const tr = x => (typeof lang !== 'undefined' && lang === 'en' && EN[x]) || x; // язык берём с сайта
  const act = x => EN[x] || x; // подписи действий (открываю, записываю…) всегда по-английски, как у Claude: и в русской, и в английской версии
  const FONTS = {
    old: '300 {s}px "Lowend Inter", -apple-system, "Helvetica Neue", Helvetica, Arial, "Apple Symbols", "Cambria Math", "Times New Roman", serif',
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
    let lines = wrap(g, String(d.text).replace(/[\uFE0E\uFE0F]/g, ''), w * .84 / sx); if (st.noBlank) lines = lines.filter(Boolean);
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
    if (typeof j.text === 'string') d.text = j.text.replace(/\\n/g, '\n').slice(0, 200);
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
    } catch (e) { st.textContent = (e.name === 'TypeError' ? '' : e.message) || tr('ИИ недоступен.'); }
  }
  async function render() {
    if (busy) return; busy = true; const st = $('stStatus'), btn = $('stGo'); btn.disabled = true; let mrR = null, fadeR = null;
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
      mrR = mr; fadeR = fadeG; draw(g, w, h, 0, 0); mr.start(1000); outEl.play().catch(() => {}); startAt(d.start || 0);
      const af = Math.min(d.afade || 0, len), now = ctx.currentTime; // звук плавно затихает к концу видео
      fadeG.gain.setValueAtTime(1, now);
      if (af > 0) { fadeG.gain.setValueAtTime(1, now + len - af); fadeG.gain.linearRampToValueAtTime(0, now + len); }
      const t0 = performance.now(), ms = len * 1000;
      await new Promise(done => (function tick() {
        const el = performance.now() - t0; draw(g, w, h, Math.min(1, el / ms), el / 1000);
        st.textContent = tr('Записываю: ') + Math.round(el / 1000) + ' / ' + Math.round(len) + tr(' с.');
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
    } catch (e) {
      console.error('studio render error:', e);
      if (mrR) { // сбой посреди записи: останавливаем запись и звук, чтобы ничего не осталось работать в фоне
        try { if (mrR.state !== 'inactive') mrR.stop(); } catch (e2) {} try { nodes.out.disconnect(fadeR); fadeR.disconnect(); } catch (e2) {}
        try { stopSrc(); playing = false; outEl.pause(); setPlayUI(); } catch (e2) {}
      }
      st.textContent = humanErr(e, tr('Не получилось записать видео.'));
    }
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
  // --- эдит: собирается из чата lowend AI (window.studioEdit). Интерфейса эдита в Студии больше нет: Студия только для видео с текстом ---
  Object.assign(EN, { 'Добавь хотя бы одно видео.': 'Add at least one video.', 'Разбираю музыку…': 'Analyzing the music…', 'Готовлю клипы…': 'Preparing the clips…', 'Открываю видео…': 'Opening the videos…', 'Не получилось открыть ': 'Could not open ', 'Студия занята: дождись конца текущей сборки.': 'The Studio is busy: wait for the current render to finish.', 'Записываю: ': 'Recording: ', ' с.': ' s.', 'Не получилось достать звук из видео ': 'Could not get the sound from ', 'В этом видео нет звука: ': 'This video has no sound: ', 'В видео с музыкой после этой секунды меньше 2 секунд звука. Его длина: ': 'The music video has under 2 seconds of sound after that second. Its length: ', 'Этот браузер не умеет записывать видео.': 'This browser cannot record video.' });
  // --- понятные сообщения об ошибках: свои тексты показываем как есть, а сырые ошибки браузера и кода переводим на человеческий ---
  Object.assign(EN, {
    'Не получилось прочитать звук из видео. Попробуй другое видео или сохрани его как MP4.': 'Could not read the sound from the video. Try another video or save it as MP4.',
    'Этот телефон не смог записать видео в таком формате. Попробуй разрешение поменьше, например 720p.': 'This device could not record video in this format. Try a lower resolution, for example 720p.',
    'Браузер не дал записать видео или звук. Нажми ещё раз.': 'The browser did not allow recording video or sound. Tap again.',
    'Не хватило памяти. Попробуй видео покороче или поменьше разрешение.': 'Out of memory. Try shorter videos or a lower resolution.',
    'Не получилось собрать эдит.': 'Could not build the edit.',
    'Это ошибка внутри сайта, а не в твоих видео': 'This is a bug inside the site, not a problem with your videos'
  });
  const CODE_ERR = /Can't find variable|is not defined|is not a function|is not an object|\(evaluating|Cannot read prop|undefined is not|null is not|not iterable/i;
  function humanErr(e, fallback) {
    const n = (e && e.name) || '', m = String((e && e.message) || e || '').trim();
    if (n === 'Error' && m && !CODE_ERR.test(m)) return m; // наши собственные сообщения уже понятные
    if (n === 'EncodingError') return tr('Не получилось прочитать звук из видео. Попробуй другое видео или сохрани его как MP4.');
    if (n === 'NotSupportedError') return tr('Этот телефон не смог записать видео в таком формате. Попробуй разрешение поменьше, например 720p.');
    if (n === 'NotAllowedError' || n === 'SecurityError') return tr('Браузер не дал записать видео или звук. Нажми ещё раз.');
    if (n === 'QuotaExceededError' || /out of memory|allocation|array buffer/i.test(m)) return tr('Не хватило памяти. Попробуй видео покороче или поменьше разрешение.');
    return (fallback || tr('Не получилось собрать эдит.')) + ' ' + tr('Это ошибка внутри сайта, а не в твоих видео') + (m ? ' (' + (n && n !== 'Error' ? n + ': ' : '') + m.slice(0, 120) + ')' : '') + '.';
  }
  window.studioErr = humanErr;
  // --- эффекты и надпись эдита. Фильтры сделаны режимами наложения canvas, а не ctx.filter: в Safari на iPhone ctx.filter не работает ---
  const noiseTiles = [];
  function noiseTile(i) {
    if (!noiseTiles.length) for (let n = 0; n < 4; n++) {
      const c = document.createElement('canvas'); c.width = c.height = 192;
      const x = c.getContext('2d'), im = x.createImageData(192, 192), a = im.data;
      for (let q = 0; q < a.length; q += 4) { const v = (Math.random() * 255) | 0; a[q] = a[q + 1] = a[q + 2] = v; a[q + 3] = 255; }
      x.putImageData(im, 0, 0); noiseTiles.push(c);
    }
    return noiseTiles[i % noiseTiles.length];
  }
  let grainN = 0;
  function edFx(g, w, h, E, flash, pz) { // фильтр, виньетка, зерно и вспышка поверх уже нарисованного кадра
    g.save();
    const fill = (op, col, a) => { g.globalCompositeOperation = op; g.globalAlpha = a; g.fillStyle = col; g.fillRect(0, 0, w, h); };
    switch (E.filter) {
      case 'bright': fill('screen', '#1a1a1a', 1); fill('soft-light', '#ffffff', .7); break; // светлый: поднимает тени и добавляет яркости
      case 'bw': fill('saturation', '#808080', 1); break;
      case 'warm': fill('soft-light', '#ff8a2a', .55); break;
      case 'cool': fill('soft-light', '#2a7bff', .55); break;
      case 'moody': fill('saturation', '#808080', .45); fill('multiply', '#8fa0b8', .55); break;
      case 'vivid': try { g.globalCompositeOperation = 'overlay'; g.globalAlpha = .45; g.drawImage(g.canvas, 0, 0); } catch (e) {} break;
    }
    if (E.vignette) {
      const r = Math.hypot(w, h) / 2, gr = g.createRadialGradient(w / 2, h / 2, r * .35, w / 2, h / 2, r);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.65)');
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    if (E.grain) {
      const sc = Math.max(1, Math.round(h / 540)), ox = Math.random() * 192 * sc, oy = Math.random() * 192 * sc;
      g.globalCompositeOperation = 'overlay'; g.globalAlpha = .16; g.translate(-ox, -oy); g.scale(sc, sc);
      g.fillStyle = g.createPattern(noiseTile(grainN++), 'repeat'); g.fillRect(0, 0, (w + 192 * sc) / sc, (h + 192 * sc) / sc);
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (E.glitch && pz > .05) { // глитч на ударе: полосы кадра сдвигаются вбок, часть полос с цветным оттенком
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      for (let i = 0, n = 3 + Math.floor(Math.random() * 4); i < n; i++) {
        const sh = Math.max(2, Math.round(h * (.01 + Math.random() * .06))), y = Math.floor(Math.random() * (h - sh)), dx = Math.round((Math.random() * 2 - 1) * w * .08 * pz);
        try { g.drawImage(g.canvas, 0, y, w, sh, dx, y, w, sh); } catch (e) {}
        if (Math.random() < .4) { g.globalCompositeOperation = 'screen'; g.globalAlpha = .35 * pz; g.fillStyle = Math.random() < .5 ? '#ff0040' : '#00c8ff'; g.fillRect(0, y, w, sh); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
      }
    }
    if (E.flash && flash > 0) fill('source-over', '#ffffff', Math.min(.5, flash * flash * .5));
    g.restore();
  }
  function edTextDraw(g, w, h, E, t) { edText1(g, w, h, E, t); (E.texts || []).forEach(x => edText1(g, w, h, { ...E, textDur: 0, textStart: 0, textFade: .6, ...x }, t)); }
  function edText1(g, w, h, E, t) { // одна надпись поверх эдита: шрифт, цвет, размер и положение берём из настроек
    const txt = String(E.text || '').replace(/[\uFE0E\uFE0F]/g, '').trim(); if (!txt) return;
    const fs = Math.round(h * E.textSize / 100), st = FSTYLE[E.textFont] || {}, sx = st.sx || 1;
    t -= E.textStart || 0; if (t < 0) return; // надпись может появиться не сразу
    let al = Math.min(1, t / .4); // надпись плавно появляется в начале
    if (E.textDur > 0) { if (t >= E.textDur) return; al = Math.min(al, E.textFade > 0 ? (E.textDur - t) / E.textFade : 1); } // и плавно гаснет к концу заданного времени
    g.save(); g.globalAlpha = Math.max(0, Math.min(1, al));
    g.font = (FONTS[E.textFont] || FONTS.old).replace('{s}', fs); g.fillStyle = E.textColor; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fontKerning = 'normal';
    let lines = wrap(g, txt, w * .84 / sx); if (st.noBlank) lines = lines.filter(Boolean);
    const lh = fs * (st.lh || 1.35), half = (lines.length - 1) * lh / 2;
    const cy = E.textPos === 'top' ? h * .12 + half : E.textPos === 'bottom' ? h * .88 - half : h * (.5 + (st.dy || 0));
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = fs * .18; // лёгкая тень, чтобы буквы читались на светлых кадрах
    g.scale(sx, 1);
    if (st.round) { g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = fs * st.round; g.strokeStyle = E.textColor; }
    lines.forEach((l, i) => { const x = w / 2 / sx, y = cy - half + i * lh; g.fillText(l, x, y); if (st.round) g.strokeText(l, x, y); });
    g.restore();
  }
  function edFrame(g, w, h, E, t, len) { // кинорамка и затемнение всего видео (поверх надписей)
    g.save(); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000';
    if (E.letterbox) { const b = Math.round(h * .11); g.globalAlpha = 1; g.fillRect(0, 0, w, b); g.fillRect(0, h - b, w, b); }
    let a = 0; if (E.fadeIn > 0 && t < E.fadeIn) a = Math.max(a, 1 - t / E.fadeIn);
    if (E.fadeOut > 0 && t > len - E.fadeOut) a = Math.max(a, (t - (len - E.fadeOut)) / E.fadeOut);
    if (a > 0) { g.globalAlpha = Math.min(1, a); g.fillRect(0, 0, w, h); }
    g.restore();
  }
  const evenN = n => Math.max(2, Math.round(n / 2) * 2);
  const FILTERS = ['none', 'bright', 'bw', 'warm', 'cool', 'moody', 'vivid'], TEMPOS = ['fast', 'mid', 'slow', 'mix'], POS = ['top', 'center', 'bottom'], QS = ['fast', 'high', 'max'];
  const ED_DEF = { music: 1, also: false, res: 'v:0', len: 15, start: 0, tempo: 'mid', text: '', textPos: 'center', textColor: '#ffffff', textFont: 'old', textSize: 7, textDur: 0, textFade: .6, textStart: 0, texts: [], shake: false, glitch: false, letterbox: false, fadeIn: 0, fadeOut: 0, filter: 'none', vignette: false, grain: false, flash: false, zoom: false, fps: 60, quality: 'high' };
  function edSpec(j, items) { // настройки от ИИ -> проверенные настройки эдита
    const E = { ...ED_DEF }, has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    if (+j.music >= 1 && +j.music <= items.length) E.music = Math.round(+j.music);
    if (typeof j.also === 'boolean') E.also = j.also;
    if (typeof j.res === 'string') {
      let m;
      if ((m = /^same:(\d+)$/.exec(j.res))) { if (items[+m[1] - 1]) E.res = 'v:' + (+m[1] - 1); }
      else if ((m = /^(\d{3,4})x(\d{3,4})$/.exec(j.res)) && +m[1] >= 240 && +m[2] >= 240 && +m[1] <= 3840 && +m[2] <= 3840) E.res = evenN(+m[1]) + 'x' + evenN(+m[2]);
    }
    if (+j.len) E.len = Math.max(3, Math.min(120, Math.round(+j.len)));
    if (j.start != null && isFinite(+j.start) && +j.start >= 0) E.start = Math.round(+j.start * 10) / 10;
    if (TEMPOS.includes(j.tempo)) E.tempo = j.tempo;
    if (typeof j.text === 'string') E.text = j.text.replace(/\\n/g, '\n').slice(0, 200);
    if (POS.includes(j.textPos)) E.textPos = j.textPos;
    if (/^#[0-9a-f]{6}$/i.test(j.textColor)) E.textColor = j.textColor;
    if (typeof j.textFont === 'string' && has(FONTS, j.textFont)) E.textFont = j.textFont;
    if (+j.textSize) E.textSize = Math.max(2, Math.min(16, +j.textSize));
    if (j.textDur != null && isFinite(+j.textDur) && +j.textDur >= 0) E.textDur = Math.min(120, Math.round(+j.textDur * 10) / 10); // сколько секунд надпись видна с начала (0 = весь эдит)
    if (j.textFade != null && isFinite(+j.textFade) && +j.textFade >= 0) E.textFade = Math.min(5, Math.round(+j.textFade * 10) / 10); // плавное исчезновение, секунды
    if (FILTERS.includes(j.filter)) E.filter = j.filter;
    if (j.textStart != null && isFinite(+j.textStart) && +j.textStart >= 0) E.textStart = Math.min(120, +j.textStart);
    if (j.fadeIn != null && isFinite(+j.fadeIn)) E.fadeIn = Math.max(0, Math.min(10, +j.fadeIn)); // из чёрного в начале, секунды
    if (j.fadeOut != null && isFinite(+j.fadeOut)) E.fadeOut = Math.max(0, Math.min(10, +j.fadeOut)); // в чёрное в конце
    if (Array.isArray(j.texts)) E.texts = j.texts.slice(0, 5).filter(x => x && typeof x.text === 'string' && x.text.trim()).map(x => { // дополнительные надписи
      const y = { text: x.text.replace(/\\n/g, '\n').slice(0, 120) };
      if (POS.includes(x.textPos)) y.textPos = x.textPos;
      if (+x.textSize) y.textSize = Math.max(2, Math.min(16, +x.textSize));
      if (/^#[0-9a-f]{6}$/i.test(x.textColor)) y.textColor = x.textColor;
      if (typeof x.textFont === 'string' && has(FONTS, x.textFont)) y.textFont = x.textFont;
      [['textDur', 120], ['textFade', 5], ['textStart', 120]].forEach(([k, m]) => { if (x[k] != null && isFinite(+x[k]) && +x[k] >= 0) y[k] = Math.min(m, +x[k]); });
      return y;
    });
    ['vignette', 'grain', 'flash', 'zoom', 'shake', 'glitch', 'letterbox'].forEach(k => { if (typeof j[k] === 'boolean') E[k] = j[k]; });
    if (+j.fps === 30 || +j.fps === 60) E.fps = +j.fps;
    if (QS.includes(j.quality)) E.quality = j.quality;
    return E;
  }
  // кэши: одно и то же видео не разбираем дважды (ключ: имя + размер + дата)
  const edMeta = new Map(), edAud = new Map(), fkey = f => f.name + ':' + f.size + ':' + (f.lastModified || 0);
  function edProbe(f) { // длина и размер видео
    const k = fkey(f); if (edMeta.has(k)) return edMeta.get(k);
    const p = new Promise((res, rej) => {
      const url = URL.createObjectURL(f), v = document.createElement('video'); let fin = false, tm = 0;
      const end = ok => {
        if (fin) return; fin = true; clearTimeout(tm); v.onloadedmetadata = v.onerror = null;
        const r = { dur: v.duration, w: v.videoWidth || 1080, h: v.videoHeight || 1920 }; v.removeAttribute('src'); try { v.load(); } catch (e) {} URL.revokeObjectURL(url);
        ok && isFinite(r.dur) && r.dur >= .5 ? res(r) : rej(new Error(tr('Не получилось открыть ') + f.name));
      };
      v.preload = 'metadata'; v.muted = true; v.playsInline = true; tm = setTimeout(() => end(false), 8000);
      v.onloadedmetadata = () => end(true); v.onerror = () => end(false); v.src = url;
    });
    edMeta.set(k, p); p.catch(() => edMeta.delete(k)); return p;
  }
  // Звук из MP4/MOV без чтения всего видео: находим звуковую дорожку AAC и собираем из неё поток ADTS, который понимает decodeAudioData.
  // Читаются только нужные куски файла, поэтому и память, и время уходят в разы меньше, чем при декодировании целого видео.
  // null: дорожка в другом формате (тогда звук берётся обычным путём); 'none': в видео нет звука.
  async function mp4Aac(f) {
    const rd = async (a, b) => new DataView(await f.slice(a, b).arrayBuffer());
    const u32 = (v, o) => v.getUint32(o), tag = (v, o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    let pos = 0, moov = null;
    while (pos + 8 <= f.size) { // верхний уровень: ищем moov (он бывает и в начале, и в конце файла)
      const h = await rd(pos, pos + 16); let size = u32(h, 0), hd = 8; const ty = tag(h, 4);
      if (size === 1) { size = Number(h.getBigUint64(8)); hd = 16; } else if (size === 0) size = f.size - pos;
      if (size < hd) return null;
      if (ty === 'moov') { if (size > 64e6) return null; moov = await rd(pos + hd, pos + size); break; }
      pos += size;
    }
    if (!moov) return null;
    const kids = (v, a, b) => { const out = []; let p = a; while (p + 8 <= b) { let s = u32(v, p), hd = 8; if (s === 1) { s = Number(v.getBigUint64(p + 8)); hd = 16; } else if (s === 0) s = b - p; if (s < hd || p + s > b) break; out.push({ t: tag(v, p + 4), a: p + hd, b: p + s }); p += s; } return out; };
    const find = (v, a, b, t) => kids(v, a, b).find(x => x.t === t);
    let soun = false, track = null;
    for (const tr of kids(moov, 0, moov.byteLength).filter(x => x.t === 'trak')) {
      const mdia = find(moov, tr.a, tr.b, 'mdia'); if (!mdia) continue;
      const hdlr = find(moov, mdia.a, mdia.b, 'hdlr'); if (!hdlr || tag(moov, hdlr.a + 8) !== 'soun') continue;
      soun = true;
      const minf = find(moov, mdia.a, mdia.b, 'minf'), stbl = minf && find(moov, minf.a, minf.b, 'stbl'); if (!stbl) continue;
      track = { v: moov, stbl }; break;
    }
    if (!soun) return 'none';
    if (!track) return null;
    const v = track.v, S = k => find(v, track.stbl.a, track.stbl.b, k);
    const stsd = S('stsd'), stsz = S('stsz'), stsc = S('stsc'), stco = S('stco') || S('co64');
    if (!stsd || !stsz || !stsc || !stco) return null;
    const ent = kids(v, stsd.a + 8, stsd.b)[0]; if (!ent || ent.t !== 'mp4a') return null;
    const ver = v.getUint16(ent.a + 8), hd0 = ver === 1 ? 44 : ver === 2 ? 64 : 28; // версия описания звука: у .mov с iPhone обычно 1 (QuickTime), там esds лежит внутри wave
    let esds = find(v, ent.a + hd0, ent.b, 'esds'); if (!esds) { const wv = find(v, ent.a + hd0, ent.b, 'wave'); esds = wv && find(v, wv.a, wv.b, 'esds'); }
    if (!esds) return null;
    let p = esds.a + 4, cfg = null; // дескрипторы: ищем 0x05 (AudioSpecificConfig)
    const len = () => { let n = 0; for (let i = 0; i < 4; i++) { const b = v.getUint8(p++); n = (n << 7) | (b & 127); if (!(b & 128)) break; } return n; };
    while (p < esds.b) { const tg = v.getUint8(p++); const n = len(); if (tg === 3) p += 3; else if (tg === 4) p += 13; else if (tg === 5) { cfg = [v.getUint8(p), v.getUint8(p + 1)]; break; } else p += n; }
    if (!cfg) return null;
    const aot = cfg[0] >> 3, fi = ((cfg[0] & 7) << 1) | (cfg[1] >> 7), ch = (cfg[1] >> 3) & 15;
    if (aot < 1 || aot > 4 || fi > 12 || ch < 1 || ch > 7) return null; // AAC-LC и родственные; HE-AAC и экзотика идут обычным путём
    const nS = u32(v, stsz.a + 8), fixed = u32(v, stsz.a + 4), sizes = new Array(nS);
    for (let i = 0; i < nS; i++) sizes[i] = fixed || u32(v, stsz.a + 12 + i * 4);
    const nC = u32(v, stco.a + 4), big = stco.t === 'co64', offs = new Array(nC);
    for (let i = 0; i < nC; i++) offs[i] = big ? Number(v.getBigUint64(stco.a + 8 + i * 8)) : u32(v, stco.a + 8 + i * 4);
    const nR = u32(v, stsc.a + 4), runs = []; for (let i = 0; i < nR; i++) runs.push([u32(v, stsc.a + 8 + i * 12), u32(v, stsc.a + 12 + i * 12)]);
    const chunks = []; let si = 0; // [смещение, номер первого сэмпла, число сэмплов, байт]
    for (let c = 0; c < nC; c++) {
      let per = 0; for (const r of runs) if (r[0] <= c + 1) per = r[1];
      let bytes = 0; for (let k = 0; k < per && si + k < nS; k++) bytes += sizes[si + k];
      chunks.push([offs[c], si, Math.min(per, nS - si), bytes]); si += per;
    }
    const parts = new Array(nC);
    for (let i = 0; i < nC; i += 24) await Promise.all(chunks.slice(i, i + 24).map(async (c, j) => { parts[i + j] = new Uint8Array(await f.slice(c[0], c[0] + c[3]).arrayBuffer()); }));
    let total = 0; for (let i = 0; i < nS; i++) total += sizes[i] + 7;
    const out = new Uint8Array(total); let o = 0;
    chunks.forEach((c, ci) => { let q = 0; for (let k = 0; k < c[2]; k++) {
      const n = sizes[c[1] + k], fl = n + 7;
      out[o] = 0xFF; out[o + 1] = 0xF1; out[o + 2] = ((aot - 1) << 6) | (fi << 2) | (ch >> 2); out[o + 3] = ((ch & 3) << 6) | (fl >> 11); out[o + 4] = (fl >> 3) & 255; out[o + 5] = ((fl & 7) << 5) | 0x1F; out[o + 6] = 0xFC;
      out.set(parts[ci].subarray(q, q + n), o + 7); q += n; o += fl;
    } });
    return out.buffer;
  }
  function edAudio(f) { // звук видео целиком: декодируется один раз и запоминается
    const k = fkey(f); if (edAud.has(k)) return edAud.get(k);
    initAudio();
    const p = (async () => {
      let a = null; try { a = await mp4Aac(f); } catch (e) {} // сначала быстрый путь: берём из файла только звуковую дорожку
      if (a === 'none') throw new Error('noaudio');
      if (a) { try { return await ctx.decodeAudioData(a); } catch (e) {} }
      return ctx.decodeAudioData(await f.arrayBuffer()); // запасной путь: декодируем файл целиком
    })();
    edAud.set(k, p); p.catch(() => edAud.delete(k));
    while (edAud.size > 2) edAud.delete(edAud.keys().next().value);
    return p;
  }
  // чат зовёт это сразу при прикреплении видео: пока ИИ думает, всё уже разобрано и сборка стартует без ожидания
  window.studioWarm = files => {
    const fl = (files || []).slice(0, 12); if (!fl.length) return;
    fl.forEach(f => edProbe(f).catch(() => {}));
    edAudio(fl[0]).catch(() => {}); // первое видео по умолчанию даёт музыку
  };
  async function edLoad(files, say) {
    say(act('Открываю видео…'));
    const fl = files.slice(0, 12), metas = await Promise.all(fl.map(edProbe));
    return fl.map((f, i) => ({ file: f, url: URL.createObjectURL(f), dur: metas[i].dur, name: f.name, w: metas[i].w, h: metas[i].h }));
  }
  async function edBuild(E, items, say) {
    const pool = []; let rec = null, node = null; // запись и звук: чтобы остановить их, если сборка упадёт
    try {
      const mi = Math.min(E.music - 1, items.length - 1), music = items[mi];
      initAudio(); if (ctx.state !== 'running') await ctx.resume();
      try { await ensureInter(); await document.fonts.load('800 40px "Bricolage Grotesque"'); await document.fonts.load('400 40px "Space Mono"'); await document.fonts.load('400 40px "Instrument Sans"'); } catch (e) {}
      const bufP = edAudio(music.file); bufP.catch(() => {}); // звук разбирается, пока готовятся клипы
      let srcIdx = items.map((_, i) => i).filter(i => i !== mi);
      if (!srcIdx.length || E.also) srcIdx = items.map((_, i) => i);
      const usedBy = {}, per = srcIdx.length === 1 ? 2 : 1;
      for (const i of srcIdx) for (let k = 0; k < per; k++) {
        const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.src = items[i].url;
        v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none'; document.body.append(v);
        pool.push({ v, dur: items[i].dur, used: usedBy[i] || (usedBy[i] = []) });
      }
      say(act('Готовлю клипы…'));
      const ready = v => new Promise(res => { let n = 0; const chk = () => (v.readyState >= 2 || ++n > 100) ? res() : setTimeout(chk, 50); v.addEventListener('error', res, { once: true }); chk(); v.play().then(() => v.pause(), () => {}); });
      const [buf] = await Promise.all([bufP.catch(e => { throw new Error(e && e.message === 'noaudio' ? tr('В этом видео нет звука: ') + music.name : tr('Не получилось достать звук из видео ') + music.name); }), ...pool.map(p => ready(p.v))]);
      const start = Math.max(0, E.start), len = Math.min(Math.max(3, E.len), 120, buf.duration - start);
      if (len < 2) throw new Error(tr('В видео с музыкой после этой секунды меньше 2 секунд звука. Его длина: ') + Math.round(buf.duration) + tr(' с'));
      const gaps = { fast: [.3], mid: [.6], slow: [1.2], mix: [.3, .6, .3, 1.2, .45] }[E.tempo] || [.6];
      const cuts = edCuts(edBeats(buf, start, start + len), len, gaps, Math.random), segs = edPlan(cuts, pool, Math.random);
      let w, h; const vm = /^v:(\d+)$/.exec(E.res);
      if (vm && items[+vm[1]]) { w = evenN(items[+vm[1]].w); h = evenN(items[+vm[1]].h); } else [w, h] = E.res.split('x').map(Number);
      const fps = E.fps === 30 ? 30 : 60, c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      const cover = (v, z, ox, oy) => { const vw = v.videoWidth, vh = v.videoHeight; if (!vw) return; const k = Math.max(w / vw, h / vh) * z; g.drawImage(v, (w - vw * k) / 2 + (ox || 0), (h - vh * k) / 2 + (oy || 0), vw * k, vh * k); };
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
      rec = mr; node = src; mr.start(1000); src.start(0, start, len);
      const af = Math.min(d.afade || 0, len), now = ctx.currentTime; fadeG.gain.setValueAtTime(1, now);
      if (af > 0) { fadeG.gain.setValueAtTime(1, now + len - af); fadeG.gain.linearRampToValueAtTime(0, now + len); }
      let cur = -1, lastSay = -1, lost = 0, hidAt = 0, prep = 0; const t0 = performance.now(); // prep: какой клип уже перемотан заранее
      const onVis = async () => { // свернул сайт (TikTok, блокировка): запись и звук замирают, при возврате идут дальше с того же места
        const cv = () => pool[segs[Math.max(cur, 0)].k].v;
        if (document.hidden) { if (!hidAt) hidAt = performance.now(); try { if (mr.state === 'recording') mr.pause(); } catch (e) {} try { cv().pause(); } catch (e) {} try { await ctx.suspend(); } catch (e) {} }
        else if (hidAt) { lost += performance.now() - hidAt; hidAt = 0; lock(); for (let k = 0; k < 6 && ctx.state !== 'running'; k++) { try { await ctx.resume(); } catch (e) {} if (ctx.state !== 'running') await new Promise(r => setTimeout(r, 150)); } try { if (mr.state === 'paused') mr.resume(); } catch (e) {} try { cv().play().catch(() => {}); } catch (e) {} }
      };
      let wl = null; const lock = async () => { try { if (navigator.wakeLock && !wl) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); } } catch (e) {} }; lock(); // экран не гаснет сам во время записи
      document.addEventListener('visibilitychange', onVis);
      try { await new Promise(done => (function tick() {
        if (document.hidden) return requestAnimationFrame(tick);
        const t = (performance.now() - t0 - lost) / 1000; let i = cur < 0 ? 0 : cur;
        while (i < segs.length - 1 && t >= segs[i].t1) i++;
        if (i !== cur) {
          if (cur >= 0) pool[segs[cur].k].v.pause();
          const cvv = pool[segs[i].k].v;
          if (prep !== i) { try { cvv.currentTime = segs[i].off; } catch (e) {} } // из-за лага клип не успели перемотать заранее: делаем это сейчас
          cvv.play().catch(() => {}); cur = i;
          if (i + 1 < segs.length) { const nv = pool[segs[i + 1].k].v; nv.pause(); nv.currentTime = segs[i + 1].off; prep = i + 1; } // следующий клип готовим заранее
        }
        const dt = t - segs[cur].t0, v = pool[segs[cur].k].v;
        const pz = Math.max(0, 1 - dt / .2), amp = E.shake ? w * .014 * pz * pz : 0; // pz: сила удара, гаснет за 0,2 с после каждой склейки
        if (!v.seeking && v.readyState >= 2) cover(v, (E.zoom ? 1 + .08 * Math.pow(Math.max(0, 1 - dt / .22), 2) : 1) * (E.shake ? 1.05 : 1), (Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp);
        edFx(g, w, h, E, Math.max(0, 1 - dt / .12), pz); edTextDraw(g, w, h, E, t); edFrame(g, w, h, E, t, len);
        const sec = Math.floor(t); if (sec !== lastSay) { lastSay = sec; say(act('Записываю: ') + Math.min(sec, Math.round(len)) + ' / ' + Math.round(len) + act(' с.')); }
        t >= len ? done() : requestAnimationFrame(tick);
      })()); } finally { document.removeEventListener('visibilitychange', onVis); try { wl && wl.release(); } catch (e) {} }
      if (mr.state === 'paused') try { mr.resume(); } catch (e) {}
      mr.stop(); await stopped; try { src.stop(); } catch (e) {} fadeG.disconnect();
      return { blob: new Blob(chunks, { type: type.split(';')[0] }), type, E };
    } finally {
      try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) {} try { node && node.stop(); } catch (e) {}
      pool.forEach(p => { p.v.pause(); p.v.remove(); });
    }
  }
  // чат lowend AI вызывает это сам: собирает эдит из прикреплённых видео и отдаёт готовый файл. status(текст) показывает ход работы в чате
  window.studioEdit = async (spec, files, status) => {
    const say = typeof status === 'function' ? status : () => {};
    if (busy) throw new Error(tr('Студия занята: дождись конца текущей сборки.'));
    if (!files || !files.length) throw new Error(tr('Добавь хотя бы одно видео.'));
    busy = true; let items = [];
    try {
      items = await edLoad(files, say);
      const r = await edBuild(edSpec(spec || {}, items), items, say);
      return { blob: r.blob, ext: r.type.startsWith('video/mp4') ? 'mp4' : 'webm', name: 'lowend-edit', spec: r.E };
    } catch (e) { console.error('studio edit error:', e); throw new Error(humanErr(e)); } finally { items.forEach(i => URL.revokeObjectURL(i.url)); busy = false; }
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
