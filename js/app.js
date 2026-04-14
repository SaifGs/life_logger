// Main App
const App = (() => {

  const LOG = (...args) => console.log('[App]', ...args);
  const ERR = (...args) => console.error('[App]', ...args);

  // --- DOM ---
  const btnRecord       = document.getElementById('btn-record');
  const recordStatus    = document.getElementById('record-status');
  const liveTranscript  = document.getElementById('live-transcript');
  const logEntries      = document.getElementById('log-entries');
  const syncStatus      = document.getElementById('sync-status');
  const btnSettings     = document.getElementById('btn-settings');
  const modalSettings   = document.getElementById('modal-settings');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const btnCloseSettings= document.getElementById('btn-close-settings');
  const inUser          = document.getElementById('gh-user');
  const inRepo          = document.getElementById('gh-repo');
  const inToken         = document.getElementById('gh-token');
  const inOpenAI        = document.getElementById('openai-key');

  LOG('DOM elements resolved', {
    btnRecord, recordStatus, liveTranscript, logEntries,
    btnSettings, modalSettings, inUser, inRepo, inToken, inOpenAI
  });

  let mediaRecorder = null;
  let audioChunks   = [];
  let isRecording   = false;
  let syncTimer     = null;

  // --- Log Format (Python-Logger-Stil) ---
  // 2026-04-14 10:23:45 - text
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
    LOG('startRecording called');
    LOG('Whisper configured?', Whisper.isConfigured());
    LOG('GitHub configured?', GitHub.isConfigured());

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      LOG('Microphone stream acquired', stream);
    } catch (e) {
      ERR('getUserMedia failed', e);
      showSync('Mikrofon-Zugriff verweigert', 'error');
      return;
    }

    audioChunks  = [];
    mediaRecorder = new MediaRecorder(stream);
    LOG('MediaRecorder created, mimeType:', mediaRecorder.mimeType);

    mediaRecorder.ondataavailable = e => {
      LOG('ondataavailable, chunk size:', e.data.size);
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      LOG('MediaRecorder stopped, chunks:', audioChunks.length);
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      LOG('Audio blob created, size:', blob.size, 'type:', blob.type);
      await processAudio(blob);
    };

    isRecording = true;
    btnRecord.classList.add('recording');
    recordStatus.textContent = 'Aufnahme läuft...';
    liveTranscript.textContent = '';
    mediaRecorder.start();
    LOG('MediaRecorder started');
  }

  function stopRecording() {
    LOG('stopRecording called, state:', mediaRecorder?.state);
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    isRecording = false;
    btnRecord.classList.remove('recording');
    recordStatus.textContent = 'Verarbeitung...';
    btnRecord.disabled = true;
    mediaRecorder.stop();
  }

  async function processAudio(blob) {
    LOG('processAudio called, blob size:', blob.size);
    if (!Whisper.isConfigured()) {
      ERR('Whisper not configured — openai_key missing in localStorage');
      showSync('OpenAI Key fehlt — bitte in ⚙ eintragen', 'error');
      recordStatus.textContent = 'Tippen zum Aufnehmen';
      btnRecord.disabled = false;
      return;
    }
    try {
      LOG('Sending audio to Whisper API...');
      showSync('Whisper...', '');
      const text = await Whisper.transcribe(blob);
      LOG('Whisper response:', text);
      liveTranscript.textContent = '';
      if (text) await saveEntry(text);
      else LOG('Whisper returned empty text');
    } catch (err) {
      ERR('Whisper error:', err);
      showSync('Fehler: ' + err.message, 'error');
    } finally {
      recordStatus.textContent = 'Tippen zum Aufnehmen';
      btnRecord.disabled = false;
    }
  }

  // --- Save ---
  async function saveEntry(text) {
    LOG('saveEntry:', text);
    const line = formatLine(text);
    LOG('formatted line:', line);
    renderLine(line, true);
    if (!GitHub.isConfigured()) {
      ERR('GitHub not configured');
      showSync('GitHub nicht konfiguriert', 'error');
      return;
    }
    showSync('Sync...', '');
    try {
      LOG('Appending to GitHub...');
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
    if (!entry) {
      ERR('parseLine failed for:', line);
      return;
    }

    const el = document.createElement('div');
    el.className = 'log-entry';
    el.innerHTML = `<span class="timestamp">${entry.ts}</span><span class="text">${escHtml(entry.text)}</span>`;

    if (prepend && logEntries.firstChild) {
      logEntries.insertBefore(el, logEntries.firstChild);
      const empty = document.getElementById('log-empty');
      if (empty) empty.remove();
    } else {
      logEntries.appendChild(el);
    }
  }

  async function renderAll() {
    LOG('renderAll called');
    logEntries.innerHTML = '';
    if (!GitHub.isConfigured()) {
      LOG('GitHub not configured — showing setup message');
      logEntries.innerHTML = '<div id="log-empty">⚙ GitHub konfigurieren um Einträge zu laden.</div>';
      return;
    }
    showSync('Laden...', '');
    try {
      LOG('Fetching lines from GitHub...');
      const lines = await GitHub.getLines();
      LOG('Lines loaded:', lines.length);
      syncStatus.className = '';
      if (!lines.length) {
        logEntries.innerHTML = '<div id="log-empty">Noch keine Einträge.<br>Tippe den Knopf und sprich.</div>';
        return;
      }
      [...lines].reverse().forEach(l => renderLine(l));
    } catch (err) {
      ERR('renderAll error:', err);
      showSync('Ladefehler: ' + err.message, 'error');
    }
  }

  // --- Sync Status Toast ---
  function showSync(msg, type) {
    clearTimeout(syncTimer);
    syncStatus.textContent = msg;
    syncStatus.className = `visible ${type}`;
    syncTimer = setTimeout(() => { syncStatus.className = ''; }, 3000);
  }

  // --- Settings ---
  function openSettings() {
    const c = GitHub.config();
    LOG('openSettings, current config:', { user: c.user, repo: c.repo, hasToken: !!c.token, hasOpenAI: !!Whisper.getKey() });
    inUser.value   = c.user  || '';
    inRepo.value   = c.repo  || '';
    inToken.value  = c.token || '';
    inOpenAI.value = Whisper.getKey();
    modalSettings.classList.remove('hidden');
  }

  function closeSettings() {
    LOG('closeSettings');
    modalSettings.classList.add('hidden');
  }

  async function saveSettings() {
    LOG('saveSettings', { user: inUser.value, repo: inRepo.value, hasToken: !!inToken.value, hasOpenAI: !!inOpenAI.value });
    GitHub.save(inUser.value, inRepo.value, inToken.value);
    Whisper.saveKey(inOpenAI.value);
    LOG('Settings saved to localStorage');
    showSync('Einstellungen gespeichert', 'ok');
    closeSettings();
    await renderAll();
  }

  // --- Helpers ---
  function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // --- Events ---
  btnRecord.addEventListener('click', () => {
    LOG('Record button clicked, isRecording:', isRecording);
    if (isRecording) stopRecording();
    else startRecording();
  });

  btnSettings.addEventListener('click', openSettings);
  btnCloseSettings.addEventListener('click', closeSettings);
  btnSaveSettings.addEventListener('click', saveSettings);

  modalSettings.addEventListener('click', e => {
    if (e.target === modalSettings) closeSettings();
  });

  // --- Init ---
  async function init() {
    LOG('=== Life Logger init ===');
    LOG('localStorage state:', {
      gh_user:    localStorage.getItem('gh_user'),
      gh_repo:    localStorage.getItem('gh_repo'),
      has_token:  !!localStorage.getItem('gh_token'),
      has_openai: !!localStorage.getItem('openai_key'),
    });
    LOG('GitHub configured?', GitHub.isConfigured());
    LOG('Whisper configured?', Whisper.isConfigured());

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(r => LOG('Service Worker registered', r.scope))
        .catch(e => ERR('Service Worker failed', e));
    }
    await renderAll();
    LOG('=== init complete ===');
  }

  init();
})();
