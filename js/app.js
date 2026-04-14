// Main App
const App = (() => {

  const LOG = (...args) => console.log('[App]', ...args);
  const ERR = (...args) => console.error('[App]', ...args);

  // --- DOM ---
  const screenSetup    = document.getElementById('screen-setup');
  const screenMain     = document.getElementById('screen-main');
  const btnStart       = document.getElementById('btn-start');
  const btnToSetup     = document.getElementById('btn-to-setup');
  const inOpenAI       = document.getElementById('openai-key');
  const inUser         = document.getElementById('gh-user');
  const inRepo         = document.getElementById('gh-repo');
  const inToken        = document.getElementById('gh-token');
  const btnRecord      = document.getElementById('btn-record');
  const recordStatus   = document.getElementById('record-status');
  const liveTranscript = document.getElementById('live-transcript');
  const logEntries     = document.getElementById('log-entries');
  const syncStatus     = document.getElementById('sync-status');

  LOG('DOM resolved');

  let mediaRecorder = null;
  let audioChunks   = [];
  let isRecording   = false;
  let syncTimer     = null;

  // --- Screens ---
  function showScreen(id) {
    LOG('showScreen:', id);
    [screenSetup, screenMain].forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
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
    liveTranscript.classList.remove('has-text');

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
      LOG('chunk:', e.data.size);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      LOG('blob ready, size:', blob.size);
      await processAudio(blob);
    };

    isRecording = true;
    btnRecord.classList.add('recording');
    recordStatus.textContent = 'Aufnahme läuft...';
    mediaRecorder.start();
  }

  function stopRecording() {
    LOG('stopRecording, state:', mediaRecorder?.state);
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    isRecording = false;
    btnRecord.classList.remove('recording');
    recordStatus.textContent = 'Verarbeitung...';
    btnRecord.disabled = true;
    mediaRecorder.stop();
  }

  async function processAudio(blob) {
    LOG('processAudio, blob size:', blob.size);
    if (!Whisper.isConfigured()) {
      ERR('Whisper not configured');
      showSync('OpenAI Key fehlt', 'error');
      recordStatus.textContent = 'Tippen zum Aufnehmen';
      btnRecord.disabled = false;
      return;
    }
    try {
      showSync('Transkribiere...', '');
      const text = await Whisper.transcribe(blob);
      LOG('transcript:', text);

      if (text) {
        liveTranscript.textContent = text;
        liveTranscript.classList.add('has-text');
        await saveEntry(text);
      } else {
        LOG('empty transcript');
      }
    } catch (err) {
      ERR('processAudio error:', err);
      showSync('Fehler: ' + err.message, 'error');
    } finally {
      recordStatus.textContent = 'Tippen zum Aufnehmen';
      btnRecord.disabled = false;
    }
  }

  // --- Save ---
  async function saveEntry(text) {
    const line = formatLine(text);
    LOG('saveEntry line:', line);
    renderLine(line, true);
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
  function renderLine(line, prepend = false) {
    const entry = parseLine(line);
    if (!entry) { ERR('parseLine failed:', line); return; }

    const el = document.createElement('div');
    el.className = 'log-entry';
    el.innerHTML = `<span class="timestamp">${entry.ts}</span><span class="text">${escHtml(entry.text)}</span>`;

    if (prepend && logEntries.firstChild) {
      logEntries.insertBefore(el, logEntries.firstChild);
      document.getElementById('log-empty')?.remove();
    } else {
      logEntries.appendChild(el);
    }
  }

  async function loadLog() {
    logEntries.innerHTML = '';
    if (!GitHub.isConfigured()) {
      logEntries.innerHTML = '<div id="log-empty">GitHub noch nicht konfiguriert.</div>';
      return;
    }
    showSync('Laden...', '');
    try {
      const lines = await GitHub.getLines();
      LOG('lines loaded:', lines.length);
      syncStatus.className = '';
      if (!lines.length) {
        logEntries.innerHTML = '<div id="log-empty">Noch keine Einträge.<br>Tippe den Knopf und sprich.</div>';
        return;
      }
      [...lines].reverse().forEach(l => renderLine(l));
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
    LOG('btnStart clicked', { user: inUser.value, repo: inRepo.value, hasToken: !!inToken.value, hasOpenAI: !!inOpenAI.value });
    GitHub.save(inUser.value, inRepo.value, inToken.value);
    Whisper.saveKey(inOpenAI.value);
    showScreen('screen-main');
    await loadLog();
  });

  btnToSetup.addEventListener('click', () => {
    LOG('back to setup');
    const c = GitHub.config();
    inUser.value   = c.user  || '';
    inRepo.value   = c.repo  || '';
    inToken.value  = c.token || '';
    inOpenAI.value = Whisper.getKey();
    showScreen('screen-setup');
  });

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
    LOG('fully configured?', configured);

    if (configured) {
      showScreen('screen-main');
      await loadLog();
    } else {
      // Pre-fill whatever is already saved
      const c = GitHub.config();
      inUser.value   = c.user  || '';
      inRepo.value   = c.repo  || '';
      inToken.value  = c.token || '';
      inOpenAI.value = Whisper.getKey();
      showScreen('screen-setup');
    }

    LOG('=== init complete ===');
  }

  init();
})();
