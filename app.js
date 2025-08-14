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

  // notatki lokalne
  const K='tacho_notes_v1';
  const $ = s => document.querySelector(s);
  function renderNotes(){
    const arr = JSON.parse(localStorage.getItem(K)||'[]');
    $('#notes').innerHTML = arr.slice(-30).map(x=>`• ${x}`).join('<br>');
  }
  $('#saveNote').addEventListener('click', ()=>{
    const v = $('#note').value.trim(); if(!v) return;
    const arr = JSON.parse(localStorage.getItem(K)||'[]'); arr.push(v);
    localStorage.setItem(K, JSON.stringify(arr)); $('#note').value=''; renderNotes();
  });
  renderNotes();

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
  $('#expLog').addEventListener('click', async ()=>{
    const txt = localStorage.getItem('tacho_duo_log_v1') || '[]';
    try{ await navigator.clipboard.writeText(txt); alert('Skopiowano do schowka.'); }catch(_){ alert('Skopiuj ręcznie:\n'+txt); }
  });
  $('#clrLog').addEventListener('click', ()=>{
    if (!confirm('Wyczyścić log paska DUO?')) return;
    localStorage.removeItem('tacho_duo_log_v1'); fillLog();
  });

  // ustawienia integracyjne (opcjonalnie: możesz powiązać z flagami w DUO)
  const pre = document.getElementById('prewarn15');
  const ap  = document.getElementById('autoProtect');
  pre.addEventListener('change', ()=>{ /* tu można w przyszłości sterować progiem alertu */ });
  ap.addEventListener('change',  ()=>{ /* tu można w przyszłości sterować auto-ochroną */ });

})();
// Auto-update: sprawdzaj nową wersję i zaproponuj odświeżenie
if ('serviceWorker' in navigator) {
  // jeśli SW się przełączył -> odśwież stronę
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());

  navigator.serviceWorker.ready.then((reg) => {
    // co minutę sprawdź aktualizacje
    setInterval(() => reg.update(), 60_000);

    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        // "installed" + mamy już kontrolera => jest nowa wersja
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          // zapytaj użytkownika o odświeżenie
          if (confirm('Nowa wersja dostępna. Odświeżyć teraz?')) {
            // poproś waiting SW, by wskoczył od razu
            if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
          }
        }
      });
    });
  });
}
