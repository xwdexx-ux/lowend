// Студия lowend: видео с текстом поверх музыки. Этот файл сервер отдаёт только админам и владельцу.
(() => {
  if (window.openStudio) return;
  const FONTS = {
    thin: '300 {s}px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif',
    sans: '400 {s}px "Instrument Sans", sans-serif',
    display: '800 {s}px "Bricolage Grotesque", sans-serif',
    mono: '400 {s}px "Space Mono", monospace',
    serif: 'italic 400 {s}px Georgia, serif'
  };
  const FONT_NAMES = { thin: 'Тонкий (как в твоём видео)', sans: 'Обычный', display: 'Жирный', mono: 'Моно', serif: 'Курсив с засечками' };
  const RES = { '1280x720': '16:9 · 720p', '1920x1080': '16:9 · 1080p', '720x1280': '9:16 · 720p', '1080x1920': '9:16 · 1080p', '1080x1080': '1:1 · 1080' };
  const SIZE_RES = { '16:9': '1280x720', '9:16': '720x1280', '1:1': '1080x1080' };
  const d = { text: '', font: 'thin', size: 9, color: '#ffffff', bg: '#000000', res: '1280x720', dur: 60, progress: false };
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
  function draw(g, w, h, prog) {
    g.globalAlpha = 1; g.fillStyle = d.bg; g.fillRect(0, 0, w, h);
    const fs = Math.round(h * d.size / 100);
    g.font = FONTS[d.font].replace('{s}', fs); g.fillStyle = d.color; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = wrap(g, d.text, w * .84), lh = fs * 1.35, y0 = h / 2 - (lines.length - 1) * lh / 2;
    lines.forEach((l, i) => g.fillText(l, w / 2, y0 + i * lh));
    if (d.progress) {
      const bw = w * .84, bh = Math.max(3, h * .005), x = w * .08, y = h * .93;
      g.globalAlpha = .25; g.fillRect(x, y, bw, bh); g.globalAlpha = 1; g.fillRect(x, y, bw * prog, bh);
    }
  }
  function preview() {
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
    $('stBg').value = d.bg; $('stRes').value = d.res; $('stDur').value = d.dur; $('stProg').checked = d.progress; preview();
  }
  function applyAI(j) {
    if (typeof j.text === 'string') d.text = j.text.slice(0, 200);
    if (FONTS[j.font]) d.font = j.font;
    if (SIZE_RES[j.size]) d.res = SIZE_RES[j.size];
    if (+j.duration) d.dur = Math.max(5, Math.min(300, Math.round(+j.duration)));
    if (/^#[0-9a-f]{6}$/i.test(j.color)) d.color = j.color;
    if (/^#[0-9a-f]{6}$/i.test(j.bg)) d.bg = j.bg;
    if (typeof j.progress === 'boolean') d.progress = j.progress;
    if (j.track) { const o = [...$('stTrack').options].find(o => o.textContent === j.track); if (o) $('stTrack').value = o.value; }
    sync();
  }
  async function askAI() {
    const prompt = $('stAI').value.trim(), st = $('stStatus'); if (!prompt) return;
    st.textContent = 'ИИ думает…';
    try {
      const all = await tx('readonly', s => s.getAll());
      const r = await fetch('/api/studio-ai', { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': tok },
        body: JSON.stringify({ prompt, tracks: all.map(t => t.title), current: { ...d, track: $('stTrack').selectedOptions[0].textContent } }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      applyAI(j); st.textContent = 'Готово. Проверь превью и нажми «Сделать видео».';
    } catch (e) { st.textContent = e.message || 'ИИ недоступен.'; }
  }
  async function render() {
    if (busy) return; busy = true; const st = $('stStatus'), btn = $('stGo'); btn.disabled = true;
    try {
      const sel = $('stTrack').value;
      if (sel !== 'cur') {
        const t = (await tx('readonly', s => s.getAll())).find(x => String(x.id) === sel); if (!t) throw new Error('Трек не найден.');
        await loadFile(t.blob, t.title, true); setSettings(t.speed, t.bass, t.reverb, t.pan, t.vol, t.treble, t.echo, t.muffle);
      }
      if (!buffer) throw new Error('Сначала загрузи трек на главной или выбери сохранённый.');
      initAudio(); if (ctx.state !== 'running') await ctx.resume();
      try { await document.fonts.load('800 40px "Bricolage Grotesque"'); await document.fonts.load('400 40px "Space Mono"'); await document.fonts.load('400 40px "Instrument Sans"'); } catch (e) {}
      const type = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
      if (!type) throw new Error('Этот браузер не умеет записывать видео.');
      const [w, h] = d.res.split('x').map(Number); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'), dest = ctx.createMediaStreamDestination(); nodes.out.connect(dest);
      const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: Math.max(w, h) >= 1920 ? 8e6 : 5e6 });
      const chunks = []; mr.ondataavailable = e => e.data.size && chunks.push(e.data);
      const stopped = new Promise(r => mr.onstop = r);
      draw(g, w, h, 0); mr.start(1000); outEl.play().catch(() => {}); startAt(0);
      const t0 = performance.now(), ms = d.dur * 1000;
      await new Promise(done => (function tick() {
        const el = performance.now() - t0; draw(g, w, h, Math.min(1, el / ms));
        st.textContent = 'Записываю: ' + Math.round(el / 1000) + ' / ' + d.dur + ' с. Не закрывай страницу и не блокируй экран.';
        el >= ms ? done() : requestAnimationFrame(tick);
      })());
      mr.stop(); await stopped; stopSrc(); playing = false; outEl.pause(); setPlayUI(); nodes.out.disconnect(dest);
      const blob = new Blob(chunks, { type: type.split(';')[0] }), url = URL.createObjectURL(blob), ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
      $('stOut').innerHTML = ''; const v = document.createElement('video'); v.src = url; v.controls = true; v.playsInline = true;
      const a = document.createElement('a'); a.href = url; a.download = (title || 'video') + '.' + ext; a.textContent = 'Скачать видео (' + ext + ')';
      a.className = 'btn'; a.style.cssText = 'display:block;text-align:center;margin-top:10px;text-decoration:none';
      $('stOut').append(v, a); st.textContent = 'Готово!'; preview();
    } catch (e) { st.textContent = e.message || 'Не получилось записать видео.'; }
    busy = false; btn.disabled = false;
  }

  async function build() {
    root = document.createElement('div'); root.id = 'studio';
    root.innerHTML = `<div class="box">
      <div class="bar"><h2>Студия</h2><button class="btn ghost sm" id="stClose">Закрыть</button></div>
      <canvas id="stCanvas"></canvas>
      <div class="f"><label for="stAI">ИИ-помощник (необязательно)</label>
        <div class="src"><input type="text" id="stAI" placeholder="Например: как в прошлый раз, но текст lowend и 30 секунд"><button class="btn ghost sm" id="stAIgo">ИИ</button></div></div>
      <div class="f"><label for="stTrack">Трек</label><select id="stTrack"></select></div>
      <div class="f"><label for="stText">Текст</label><textarea id="stText"></textarea></div>
      <div class="two">
        <div class="f"><label for="stFont">Шрифт</label><select id="stFont">${Object.entries(FONT_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="f"><label for="stRes">Разрешение</label><select id="stRes">${Object.entries(RES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="f"><label for="stColor">Цвет текста</label><input type="color" id="stColor"></div>
        <div class="f"><label for="stBg">Цвет фона</label><input type="color" id="stBg"></div>
        <div class="f"><label for="stSize">Размер текста</label><input type="range" id="stSize" min="4" max="16" step="1"></div>
        <div class="f"><label for="stDur">Длина (секунд)</label><input type="number" id="stDur" min="5" max="300"></div>
      </div>
      <label style="display:flex;gap:8px;align-items:center;margin-top:14px"><input type="checkbox" id="stProg"> Полоска прогресса внизу</label>
      <button class="btn" id="stGo" style="width:100%;margin-top:16px">Сделать видео</button>
      <p class="hint" id="stStatus" style="margin-top:10px;text-align:center"></p>
      <div id="stOut"></div></div>`;
    document.body.append(root); cv = $('stCanvas');
    $('stClose').onclick = () => root.hidden = true;
    $('stGo').onclick = render; $('stAIgo').onclick = askAI;
    $('stAI').addEventListener('keydown', e => e.key === 'Enter' && askAI());
    const bind = (id, key, fn = v => v) => $(id).oninput = e => { d[key] = fn(e.target.type === 'checkbox' ? e.target.checked : e.target.value); preview(); };
    bind('stText', 'text'); bind('stFont', 'font'); bind('stRes', 'res'); bind('stColor', 'color'); bind('stBg', 'bg'); bind('stProg', 'progress');
    bind('stSize', 'size', Number); bind('stDur', 'dur', v => Math.max(5, Math.min(300, +v || 60)));
    $('stProg').onchange = $('stProg').oninput;
  }
  window.openStudio = async () => {
    if (!root) await build();
    root.hidden = false;
    const all = await tx('readonly', s => s.getAll()), sel = $('stTrack'), keep = sel.value;
    sel.innerHTML = '<option value="cur">Текущий трек на главной</option>' + all.map(t => `<option value="${t.id}">${t.title.replace(/</g, '&lt;')}</option>`).join('');
    if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
    if (!d.text) d.text = autoText();
    sync();
  };
})();
