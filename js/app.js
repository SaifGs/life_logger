// Main App
const App = (() => {

  const LOG = (...args) => console.log('%c[App]', 'color:#A78BFA;font-weight:600', ...args);
  const ERR = (...args) => console.error('[App]', ...args);

  // --- DOM ---
  const overlay        = document.getElementById('overlay');
  const btnStart       = document.getElementById('btn-start');
  const btnOpenSettings= document.getElementById('btn-open-settings');
  const setupErr       = document.getElementById('setup-err');
  const inOpenAI       = document.getElementById('openai-key');
  const inUser         = document.getElementById('gh-user');
  const inRepo         = document.getElementById('gh-repo');
  const inToken        = document.getElementById('gh-token');
  const btnRecord      = document.getElementById('btn-record');
  const recordStatus   = document.getElementById('record-status');
  const timerEl        = document.getElementById('timer');
  const liveTranscript = document.getElementById('live-transcript');
  const logEntries     = document.getElementById('log-entries');
  const entryCount     = document.getElementById('entry-count');
  const syncStatus     = document.getElementById('sync-status');

  LOG('DOM resolved');

  let mediaRecorder  = null;
  let audioChunks    = [];
  let isRecording    = false;
  let syncTimer      = null;
  let timerInterval  = null;
  let entryCountVal  = 0;

  // --- Timer ---
  function startTimer() {
    const start = Date.now();
    timerEl.textContent = '00:00';
    timerInterval = setInterval(() => {
      const sec = Math.floor((Date.now() - start) / 1000);
      const m   = String(Math.floor(sec / 60)).padStart(2, '0');
      const s   = String(sec % 60).padStart(2, '0');
      timerEl.textContent = `${m}:${s}`;
    }, 500);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerEl.textContent = '';
  }

  // --- State ---
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
    LOG('overlay shown');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
    LOG('overlay hidden');
  }

  // --- Log Format (Python-Logger-Stil): 2026-04-14 10:23:45 - text ---
  function formatLine(text) {
    const d   = new Date();
    const pad = n => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return `${date} ${time} - ${text}`;
  }

  function parseLine(line) {
    const m = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) - (.+)$/);
    if (!m) return null;
    return { ts: m[1], text: m[2] };
  }

  // --- Recording ---
  async function startRecording() {
    LOG('startRecording');
    liveTranscript.textContent = '';

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      LOG('mic acquired');
    } catch (e) {
      ERR('getUserMedia failed', e);
      showSync('Mikrofon-Zugriff verweigert', 'error');
      return;
    }

    audioChunks   = [];
    mediaRecorder = new MediaRecorder(stream);
    LOG('MediaRecorder mimeType:', mediaRecorder.mimeType);

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      LOG('blob ready, size:', blob.size);
      await processAudio(blob);
    };

    isRecording = true;
    setState('recording');
    mediaRecorder.start();
  }

  function stopRecording() {
    LOG('stopRecording, state:', mediaRecorder?.state);
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    isRecording = false;
    setState('transcribing');
    btnRecord.disabled = true;
    mediaRecorder.stop();
  }

  async function processAudio(blob) {
    LOG('processAudio, blob size:', blob.size);
    if (!Whisper.isConfigured()) {
      ERR('Whisper not configured');
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
      ERR('processAudio error:', err);
      showSync('Fehler: ' + err.message, 'error');
    } finally {
      setState('idle');
      btnRecord.disabled = false;
    }
  }

  // --- Save ---
  async function saveEntry(text) {
    const line = formatLine(text);
    LOG('saveEntry:', line);
    prependCard(line);
    entryCountVal++;
    entryCount.textContent = entryCountVal;

    if (!GitHub.isConfigured()) {
      ERR('GitHub not configured');
      showSync('GitHub nicht konfiguriert', 'error');
      return;
    }
    showSync('Speichern...', '');
    try {
      await GitHub.appendLine(line);
      LOG('GitHub sync OK');
      showSync('✓ gespeichert', 'ok');
    } catch (err) {
      ERR('GitHub sync error:', err);
      showSync('Sync-Fehler: ' + err.message, 'error');
    }
  }

  // --- Render ---
  function prependCard(line) {
    const entry = parseLine(line);
    if (!entry) { ERR('parseLine failed:', line); return; }
    const el = document.createElement('div');
    el.className = 'log-card';
    el.innerHTML = `<div class="log-meta">${entry.ts}</div><p class="log-text">${escHtml(entry.text)}</p>`;
    if (logEntries.firstChild) {
      logEntries.insertBefore(el, logEntries.firstChild);
      document.getElementById('log-empty')?.remove();
    } else {
      logEntries.appendChild(el);
    }
  }

  async function loadLog() {
    logEntries.innerHTML = '';
    entryCountVal = 0;
    entryCount.textContent = '';

    if (!GitHub.isConfigured()) {
      logEntries.innerHTML = '<p class="empty">GitHub noch nicht konfiguriert.</p>';
      return;
    }
    showSync('Laden...', '');
    try {
      const lines = await GitHub.getLines();
      LOG('lines loaded:', lines.length);
      syncStatus.className = '';
      entryCountVal = lines.length;
      if (lines.length) entryCount.textContent = lines.length;

      if (!lines.length) {
        logEntries.innerHTML = '<p class="empty">Noch keine Einträge.<br>Tippe den Knopf und sprich.</p>';
        return;
      }
      [...lines].reverse().forEach(l => {
        const entry = parseLine(l);
        if (!entry) return;
        const el = document.createElement('div');
        el.className = 'log-card';
        el.innerHTML = `<div class="log-meta">${entry.ts}</div><p class="log-text">${escHtml(entry.text)}</p>`;
        logEntries.appendChild(el);
      });
    } catch (err) {
      ERR('loadLog error:', err);
      showSync('Ladefehler: ' + err.message, 'error');
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
    LOG('record click, isRecording:', isRecording);
    if (isRecording) stopRecording();
    else startRecording();
  });

  btnStart.addEventListener('click', async () => {
    LOG('btnStart clicked');
    if (!inOpenAI.value.trim()) { setupErr.textContent = 'OpenAI Key fehlt.'; return; }
    if (!inUser.value.trim() || !inRepo.value.trim() || !inToken.value.trim()) {
      setupErr.textContent = 'Alle GitHub-Felder ausfüllen.'; return;
    }
    GitHub.save(inUser.value, inRepo.value, inToken.value);
    Whisper.saveKey(inOpenAI.value);
    LOG('settings saved');
    hideOverlay();
    await loadLog();
  });

  btnOpenSettings.addEventListener('click', showOverlay);

  // --- Init ---
  async function init() {
    LOG('=== init ===');
    LOG('localStorage:', {
      gh_user:    localStorage.getItem('gh_user'),
      gh_repo:    localStorage.getItem('gh_repo'),
      has_token:  !!localStorage.getItem('gh_token'),
      has_openai: !!localStorage.getItem('openai_key'),
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(r => LOG('SW registered', r.scope))
        .catch(e => ERR('SW failed', e));
    }

    const configured = Whisper.isConfigured() && GitHub.isConfigured();
    LOG('configured?', configured);

    if (configured) {
      hideOverlay();
      await loadLog();
    } else {
      showOverlay();
    }

    LOG('=== init complete ===');
  }

  init();
})();
