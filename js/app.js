// Main App
const App = (() => {

  const LOG = (...args) => console.log('%c[App]', 'color:#A78BFA;font-weight:600', ...args);
  const ERR = (...args) => console.error('[App]', ...args);

  // --- DOM ---
  const overlay         = document.getElementById('overlay');
  const btnStart        = document.getElementById('btn-start');
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const setupErr        = document.getElementById('setup-err');
  const inOpenAI        = document.getElementById('openai-key');
  const inUser          = document.getElementById('gh-user');
  const inRepo          = document.getElementById('gh-repo');
  const inToken         = document.getElementById('gh-token');
  const btnRecord       = document.getElementById('btn-record');
  const recordStatus    = document.getElementById('record-status');
  const timerEl         = document.getElementById('timer');
  const liveTranscript  = document.getElementById('live-transcript');
  const logEntries      = document.getElementById('log-entries');
  const entryCount      = document.getElementById('entry-count');
  const syncStatus      = document.getElementById('sync-status');
  const textInput       = document.getElementById('text-input');
  const btnTextSubmit   = document.getElementById('btn-text-submit');
  const btnClear        = document.getElementById('btn-clear');

  // --- State ---
  let allLines      = [];   // in-memory copy of life_log.log (chronological)
  let mediaRecorder = null;
  let audioChunks   = [];
  let isRecording   = false;
  let syncTimer     = null;
  let timerInterval = null;

  // --- Timer ---
  function startTimer() {
    const start = Date.now();
    timerEl.textContent = '00:00';
    timerInterval = setInterval(() => {
      const sec = Math.floor((Date.now() - start) / 1000);
      timerEl.textContent = `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
    }, 500);
  }
  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerEl.textContent = '';
  }

  // --- Record button state ---
  function setState(state) {
    LOG('state →', state);
    btnRecord.dataset.state = state;
    const rings = document.querySelectorAll('.ripple-ring');
    if (state === 'idle') {
      recordStatus.textContent = 'Tippen zum Aufnehmen';
      rings.forEach(r => r.classList.remove('show'));
      stopTimer();
    } else if (state === 'recording') {
      recordStatus.textContent = 'Aufnahme läuft — nochmal tippen zum Stoppen';
      rings.forEach(r => r.classList.add('show'));
      startTimer();
    } else if (state === 'transcribing') {
      recordStatus.textContent = 'Transkribiere...';
      rings.forEach(r => r.classList.remove('show'));
      stopTimer();
    }
  }

  // --- Overlay ---
  function showOverlay() {
    const c = GitHub.config();
    inOpenAI.value = Whisper.getKey();
    inUser.value   = c.user  || '';
    inRepo.value   = c.repo  || '';
    inToken.value  = c.token || '';
    setupErr.textContent = '';
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  // --- Log format (Python logger): 2026-04-14 10:23:45 - text ---
  function formatLine(text) {
    const d   = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} - ${text}`;
  }

  function parseLine(line) {
    const m = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) - (.+)$/);
    return m ? { ts: m[1], text: m[2] } : null;
  }

  function formatDateHeader(dateStr) {
    const d    = new Date(dateStr + 'T00:00:00');
    const now  = new Date();
    const toDateStr = x => x.toISOString().slice(0, 10);
    if (dateStr === toDateStr(now)) return 'Heute';
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (dateStr === toDateStr(yesterday)) return 'Gestern';
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // --- Render ---
  function renderAll() {
    logEntries.innerHTML = '';
    if (!allLines.length) {
      logEntries.innerHTML = '<p class="empty">Noch keine Einträge.<br>Tippe den Knopf und sprich.</p>';
      entryCount.textContent = '';
      return;
    }

    entryCount.textContent = allLines.length;

    // Group by date, newest first
    const groups = new Map();
    [...allLines].reverse().forEach(line => {
      const entry = parseLine(line);
      if (!entry) return;
      const date = entry.ts.slice(0, 10);
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(line);
    });

    groups.forEach((lines, date) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'day-group';

      const header = document.createElement('div');
      header.className = 'day-header';
      header.innerHTML = `<span>— ${formatDateHeader(date)} —</span>`;
      groupEl.appendChild(header);

      lines.forEach(line => {
        const card = makeCard(line);
        if (card) groupEl.appendChild(card);
      });

      logEntries.appendChild(groupEl);
    });
  }

  function makeCard(line) {
    const entry = parseLine(line);
    if (!entry) return null;

    const el = document.createElement('div');
    el.className = 'log-card';
    el.dataset.ts = entry.ts;
    el.innerHTML = `
      <div class="log-meta">
        <span>${entry.ts.slice(11)}</span>
        <span class="card-actions">
          <button class="btn-edit">Bearbeiten</button>
          <button class="btn-del">Löschen</button>
        </span>
      </div>
      <p class="log-text">${escHtml(entry.text)}</p>`;

    bindCardButtons(el);
    return el;
  }

  function bindCardButtons(el) {
    el.querySelector('.btn-edit').onclick = () => enterEditMode(el);
    el.querySelector('.btn-del').onclick  = () => deleteEntry(el.dataset.ts);
  }

  function enterEditMode(el) {
    const ts    = el.dataset.ts;
    const entry = allLines.map(parseLine).find(e => e && e.ts === ts);
    if (!entry) return;

    const textEl    = el.querySelector('.log-text');
    const actionsEl = el.querySelector('.card-actions');

    const textarea = document.createElement('textarea');
    textarea.className = 'edit-textarea';
    textarea.value = entry.text;
    textEl.replaceWith(textarea);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    actionsEl.innerHTML = `<button class="btn-save-edit">Speichern</button><button class="btn-cancel-edit">Abbrechen</button>`;

    actionsEl.querySelector('.btn-cancel-edit').onclick = () => {
      textarea.replaceWith(textEl);
      actionsEl.innerHTML = `<button class="btn-edit">Bearbeiten</button><button class="btn-del">Löschen</button>`;
      bindCardButtons(el);
    };

    actionsEl.querySelector('.btn-save-edit').onclick = async () => {
      const newText = textarea.value.trim();
      if (!newText || newText === entry.text) {
        actionsEl.querySelector('.btn-cancel-edit').onclick();
        return;
      }
      await updateEntry(ts, newText);
    };
  }

  // --- CRUD ---
  async function deleteEntry(ts) {
    LOG('delete:', ts);
    allLines = allLines.filter(l => !l.startsWith(ts));
    renderAll();
    showSync('Löschen...', '');
    try {
      await GitHub.writeLines(allLines);
      showSync('✓ gelöscht', 'ok');
    } catch (err) {
      ERR('delete error:', err);
      showSync('Fehler: ' + err.message, 'error');
    }
  }

  async function updateEntry(ts, newText) {
    LOG('update:', ts, '→', newText);
    const idx = allLines.findIndex(l => l.startsWith(ts));
    if (idx === -1) return;
    allLines[idx] = `${ts} - ${newText}`;
    renderAll();
    showSync('Speichern...', '');
    try {
      await GitHub.writeLines(allLines);
      showSync('✓ aktualisiert', 'ok');
    } catch (err) {
      ERR('update error:', err);
      showSync('Fehler: ' + err.message, 'error');
    }
  }

  async function saveEntry(text) {
    const line = formatLine(text);
    LOG('save:', line);
    allLines.push(line);
    renderAll();
    showSync('Speichern...', '');
    try {
      await GitHub.appendLine(line);
      showSync('✓ gespeichert', 'ok');
    } catch (err) {
      ERR('sync error:', err);
      showSync('Sync-Fehler: ' + err.message, 'error');
    }
  }

  // --- Load ---
  async function loadLog() {
    logEntries.innerHTML = '';
    allLines = [];
    entryCount.textContent = '';

    if (!GitHub.isConfigured()) {
      logEntries.innerHTML = '<p class="empty">GitHub noch nicht konfiguriert.</p>';
      return;
    }
    showSync('Laden...', '');
    try {
      allLines = await GitHub.getLines();
      LOG('loaded:', allLines.length, 'lines');
      syncStatus.className = '';
      renderAll();
    } catch (err) {
      ERR('loadLog error:', err);
      showSync('Ladefehler: ' + err.message, 'error');
    }
  }

  // --- Recording ---
  async function startRecording() {
    LOG('startRecording');
    liveTranscript.textContent = '';
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      ERR('getUserMedia failed', e);
      showSync('Mikrofon-Zugriff verweigert', 'error');
      return;
    }
    audioChunks   = [];
    mediaRecorder = new MediaRecorder(stream);
    LOG('mimeType:', mediaRecorder.mimeType);

    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      LOG('blob size:', blob.size);
      await processAudio(blob);
    };

    isRecording = true;
    setState('recording');
    mediaRecorder.start();
  }

  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    isRecording = false;
    setState('transcribing');
    btnRecord.disabled = true;
    mediaRecorder.stop();
  }

  async function processAudio(blob) {
    if (!Whisper.isConfigured()) {
      showSync('OpenAI Key fehlt', 'error');
      setState('idle');
      btnRecord.disabled = false;
      return;
    }
    try {
      showSync('Transkribiere...', '');
      const text = await Whisper.transcribe(blob);
      LOG('transcript:', text);
      if (text) {
        liveTranscript.textContent = text;
        await saveEntry(text);
      }
    } catch (err) {
      ERR('whisper error:', err);
      showSync('Fehler: ' + err.message, 'error');
    } finally {
      setState('idle');
      btnRecord.disabled = false;
    }
  }

  // --- Sync Toast ---
  function showSync(msg, type) {
    clearTimeout(syncTimer);
    syncStatus.textContent = msg;
    syncStatus.className = `visible ${type}`;
    syncTimer = setTimeout(() => { syncStatus.className = ''; }, 3000);
  }

  // --- Helpers ---
  function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // --- Events ---
  btnRecord.addEventListener('click', () => {
    if (isRecording) stopRecording();
    else startRecording();
  });

  async function submitText() {
    const text = textInput.value.trim();
    if (!text) return;
    textInput.value = '';
    await saveEntry(text);
  }
  btnTextSubmit.addEventListener('click', submitText);
  textInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitText(); });

  btnStart.addEventListener('click', async () => {
    if (!inOpenAI.value.trim()) { setupErr.textContent = 'OpenAI Key fehlt.'; return; }
    if (!inUser.value.trim() || !inRepo.value.trim() || !inToken.value.trim()) {
      setupErr.textContent = 'Alle GitHub-Felder ausfüllen.'; return;
    }
    GitHub.save(inUser.value, inRepo.value, inToken.value);
    Whisper.saveKey(inOpenAI.value);
    hideOverlay();
    await loadLog();
  });

  btnOpenSettings.addEventListener('click', showOverlay);

  btnClear.addEventListener('click', () => {
    logEntries.innerHTML = '';
    entryCount.textContent = '';
  });

  // --- Init ---
  async function init() {
    LOG('=== init ===', {
      gh_user: localStorage.getItem('gh_user'),
      gh_repo: localStorage.getItem('gh_repo'),
      has_token: !!localStorage.getItem('gh_token'),
      has_openai: !!localStorage.getItem('openai_key'),
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(r => LOG('SW registered', r.scope))
        .catch(e => ERR('SW failed', e));
    }

    if (Whisper.isConfigured() && GitHub.isConfigured()) {
      hideOverlay();
      await loadLog();
    } else {
      showOverlay();
    }
    LOG('=== init complete ===');
  }

  init();
})();
