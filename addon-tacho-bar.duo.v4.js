// addon-tacho-bar.duo.v4.js — DUO Tacho Bar (A/B)  — full build
// by Maciej & ChatGPT ❤️

(function(){
  if (window.__tachoDuo_v4) return; window.__tachoDuo_v4 = true;

  // ── stałe / utilsy ───────────────────────────────────────────────────────
  const MS = m => m*60000;
  const STINT = MS(270);          // 4h30
  const REST9 = MS(9*60);         // 9h
  const ALERT_BEFORE = MS(15);    // prealert 15 min przed 4:30
  const KEY   = 'tacho_duo_v4';
  const WKEY  = 'tacho_duo_weeks_v1';
  const LKEY  = 'tacho_duo_log_v1';
  const UIKEY = 'tacho_duo_ui_v1';
  const GKEY  = 'tacho_duo_gps_v1';

  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
  const on = (el,ev,fn,opts)=>el&&el.addEventListener(ev,fn,opts||{});

  const ymd = (d=new Date())=>{
    const p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  };
  const hm = (ms)=>{
    ms = Math.max(0, Math.round(ms/60000))*60000;
    const h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  };

  function load(k, fallback){ try{ return JSON.parse(localStorage.getItem(k)||''); }catch(_){ return fallback; } }
  function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){ } }

  function log(evt, extra){
    const arr = load(LKEY, []) || [];
    arr.push({ ts: Date.now(), evt, modeA: S?.A?.mode, modeB: S?.B?.mode, ...extra });
    while(arr.length>400) arr.shift();
    save(LKEY, arr);
    const bar = $('#tachoBar'); const btn = $('.logToggle', bar||document);
    if (btn) btn.textContent = `Log (${arr.length})`;
  }

  // tydzień ISO (YYYY-Www)
  function isoWeekKey(date=new Date()){
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = (d.getUTCDay() || 7);
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    const p=n=>String(n).padStart(2,'0');
    return `${d.getUTCFullYear()}-W${p(weekNo)}`;
  }
  function weekUsageFor(id){
    const wk = isoWeekKey(new Date());
    const w  = load(WKEY, {});
    return (w?.[wk]?.[id])||0;
  }
  function markWeek10h(id){
    const wk = isoWeekKey(new Date());
    const w  = load(WKEY, {});
    if (!w[wk]) w[wk] = {A:0,B:0};
    w[wk][id] = (w[wk][id]||0) + 1;
    save(WKEY, w);
  }

  // okno 30h (z segmentów odpoczynku)
  function restInLast30h(d){
    const now = Date.now(), winStart = now - MS(30*60);
    const segs = (d.restSegments||[]).filter(s=> (s.end||now) > winStart);
    let sum = 0;
    for(const s of segs){
      const a = Math.max(winStart, s.start);
      const b = Math.min(now, s.end||now);
      if (b>a) sum += (b-a);
    }
    return sum;
  }
  function closeRest(d, now){
    if (d._restStart){
      d.restSegments = d.restSegments||[];
      d.restSegments.push({start: d._restStart, end: now});
      d._restStart = 0;
    }
  }
  const cap = d => d.extend ? MS(10*60) : MS(9*60);

  // ── GPS (foreground) ─────────────────────────────────────────────────────
  let G = load(GKEY, { on:false, day: ymd(), km: 0, last:null });
  let gpsWatchId = null;
  const hv = a=>a*Math.PI/180;
  function distKm(lat1, lon1, lat2, lon2){
    const R=6371, dLat=hv(lat2-lat1), dLon=hv(lon2-lon1);
    const s1=Math.sin(dLat/2), s2=Math.sin(dLon/2);
    const aa = s1*s1 + Math.cos(hv(lat1))*Math.cos(hv(lat2))*s2*s2;
    return 2*R*Math.atan2(Math.sqrt(aa), Math.sqrt(1-aa));
  }
  function resetGpsDayIfNeeded(){
    const d = ymd(new Date());
    if (G.day!==d){ G.day=d; G.km=0; G.last=null; save(GKEY,G); }
  }
  function updateKmUI(){
    const el = document.querySelector('#tachoBar .kmToday');
    if (el) el.textContent = `km dziś: ${G.km.toFixed(1)}`;
    const btn = document.querySelector('#tachoBar .gpsToggle');
    if (btn) btn.textContent = `GPS: ${G.on?'on':'off'}`;
  }
  function startGPS(){
    if (!('geolocation' in navigator)) { alert('Brak GPS w przeglądarce.'); return; }
    if (gpsWatchId!=null) return;
    gpsWatchId = navigator.geolocation.watchPosition(pos=>{
      if (document.visibilityState!=='visible') return;
      if (!S.running || act().mode!=='drive') return;
      const {latitude:la, longitude:lo, speed} = pos.coords;
      if (speed!=null){
        const kmh = speed*3.6;
        if (kmh>160 || kmh<1) return; // filtr skrajnych/zerowych
      }
      resetGpsDayIfNeeded();
      if (G.last){
        const d = distKm(G.last.la, G.last.lo, la, lo);
        if (d>0 && d<2) G.km += d; // odrzuć „teleporty”
      }
      G.last = { la, lo, t: Date.now() };
      save(GKEY,G); updateKmUI();
    }, err=>{ console.warn('GPS error', err); },{
      enableHighAccuracy:true, maximumAge: 10000, timeout: 15000
    });
  }
  function stopGPS(){
    if (gpsWatchId!=null){ navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId=null; }
  }
function setGpsUI(state){ // false | 'pending' | true
  const bar = document.getElementById('tachoBar');
  const btn = bar?.querySelector('.gpsToggle');
  if (!btn) return;
  if (state===true){ btn.textContent='GPS: on';  bar.classList.add('gps-on');  bar.classList.remove('gps-pending'); }
  else if (state==='pending'){ btn.textContent='GPS: on…'; bar.classList.add('gps-pending'); bar.classList.remove('gps-on'); }
  else { btn.textContent='GPS: off'; bar.classList.remove('gps-on','gps-pending'); }
}

  // ── Wake-Lock (opcjonalne) ───────────────────────────────────────────────
  let wakeLock=null, awakeOn=false;
  async function toggleAwake(){
    if (!('wakeLock' in navigator)){ alert('Wake-Lock niedostępny w tej przeglądarce.'); return; }
    try{
      if (!awakeOn){
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', ()=>{ awakeOn=false; updateAwakeUI(); });
        awakeOn=true;
      } else {
        await wakeLock.release(); wakeLock=null; awakeOn=false;
      }
      updateAwakeUI();
    }catch(e){ console.warn('wakeLock', e); }
  }
  function updateAwakeUI(){
    const b = document.querySelector('#tachoBar .awakeToggle');
    if (b) b.textContent = awakeOn ? 'Czuwaj: on' : 'Czuwaj: off';
  }

  // ── stan ─────────────────────────────────────────────────────────────────
  function defaultDriver(){
    return {
      mode: 'pause',
      stint: 0,
      driveToday: 0,
      breakRemain: MS(45),
      breakCleared: false,
      restRemain: 0,
      restSegments: [],
      _restStart: 0,
      extend: false,
      warned15: false,
      _countedWeek: false
    };
  }
  let S = load(KEY, null);
  if (!S){
    S = { active:'A', running:false, last:Date.now(), day: ymd(), A: defaultDriver(), B: defaultDriver() };
    save(KEY,S);
  }
  function act(){ return S[S.active]; }
  function other(){ return S[S.active==='A' ? 'B' : 'A']; }

  // ── UI ───────────────────────────────────────────────────────────────────
  function ensureBar(){
    let bar = $('#tachoBar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'tachoBar';
    bar.className = 'duo v4';
    bar.innerHTML = `
      <div class="tduo-inner">
        <div class="trow top">
          <button class="aswitch">Aktywny: A</button>
          <button class="zamiana">Zamiana A↔B</button>
          <button class="vplay">▶︎</button>
          <button class="parking9">Parking 9h</button>
          <button class="gpsToggle">GPS: off</button>
          <button class="awakeToggle">Czuwaj</button>
          <button class="dreset">Reset dzień</button>
          <button class="restReset">Reset 9h</button>
          <button class="logToggle">Log (0)</button>
          <button class="minToggle">Zwiń</button>
        </div>

        <div class="trow modes">
          <div class="label">Tryb aktywnego:</div>
          <div class="chips">
            <button data-m="drive">Jazda</button>
            <button data-m="pause">Przerwa</button>
            <button data-m="work">Praca</button>
            <button data-m="rest">Odpoczynek</button>
          </div>
          <div class="chips">
            <button class="aext">9h</button>
          </div>
        </div>

        <div class="stats">
          <div class="col A">
            <div class="hdr">A</div>
            <div class="line stint"></div>
            <div class="line brk"></div>
            <div class="line day"></div>
            <div class="line w30"></div>
            <div class="line w10"></div>
          </div>
          <div class="col B">
            <div class="hdr">B</div>
            <div class="line stint"></div>
            <div class="line brk"></div>
            <div class="line day"></div>
            <div class="line w30"></div>
            <div class="line w10"></div>
          </div>
        </div>

        <div class="trow presets">
          <div>Przerwa aktywnego:</div>
          <div class="chips">
            <button data-b="15">15</button>
            <button data-b="30">30</button>
            <button data-b="45">45</button>
          </div>
          <div class="sp"></div>
          <span class="kmToday">km dziś: 0.0</span>
          <button class="expLog">Eksport</button>
          <button class="clrLog">Wyczyść</button>
        </div>

        <div class="tlog mono hidden">Brak wpisów.</div>
      </div>
    `;
    document.body.appendChild(bar);

    // FAB do przywracania po zminimalizowaniu
    let fab = $('#tachoFab');
    if (!fab){
      fab = document.createElement('button');
      fab.id = 'tachoFab';
      fab.textContent = 'Tacho';
      fab.className = 'hidden';
      document.body.appendChild(fab);
      on(fab,'click', ()=>{
        fab.classList.add('hidden');
        bar.classList.remove('min');
        save(UIKEY, {min:false});
      });
    }
    return bar;
  }

  // ── render ───────────────────────────────────────────────────────────────
  function paint(){
    const bar = ensureBar();

    // stan top
    $('.aswitch', bar).textContent = `Aktywny: ${S.active}`;
    const vbtn = $('.vplay', bar);
    vbtn.textContent = S.running ? '⏸' : '▶︎';
    vbtn.classList.toggle('on', S.running);

    const curMode = act().mode;
    $$('.modes .chips [data-m]', bar).forEach(b=>{
      const on = b.dataset.m===curMode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on?'true':'false');
    });
    $('.aext', bar).textContent = act().extend ? '10h' : '9h';

    const ln = (load(LKEY, [])||[]).length;
    $('.logToggle', bar).textContent = `Log (${ln})`;

    // kolumny A/B
    [['A',S.A],['B',S.B]].forEach(([id,d])=>{
      const col = $(`.col.${id}`, bar); if (!col) return;

      const leftDay = Math.max(0, cap(d) - d.driveToday);
      const rest30  = restInLast30h(d);
      const need    = Math.max(0, REST9 - rest30);
      const used    = weekUsageFor(id);

      col.setAttribute('data-mode', d.mode);
      $('.hdr', col).setAttribute('data-mode', d.mode);

      $('.stint', col).innerHTML = `<span class="lbl">Stint</span><span class="val mono">${hm(d.stint)}</span>`;
      $('.brk',   col).innerHTML = `<span class="lbl">Przerwa</span><span class="val mono">${hm(d.breakRemain)}</span>`;
      $('.day',   col).innerHTML = `<span class="lbl">Dzień</span><span class="val mono">${hm(leftDay)}</span>`;
      $('.w30',   col).innerHTML = `<span class="lbl">30h</span><span class="val mono">${need===0?'✓ 9:00':'brak '+hm(need)}</span>`;
      $('.w10',   col).innerHTML = `<span class="lbl">10h tydz</span><span class="val mono">${used}/2</span>`;

      const clamp=v=>Math.max(0,Math.min(100,v));
      const stintP = clamp((d.stint / STINT) * 100);
      const brkP   = clamp((1 - (d.breakRemain / MS(45))) * 100);
      const dayP   = clamp((d.driveToday / cap(d)) * 100);
      const w30P   = clamp(((REST9 - need) / REST9) * 100);

      col.style.setProperty('--p-stint', `${stintP}%`);
      col.style.setProperty('--p-break', `${brkP}%`);
      col.style.setProperty('--p-day',   `${dayP}%`);
      col.style.setProperty('--p-30h',   `${w30P}%`);

      const prewarn = (d.mode==='drive' && (STINT - d.stint) <= ALERT_BEFORE && (STINT - d.stint) > 0);
      col.classList.toggle('active', S.active===id);
      col.classList.toggle('prewarn', prewarn);
      col.classList.toggle('warn-stint', d.mode==='drive' && d.stint >= STINT);
      col.classList.toggle('ok-break',   d.breakRemain===0);
      col.classList.toggle('ok-30h',     need===0);
      col.classList.toggle('warn-10h',   used>=2);
    });

    // GPS UI
    resetGpsDayIfNeeded();
    updateKmUI();
setGpsUI(G.on ? true : false);

    // log
    const logBox = $('.tlog', bar);
    if (!logBox.classList.contains('hidden')){
      const arr = load(LKEY, []);
      const fmt = ts => { const d=new Date(ts), p=n=>String(n).padStart(2,'0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
      const lines = arr.slice(-400).map(e=>`${fmt(e.ts)}  ${e.evt}  A:${e.modeA}  B:${e.modeB}`);
      logBox.textContent = lines.join('\n') || 'Brak wpisów.';
    }

    // wake-lock label
    updateAwakeUI();
  }

  // ── silnik ───────────────────────────────────────────────────────────────
  function tick(){
    const now = Date.now();

    // reset doby (północ)
    if (ymd(new Date(now)) !== S.day){
      [['A',S.A],['B',S.B]].forEach(([id,d])=>{
        if (d.driveToday > MS(9*60) && !d._countedWeek){ markWeek10h(id); d._countedWeek = true; }
        d.stint = 0; d.driveToday = 0; d.breakRemain = MS(45); d.breakCleared=false; d.warned15=false; d._countedWeek=false;
      });
      S.day = ymd(new Date(now));
      save(KEY,S);
      resetGpsDayIfNeeded(); updateKmUI();
    }

    if (!S.running){ S.last = now; return; }

    // catch-up po powrocie (do 12h max)
    let dt = now - (S.last||now);
    if (dt < 0) dt = 0;
    const MAX_CATCH = MS(12*60); if (dt > MAX_CATCH) dt = MAX_CATCH;
    S.last = now;

    const a = act(), b = other();

    // failsafe: jeśli nie REST → nie trzymaj resztek odliczania 9h
    [S.A, S.B].forEach(d=>{ if (d.mode!=='rest' && d.restRemain>0) d.restRemain=0; });

    // aktywny
    if (a.mode === 'drive'){
      a.stint += dt;
      a.driveToday += dt;
      if (!a._countedWeek && a.driveToday > MS(9*60)){ markWeek10h(S.active); a._countedWeek = true; }

      const left = STINT - a.stint;
      if (left <= ALERT_BEFORE && left > 0 && !a.warned15){
        a.warned15 = true;
        try{ navigator.vibrate && navigator.vibrate([50,40,50]); }catch(_){}
        log('prewarn15', {left:left});
      }
    } else if (a.mode === 'pause'){
      if (a.breakRemain > 0){
        a.breakRemain = Math.max(0, a.breakRemain - dt);
        if (a.breakRemain === 0){ a.breakCleared = true; }
      }
    } else if (a.mode === 'rest'){
      a.restRemain = Math.max(0, a.restRemain - dt);
    }

    // pasywny REST liczy się też
    if (b.mode === 'rest'){
      b.restRemain = Math.max(0, b.restRemain - dt);
    }

    save(KEY,S); paint();
  }

  // ── zmiany trybów ────────────────────────────────────────────────────────
  function switchMode(d, next){
    const now = Date.now();
    if (d.mode==='rest' && next!=='rest'){ closeRest(d, now); }
    if (next==='rest' && d.mode!=='rest'){ d._restStart = now; }

    if (next==='drive'){
      if (d.breakRemain<=0 || d.breakCleared){
        d.stint = 0;
        d.breakRemain = MS(45);
        d.breakCleared = false;
      }
    }
    d.mode = next;
    save(KEY,S); paint();
  }

  // ── start / handlery ─────────────────────────────────────────────────────
  function start(){
    const bar = ensureBar();

    on($('.aswitch', bar), 'click', ()=>{
      S.active = (S.active==='A') ? 'B' : 'A';
      save(KEY,S); paint(); log('switchActive',{to:S.active});
    });

    on($('.zamiana', bar), 'click', ()=>{
      const prev = S.active;
      const now = Date.now();
      const p = S[prev];
      if (p.mode==='rest') closeRest(p, now);
      p.mode = 'pause';

      S.active = (S.active==='A') ? 'B' : 'A';
      const a = act();
      if (a.mode==='rest') closeRest(a, now);
      a.mode = 'drive';

      // auto-ochrona współkierowcy
      other().mode = other().mode==='rest' ? 'rest' : 'pause';

      S.running = true; S.last = Date.now();
      save(KEY,S); paint(); log('swapAB',{});
    });

    on($('.vplay', bar), 'click', ()=>{
      S.running = !S.running;
      S.last = Date.now();
      save(KEY,S); paint(); log(S.running?'play':'pause',{});
    });

    on($('.parking9', bar), 'click', ()=>{
      const now = Date.now();
      [S.A, S.B].forEach(d=>{
        if (d.mode==='rest') closeRest(d, now);
        d.mode = 'rest';
        d.restRemain = REST9;
        d._restStart = now;
      });
      S.running = true; S.last = Date.now();
      save(KEY,S); paint(); log('parking9',{A:'rest',B:'rest'});
    });

    // Reset dzień — twardy
    on($('.dreset', bar), 'click', ()=>{
      const now = Date.now();
      [S.A, S.B].forEach(d=>{
        if (d.mode==='rest') closeRest(d, now);
        d.mode = 'pause';
        d.restRemain = 0;
        d.stint = 0;
        d.driveToday = 0;
        d.breakRemain = MS(45);
        d.breakCleared = false;
        d.warned15 = false;
        d._countedWeek = false;
      });
      S.running = false; S.day = ymd(new Date());
      save(KEY,S); paint(); log('resetDayHard',{});
    });

    // Reset 9h — tylko odpoczynek (oba)
    on($('.restReset', bar), 'click', ()=>{
      const now = Date.now();
      [S.A, S.B].forEach(d=>{
        if (d.mode==='rest') closeRest(d, now);
        d.mode = 'pause';
        d.restRemain = 0;
        d.restSegments = []; // wyczyść okno 30h
        d.warned15 = false;
      });
      save(KEY,S); paint(); log('resetRest9h',{scope:'both', wipe:true});
    });

    // tryby aktywnego
    $$('.modes .chips [data-m]', bar).forEach(btn=>{
      on(btn,'click',()=>{
        const m = btn.dataset.m;
        const a = act();
        switchMode(a, m);
        if (m==='drive'){
          const o = other();
          if (o.mode!=='rest') o.mode='pause';
        }
        save(KEY,S); paint(); log('mode', {for:S.active, to:m});
      });
    });

    // 9h / 10h
    on($('.aext', bar), 'click', ()=>{
      const a = act();
      a.extend = !a.extend;
      save(KEY,S); paint(); log('extendDay',{for:S.active, val:a.extend});
      $('.aext', bar).textContent = a.extend ? '10h' : '9h';
    });

    // Presety przerwy
    $$('.presets [data-b]', bar).forEach(b=>{
      on(b,'click', ()=>{
        const v = parseInt(b.dataset.b,10)||15;
        const a = act();
        a.mode = 'pause';
        a.breakRemain = MS(v);
        a.breakCleared = (v>=45);
        save(KEY,S); paint(); log('presetBreak',{min:v});
      });
    });

    // GPS
    on($('.gpsToggle', bar), 'click', async ()=>{
  // jeśli wyłączamy
  if (G.on){
    G.on = false; save(GKEY,G);
    stopGPS(); setGpsUI(false); updateKmUI();
    log('gpsOff',{});
    return;
  }

  // włączamy — najpierw „oczekiwanie”
  setGpsUI('pending');

  // iOS/Safari: musimy wymusić żądanie uprawnień *po kliknięciu*
  let granted = false;
  try{
    granted = await new Promise((resolve)=>{
      let ok = false;
      const id = navigator.geolocation.watchPosition(
        p => { ok = true; navigator.geolocation.clearWatch(id); resolve(true); },
        e => { navigator.geolocation.clearWatch(id); resolve(false); },
        { enableHighAccuracy:true, timeout:10000, maximumAge:0 }
      );
      // fallback na stary getCurrentPosition (czasem szybciej zadziała)
      setTimeout(()=> {
        if (ok) return;
        navigator.geolocation.getCurrentPosition(
          ()=> resolve(true),
          ()=> resolve(false),
          { enableHighAccuracy:true, timeout:8000 }
        );
      }, 2000);
    });
  }catch(_){ granted = false; }

  if (!granted){
    setGpsUI(false);
    alert('GPS niedostępny lub brak zgody.\n\nUpewnij się, że:\n• otwierasz stronę przez https lub localhost,\n• w Ustawienia → Prywatność → Lokalizacja → Safari: „Podczas używania”.');
    return;
  }

  // zgoda jest — włącz śledzenie
  G.on = true; save(GKEY,G);
  startGPS(); setGpsUI(true); updateKmUI();
  log('gpsOn',{});
});
    // Wake-Lock
    on($('.awakeToggle', bar), 'click', ()=> toggleAwake());
    updateAwakeUI();

    // Log
    on($('.logToggle', bar), 'click', ()=>{
      $('.tlog', bar).classList.toggle('hidden');
      paint();
    });
    on($('.expLog', bar), 'click', async ()=>{
      const txt = localStorage.getItem(LKEY) || '[]';
      try{ await navigator.clipboard.writeText(txt); alert('Skopiowano do schowka.'); }
      catch(_){ alert('Skopiuj ręcznie:\n'+txt); }
    });
    on($('.clrLog', bar), 'click', ()=>{
      if (!confirm('Wyczyścić log?')) return;
      localStorage.removeItem(LKEY);
      paint();
    });

    // Minimalizacja
    on($('.minToggle', bar), 'click', ()=>{
      bar.classList.add('min');
      $('#tachoFab').classList.remove('hidden');
      save(UIKEY, {min:true});
    });

    // przywróć stan minimizacji
    const ui = load(UIKEY, {});
    if (ui?.min){ bar.classList.add('min'); $('#tachoFab').classList.remove('hidden'); }

    // visibilty → catch-up
    document.addEventListener('visibilitychange', ()=>{
      if (document.visibilityState==='hidden'){
        S.last = Date.now(); save(KEY,S);
      } else { tick(); paint(); }
    });
    window.addEventListener('pagehide', ()=>{ S.last = Date.now(); save(KEY,S); });
    window.addEventListener('pageshow', ()=>{ tick(); paint(); });

    paint();
    setInterval(tick, 1000);
    window.addEventListener('focus', ()=>paint());
  }

  if (document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', start, {once:true});
  } else {
    start();
  }

})();