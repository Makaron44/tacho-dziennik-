(function(){
  // prosta nawigacja
  const tabs = document.querySelectorAll('.tabs button');
  const views = {
    dash: document.getElementById('view-dash'),
    log : document.getElementById('view-log'),
    ust : document.getElementById('view-ust')
  };
  tabs.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      tabs.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('show'));
      views[btn.dataset.view].classList.add('show');
      if (btn.dataset.view==='log') fillLog();
    });
  });

  // podgląd logu z paska DUO
  function fillLog(){
    try{
      const log = JSON.parse(localStorage.getItem('tacho_duo_log_v1')||'[]');
      const fmt = ts => { const d=new Date(ts); const p=n=>String(n).padStart(2,'0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
      const lines = log.slice(-400).map(e=>`${fmt(e.ts)}  ${e.evt}  A:${e.modeA}  B:${e.modeB}`);
      document.getElementById('externalLog').textContent = lines.join('\n') || 'Brak wpisów.';
    }catch(e){
      document.getElementById('externalLog').textContent = 'Brak logu lub błąd odczytu.';
    }
  }
  document.getElementById('expLog').addEventListener('click', async ()=>{
    const txt = localStorage.getItem('tacho_duo_log_v1') || '[]';
    try{ await navigator.clipboard.writeText(txt); alert('Skopiowano do schowka.'); }catch(_){ alert('Skopiuj ręcznie:\n'+txt); }
  });
  document.getElementById('clrLog').addEventListener('click', ()=>{
    if (!confirm('Wyczyścić log paska DUO?')) return;
    localStorage.removeItem('tacho_duo_log_v1'); fillLog();
  });

  // ustawienia (haczymy pod przyszłe integracje z paskiem DUO)
  const pre = document.getElementById('prewarn15');
  const ap  = document.getElementById('autoProtect');
  pre.addEventListener('change', ()=>{ /* sterowanie progiem alertu – do spięcia z DUO */ });
  ap.addEventListener('change',  ()=>{ /* sterowanie auto-ochroną – do spięcia z DUO */ });
})();


// ==== PLAN DNIA ===========================================================
(function(){
  const KEY = 'tacho_plan_v1';
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
  const load = (k,f=[])=>{ try{return JSON.parse(localStorage.getItem(k)||'');}catch(_){return f} };
  const save = (k,v)=>{ try{localStorage.setItem(k,JSON.stringify(v));}catch(_){} };

  let plan = load(KEY, []);

  const pTitle = $('#pTitle'), pType  = $('#pType'), pStart = $('#pStart'), pDur = $('#pDur');
  const addBtn = $('#planAdd'), tl = $('#planTl'), nowLine = $('#planNow'), hours = $('#planHours');
  const list = $('#planList'), stats = $('#planStats');

  // utils time
  const toMin = (hhmm)=>{
    if(!hhmm) return 0;
    const [h,m] = hhmm.split(':').map(x=>parseInt(x,10)||0);
    return h*60+m;
  };
  const mm = (n)=>String(n).padStart(2,'0');
  const toHHMM = (mins)=> `${mm(Math.floor(mins/60)%24)}:${mm(mins%60)}`;

  function sortPlan(){ plan.sort((a,b)=>toMin(a.start)-toMin(b.start)); }

  function renderHours(){
    hours.innerHTML = '';
    for (let h=0; h<=24; h+=2){           // co 2h: 00, 02, 04… 24
      const s = document.createElement('span');
      s.textContent = `${String(h).padStart(2,'0')}:00`;
      hours.appendChild(s);
    }
  }

  function renderTimeline(){
    tl.querySelectorAll('.block').forEach(n=>n.remove());
    const dayMin = 24*60;
    plan.forEach(seg=>{
      const start = toMin(seg.start);
      const width = Math.max(1, (seg.dur/dayMin)*100);
      const left  = Math.max(0, (start/dayMin)*100);
      const el = document.createElement('div');
      el.className = `block ${seg.type}`;
      el.style.left = left+'%';
      el.style.width = width+'%';
      el.title = `${seg.type} • ${seg.start} (${seg.dur}m) ${seg.title||''}`;
      el.textContent = seg.title ? seg.title : seg.type[0].toUpperCase();
      tl.appendChild(el);
    });
  }

  function renderList(){
    list.innerHTML = '';
    sortPlan();
    plan.forEach((seg, idx)=>{
      const row = document.createElement('div');
      row.className = 'seg-item';

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `
        <span class="tag ${seg.type}">${seg.type}</span>
        <strong>${seg.start}</strong> • <strong>${seg.dur}m</strong>
        ${seg.title ? ' — '+seg.title : '' }
      `;

      const act = document.createElement('div');
      act.className = 'actions';

      // ustaw tryb w pasku tacho (klikamy odpowiedni guzik)
      const btnMode = document.createElement('button');
      btnMode.className = 'btn-ghost-sm';
      btnMode.textContent = 'Ustaw tryb';
      btnMode.onclick = ()=>{
        const map = {drive:'[data-m="drive"]', pause:'[data-m="pause"]', work:'[data-m="work"]', rest:'[data-m="rest"]'};
        const b = document.querySelector(`#tachoBar .modes .chips ${map[seg.type]}`);
        if (b){ b.click(); } else { alert('Pasek Tacho nieaktywny.'); }
      };

      const up = document.createElement('button'); up.className='btn-ghost-sm'; up.textContent='▲';
      up.onclick = ()=>{ if (idx>0){ [plan[idx-1],plan[idx]]=[plan[idx],plan[idx-1]]; save(KEY,plan); render(); } };

      const down=document.createElement('button'); down.className='btn-ghost-sm'; down.textContent='▼';
      down.onclick = ()=>{ if (idx<plan.length-1){ [plan[idx+1],plan[idx]]=[plan[idx],plan[idx+1]]; save(KEY,plan); render(); } };

      const del=document.createElement('button'); del.className='btn-danger'; del.textContent='Usuń';
      del.onclick = ()=>{ plan.splice(idx,1); save(KEY,plan); render(); };

      act.append(btnMode, up, down, del);
      row.append(meta, act);
      list.appendChild(row);
    });
  }

  function renderStats(){
    const sum = {drive:0, pause:0, work:0, rest:0, all:0};
    plan.forEach(s=>{ sum[s.type]+=s.dur; sum.all+=s.dur; });
    const chip = (label,val)=>`<span class="chip">${label}: <strong>${Math.floor(val/60)}h ${val%60}m</strong></span>`;
    stats.innerHTML = [
      chip('Jazda',sum.drive),
      chip('Przerwy',sum.pause),
      chip('Praca',sum.work),
      chip('Odpocz.',sum.rest),
      chip('Łącznie',sum.all)
    ].join(' • ');
  }

  function renderNow(){
    const now = new Date();
    const cur = now.getHours()*60 + now.getMinutes();
    const left = (cur/(24*60))*100;
    nowLine.style.left = left+'%';
  }

  function render(){ renderHours(); renderTimeline(); renderList(); renderStats(); renderNow(); }

  // actions
  $('#pNow').onclick = ()=>{
    const n = new Date();
    pStart.value = `${mm(n.getHours())}:${mm(n.getMinutes())}`;
  };
  $$('.dur').forEach(b=> b.onclick = ()=>{ pDur.value = (parseInt(pDur.value||'0',10)+parseInt(b.dataset.min,10)).toString(); });

  addBtn.onclick = ()=>{
    const seg = {
      title: (pTitle.value||'').trim(),
      type: pType.value,
      start: pStart.value || '00:00',
      dur: Math.max(1, parseInt(pDur.value||'0',10))
    };
    plan.push(seg); save(KEY,plan);
    pTitle.value=''; pDur.value='';
    render();
  };

  document.getElementById('planExport').onclick = async ()=>{
    const txt = JSON.stringify(plan, null, 2);
    try{ await navigator.clipboard.writeText(txt); alert('Plan skopiowany do schowka.'); }
    catch(_){ alert('Skopiuj ręcznie:\n'+txt); }
  };
  document.getElementById('planClear').onclick = ()=>{
    if (!confirm('Wyczyścić plan dnia?')) return;
    plan = []; save(KEY,plan); render();
  };

  // tick
  setInterval(renderNow, 30000);
  render();
})();


// ==== NOTATKI v2: migracja starego formatu + data/godzina + usuń =========
(function(){
  const KEY = 'tacho_notes_v1';
  const $  = (s,r=document)=>r.querySelector(s);
  const load = (k,f=[])=>{ try{return JSON.parse(localStorage.getItem(k)||'');}catch(_){return f} };
  const save = (k,v)=>{ try{localStorage.setItem(k,JSON.stringify(v));}catch(_){} };
  const p2 = n => String(n).padStart(2,'0');
  const genId = () => Date.now().toString(36)+Math.random().toString(36).slice(2,8);

  // 1) wczytaj i ZMIGRUJ wszystko do postaci {id, txt, at}
  function migrate(arr){
    let changed = false;
    const out = [];
    for (const item of (arr||[])){
      if (item == null) { changed = true; continue; }
      if (typeof item === 'string'){
        const txt = item.trim();
        if (!txt) { changed = true; continue; }
        out.push({ id: genId(), txt, at: Date.now() });
        changed = true;
      } else if (typeof item === 'object'){
        let { id, txt, at } = item;
        txt = String(txt ?? '').trim();
        if (!txt) { changed = true; continue; }
        if (typeof at !== 'number' || !isFinite(at)) { at = Date.now(); changed = true; }
        if (!id) { id = genId(); changed = true; }
        out.push({ id, txt, at });
      } else {
        changed = true; // nieznany typ -> odrzuć
      }
    }
    if (changed) save(KEY, out);
    return out;
  }

  let notes = migrate(load(KEY, []));

  const inp  = $('#note');
  const when = $('#noteWhen');
  const saveBtn = $('#saveNote');
  const nowBtn  = $('#noteNow');
  const list = $('#notes');

  function fmt(ts){
    if (typeof ts !== 'number' || !isFinite(ts)) return '—';
    const d = new Date(ts);
    return `${p2(d.getDate())}.${p2(d.getMonth()+1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  function esc(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  function render(){
    list.innerHTML = '';
    if (!notes.length){
      list.innerHTML = `<div class="muted">Brak notatek.</div>`;
      return;
    }
    notes.sort((a,b)=>b.at - a.at);
    for (const n of notes){
      const el = document.createElement('div');
      el.className = 'note-item';
      el.innerHTML = `
        <div class="top">
          <div class="text">${esc(n.txt||'—')}</div>
          <div class="row-actions">
            <button class="del" data-id="${n.id}">Usuń</button>
          </div>
        </div>
        <div class="meta">🕒 ${fmt(n.at)}</div>
      `;
      list.appendChild(el);
    }
  }

  function addNote(){
    const txt = (inp?.value||'').trim();
    if (!txt){ inp?.focus(); return; }
    let at = Date.now();
    if (when && when.value){
      const parsed = Date.parse(when.value);
      if (!isNaN(parsed)) at = parsed;
    }
    const n = { id: genId(), txt, at };
    notes.push(n); save(KEY, notes);
    if (inp) inp.value = '';
    if (when) when.value = '';
    render();
  }

  // handlers
  saveBtn?.addEventListener('click', addNote);
  inp?.addEventListener('keydown', e=>{ if (e.key==='Enter'){ e.preventDefault(); addNote(); }});
  nowBtn?.addEventListener('click', ()=>{
    const d = new Date();
    const iso = `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
    if (when) when.value = iso;
  });
  list?.addEventListener('click', e=>{
    const btn = e.target.closest('.del'); if (!btn) return;
    const id = btn.dataset.id;
    notes = notes.filter(n=>n.id !== id);
    save(KEY, notes); render();
  });

  render();
})();

  async function exportJSON(){
    const data = normalize(loadRaw());
    if (!data.length){ alert('Brak notatek do eksportu.'); return; }
    const txt = JSON.stringify(data, null, 2);
    const ok  = await downloadFile('notatki.json', txt, 'application/json;charset=utf-8;');
    if (!ok){
      try{ await navigator.clipboard.writeText(txt); alert('JSON skopiowano do schowka.'); }
      catch{ alert('Nie udało się pobrać – skopiuj ręcznie:\n'+txt.slice(0,2000)); }
    }
  }

  document.getElementById('notesExportCSV')?.addEventListener('click', exportCSV);
  document.getElementById('notesExportJSON')?.addEventListener('click', exportJSON);
  async function exportJSON(){
    const data = JSON.stringify(
      [...notes].sort((a,b)=>b.at-a.at),
      null, 2
    );
    const ok = await downloadFile('notatki.json', data, 'application/json;charset=utf-8;');
    if (!ok){
      try { await navigator.clipboard.writeText(data); alert('JSON skopiowano do schowka.'); }
      catch { alert('Nie udało się pobrać. Skopiuj ręcznie:\n'+data.slice(0,2000)); }
    }
  }

  async function downloadFile(name, content, mime){
    try{
      const blob = new Blob([content], {type: mime});
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
      return true;
    }catch(_){ return false; }
  }

  // przyciski eksportu
  document.getElementById('notesExportCSV')?.addEventListener('click', exportCSV);
  document.getElementById('notesExportJSON')?.addEventListener('click', exportJSON);
// ==== EKSPORT NOTATEK — niezależny od modułu ==============================
(function(){
  const CAND_KEYS = ['tacho_notes_v1', 'notes', 'undefined']; // próbujemy po kolei
  const p2 = n => String(n).padStart(2,'0');

  function readRaw(){
    for (const k of CAND_KEYS){
      try{
        const raw = localStorage.getItem(k);
        if (raw && raw !== '[]'){
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) return arr;
        }
      }catch(_){}
    }
    return [];
  }

  function normalize(items){
    const out=[];
    for (const it of (items||[])){
      if (it==null) continue;
      if (typeof it==='string'){
        const t = it.trim(); if (!t) continue;
        out.push({ id: genId(), txt: t, at: Date.now() });
      } else if (typeof it==='object'){
        let { id, txt, at } = it;
        txt = String(txt ?? '').trim(); if (!txt) continue;
        if (typeof at !== 'number' || !isFinite(at)) at = Date.now();
        if (!id) id = genId();
        out.push({ id, txt, at });
      }
    }
    return out.sort((a,b)=>b.at-a.at);
  }

  function genId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }

  function fmtPL(ts){
    if (typeof ts!=='number' || !isFinite(ts)) return '';
    const d = new Date(ts);
    return `${p2(d.getDate())}.${p2(d.getMonth()+1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }

  function toCSV(rows, sep=';'){
    return '\uFEFF' + rows.map(r =>
      r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(sep)
    ).join('\r\n');
  }

  async function downloadFile(name, content, mime){
    try{
      const blob = new Blob([content], {type: mime});
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
      return true;
    }catch(_){ return false; }
  }

  async function exportCSV(){
    const data = normalize(readRaw());
    if (!data.length){ alert('Brak notatek do eksportu.'); return; }
    const rows = [
      ['id','data_iso','data_pl','tekst'],
      ...data.map(n => [ n.id, new Date(n.at).toISOString(), fmtPL(n.at), n.txt ])
    ];
    const csv = toCSV(rows,';');
    const ok  = await downloadFile('notatki.csv', csv, 'text/csv;charset=utf-8;');
    if (!ok){
      try{ await navigator.clipboard.writeText(csv); alert('CSV skopiowano do schowka.'); }
      catch{ alert('Nie udało się pobrać – skopiuj ręcznie:\n'+csv.slice(0,2000)); }
    }
  }

  async function exportJSON(){
    const data = normalize(readRaw());
    if (!data.length){ alert('Brak notatek do eksportu.'); return; }
    const txt = JSON.stringify(data, null, 2);
    const ok  = await downloadFile('notatki.json', txt, 'application/json;charset=utf-8;');
    if (!ok){
      try{ await navigator.clipboard.writeText(txt); alert('JSON skopiowano do schowka.'); }
      catch{ alert('Nie udało się pobrać – skopiuj ręcznie:\n'+txt.slice(0,2000)); }
    }
  }

  document.getElementById('notesExportCSV')?.addEventListener('click', exportCSV);
  document.getElementById('notesExportJSON')?.addEventListener('click', exportJSON);
})();
// ==== EKSPORT NOTATEK — wersja niezależna + delegacja kliknięć ===========
(function(){
  const CAND_KEYS = ['tacho_notes_v1', 'notes']; // gdziekolwiek są notatki
  const p2 = n => String(n).padStart(2,'0');
  const genId = () => Date.now().toString(36)+Math.random().toString(36).slice(2,8);

  function readRaw(){
    for (const k of CAND_KEYS){
      try{
        const raw = localStorage.getItem(k);
        if (raw && raw !== '[]'){
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) return arr;
        }
      }catch(_){}
    }
    return [];
  }
  function normalize(items){
    const out=[];
    for (const it of (items||[])){
      if (it==null) continue;
      if (typeof it==='string'){
        const t = it.trim(); if(!t) continue;
        out.push({ id: genId(), txt: t, at: Date.now() });
      } else if (typeof it==='object'){
        let { id, txt, at } = it;
        txt = String(txt ?? '').trim(); if (!txt) continue;
        if (typeof at !== 'number' || !isFinite(at)) at = Date.now();
        if (!id) id = genId();
        out.push({ id, txt, at });
      }
    }
    return out.sort((a,b)=>b.at-a.at);
  }
  function fmtPL(ts){
    const d = new Date(ts);
    return `${p2(d.getDate())}.${p2(d.getMonth()+1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  function toCSV(rows, sep=';'){
    return '\uFEFF' + rows.map(r =>
      r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(sep)
    ).join('\r\n');
  }
  async function downloadFile(name, content, mime){
    try{
      const blob = new Blob([content], {type: mime});
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
      return true;
    }catch(_){ return false; }
  }
  async function doExport(kind){
    const data = normalize(readRaw());
    if (!data.length){ alert('Brak notatek do eksportu.'); return; }

    if (kind==='csv'){
      const rows = [
        ['id','data_iso','data_pl','tekst'],
        ...data.map(n => [ n.id, new Date(n.at).toISOString(), fmtPL(n.at), n.txt ])
      ];
      const csv = toCSV(rows,';');
      const ok  = await downloadFile('notatki.csv', csv, 'text/csv;charset=utf-8;');
      if (!ok){
        try{ await navigator.clipboard.writeText(csv); alert('CSV skopiowano do schowka.'); }
        catch{ alert('Nie udało się pobrać – skopiuj ręcznie:\n'+csv.slice(0,2000)); }
      }
    } else {
      const txt = JSON.stringify(data, null, 2);
      const ok  = await downloadFile('notatki.json', txt, 'application/json;charset=utf-8;');
      if (!ok){
        try{ await navigator.clipboard.writeText(txt); alert('JSON skopiowano do schowka.'); }
        catch{ alert('Nie udało się pobrać – skopiuj ręcznie:\n'+txt.slice(0,2000)); }
      }
    }
  }

  // 1) delegacja kliknięć (działa nawet jeśli przyciski pojawią się później)
  document.addEventListener('click', (e)=>{
    const b = e.target.closest('[data-export]');
    if (!b) return;
    e.preventDefault();
    doExport(b.dataset.export);
  }, {passive:false});

  // 2) bezpośrednie nasłuchy (gdyby ID były już w DOM)
  ['notesExportCSV','notesExportJSON'].forEach(id=>{
    const el = document.getElementById(id);
    if (el && !el.dataset.bound){
      el.addEventListener('click', (ev)=>{
        ev.preventDefault();
        doExport(el.id.endsWith('CSV') ? 'csv' : 'json');
      }, {passive:false});
      el.dataset.bound = '1';
    }
  });
})();
// ==== EKSPORT NOTATEK — niezależny + 3 bezpieczniki =======================
(function(){
  const CAND_KEYS = ['tacho_notes_v1','notes']; // próbne klucze
  const p2 = n => String(n).padStart(2,'0');
  const genId = () => Date.now().toString(36)+Math.random().toString(36).slice(2,8);

  function readRaw(){
    for (const k of CAND_KEYS){
      try{
        const raw = localStorage.getItem(k);
        if (raw && raw !== '[]'){
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) return arr;
        }
      }catch(_){}
    }
    return [];
  }
  function normalize(items){
    const out=[];
    for (const it of (items||[])){
      if (it==null) continue;
      if (typeof it==='string'){
        const t=it.trim(); if(!t) continue;
        out.push({ id: genId(), txt: t, at: Date.now() });
      } else if (typeof it==='object'){
        let { id, txt, at } = it;
        txt = String(txt ?? '').trim(); if (!txt) continue;
        if (typeof at!=='number' || !isFinite(at)) at = Date.now();
        if (!id) id = genId();
        out.push({ id, txt, at });
      }
    }
    return out.sort((a,b)=>b.at-a.at);
  }
  function fmtPL(ts){
    const d=new Date(ts);
    return `${p2(d.getDate())}.${p2(d.getMonth()+1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  function toCSV(rows, sep=';'){
    return '\uFEFF' + rows.map(r =>
      r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(sep)
    ).join('\r\n');
  }
  async function downloadFile(name, content, mime){
    try{
      const blob=new Blob([content], {type:mime});
      const url = URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download=name;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },0);
      return true;
    }catch(_){ return false; }
  }

  async function doExport(kind){
    const data = normalize(readRaw());
    if (!data.length){ alert('Brak notatek do eksportu.'); return; }

    if (kind==='csv'){
      const rows = [
        ['id','data_iso','data_pl','tekst'],
        ...data.map(n => [n.id, new Date(n.at).toISOString(), fmtPL(n.at), n.txt])
      ];
      const csv = toCSV(rows,';');
      const ok  = await downloadFile('notatki.csv', csv, 'text/csv;charset=utf-8;');
      if (!ok){
        try{ await navigator.clipboard.writeText(csv); alert('CSV skopiowano do schowka.'); }
        catch{ alert('Nie udało się pobrać – skopiuj ręcznie:\n'+csv.slice(0,2000)); }
      }
    } else {
      const txt = JSON.stringify(data, null, 2);
      const ok  = await downloadFile('notatki.json', txt, 'application/json;charset=utf-8;');
      if (!ok){
        try{ await navigator.clipboard.writeText(txt); alert('JSON skopiowano do schowka.'); }
        catch{ alert('Nie udało się pobrać – skopiuj ręcznie:\n'+txt.slice(0,2000)); }
      }
    }
  }

  // (A) delegacja kliknięć — złapie wszystko z atrybutem data-export
  document.addEventListener('click', (e)=>{
    const b = e.target.closest('[data-export]');
    if (!b) return;
    e.preventDefault();
    doExport(b.dataset.export);
  }, {passive:false});

  // (B) bezpośrednie nasłuchy (gdy ID są już w DOM)
  ['notesExportCSV','notesExportJSON'].forEach(id=>{
    const el=document.getElementById(id);
    if (el && !el.dataset.bound){
      el.addEventListener('click', (ev)=>{
        ev.preventDefault();
        doExport(el.id.endsWith('CSV')?'csv':'json');
      }, {passive:false});
      el.dataset.bound='1';
    }
  });

  // (C) globalny hak dla onclick="" w HTML (gdyby z-index robił psikusy)
  window.__exp = doExport;
})();
// ===== Awaryjny eksport (FAB) – działa nawet gdy stare guziki są "martwe" ===
(function(){
  if (window.__expFabInstalled) return; // strażnik
  window.__expFabInstalled = true;

  const CAND_KEYS = ['tacho_notes_v1','notes'];
  const p2 = n => String(n).padStart(2,'0');
  const genId = () => Date.now().toString(36)+Math.random().toString(36).slice(2,8);

  function readRaw(){
    for (const k of CAND_KEYS){
      try{
        const raw = localStorage.getItem(k);
        if (raw && raw!=='[]'){
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) return arr;
        }
      }catch(_){}
    }
    return [];
  }
  function normalize(items){
    const out=[];
    for (const it of (items||[])){
      if (it==null) continue;
      if (typeof it==='string'){
        const t = it.trim(); if (!t) continue;
        out.push({ id: genId(), txt: t, at: Date.now() });
      } else if (typeof it==='object'){
        let {id, txt, at} = it;
        txt = String(txt ?? '').trim(); if (!txt) continue;
        if (typeof at!=='number' || !isFinite(at)) at = Date.now();
        if (!id) id = genId();
        out.push({ id, txt, at });
      }
    }
    return out.sort((a,b)=>b.at-a.at);
  }
  function fmtPL(ts){
    const d=new Date(ts);
    return `${p2(d.getDate())}.${p2(d.getMonth()+1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  function toCSV(rows, sep=';'){
    return '\uFEFF' + rows.map(r =>
      r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(sep)
    ).join('\r\n');
  }
  async function downloadFile(name, content, mime){
    try{
      const blob=new Blob([content],{type:mime});
      const url = URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=name;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },0);
      return true;
    }catch(_){ return false; }
  }

  async function doExport(kind){
    const data = normalize(readRaw());
    if (!data.length){ alert('Brak notatek do eksportu.'); return; }

    if (kind==='csv'){
      const rows = [
        ['id','data_iso','data_pl','tekst'],
        ...data.map(n => [n.id, new Date(n.at).toISOString(), fmtPL(n.at), n.txt])
      ];
      const csv = toCSV(rows,';');
      const ok  = await downloadFile('notatki.csv', csv, 'text/csv;charset=utf-8;');
      if (!ok){
        try{ await navigator.clipboard.writeText(csv); alert('CSV skopiowano do schowka.'); }
        catch{ alert('Nie udało się pobrać – skopiuj ręcznie:\n'+csv.slice(0,2000)); }
      }
    } else {
      const txt = JSON.stringify(data, null, 2);
      const ok  = await downloadFile('notatki.json', txt, 'application/json;charset=utf-8;');
      if (!ok){
        try{ await navigator.clipboard.writeText(txt); alert('JSON skopiowano do schowka.'); }
        catch{ alert('Nie udało się pobrać – skopiuj ręcznie:\n'+txt.slice(0,2000)); }
      }
    }
  }

  // Globalny hak (jakbyś chciał wywołać z dowolnego miejsca)
  window.__exp = doExport;

  // Wstrzykuj FAB + menu
  function injectFab(){
    if (document.getElementById('expFab')) return;
    const fab  = document.createElement('div');
    const menu = document.createElement('div');
    fab.id='expFab'; fab.textContent='⇩';
    menu.id='expMenu';
    menu.innerHTML = `
      <button data-kind="csv">⤓ Eksport CSV</button>
      <button data-kind="json">⤓ Eksport JSON</button>
    `;
    document.body.append(fab, menu);

    const open = ()=>{ menu.style.display='block'; };
    const close= ()=>{ menu.style.display='none'; };
    const toggle=()=>{ menu.style.display = menu.style.display==='block' ? 'none' : 'block'; };

    // 3 typy zdarzeń, żeby nic nam nie uciekło
    ['click','touchend','pointerup'].forEach(ev=>{
      fab.addEventListener(ev, (e)=>{ e.preventDefault(); toggle(); }, {passive:false});
      menu.addEventListener(ev, (e)=>{
        const b = e.target.closest('button[data-kind]'); if (!b) return;
        e.preventDefault(); close(); doExport(b.dataset.kind);
      }, {passive:false});
    });

    // klik poza menu zamyka
    document.addEventListener('click', (e)=>{
      if (!menu.contains(e.target) && e.target!==fab) close();
    });
  }

  if (document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', injectFab, {once:true});
  } else {
    injectFab();
  }
})();