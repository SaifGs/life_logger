// Main App
const App = (() => {

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
  const btnExport       = document.getElementById('btn-export');
  const inUser          = document.getElementById('gh-user');
  const inRepo          = document.getElementById('gh-repo');
  const inToken         = document.getElementById('gh-token');

  let recognition = null;
  let isRecording = false;
  let finalText   = '';
  let syncTimer   = null;

  // --- Speech Recognition ---
  function initSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      recordStatus.textContent = 'Sprache nicht unterstützt — Chrome/Edge empfohlen';
      btnRecord.disabled = true;
      return;
    }
    recognition = new SR();
    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = e => {
      let interim = '';
      finalText = '';
      for (const r of e.results) {
        if (r.isFinal) finalText += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      liveTranscript.textContent = finalText + interim;
    };

    recognition.onerror = e => {
      if (e.error === 'no-speech') return;
      showSync('Mikrofon-Fehler: ' + e.error, 'error');
      stopRecording();
    };

    recognition.onend = () => {
      if (isRecording) recognition.start(); // re-start on pause
    };
  }

  function startRecording() {
    if (!recognition) return;
    isRecording = true;
    finalText   = '';
    liveTranscript.textContent = '';
    btnRecord.classList.add('recording');
    recordStatus.textContent = 'Aufnahme läuft...';
    recognition.start();
  }

  async function stopRecording() {
    if (!recognition) return;
    isRecording = false;
    btnRecord.classList.remove('recording');
    recordStatus.textContent = 'Tippen zum Aufnehmen';
    recognition.onend = null;
    recognition.stop();

    const text = finalText.trim() || liveTranscript.textContent.trim();
    liveTranscript.textContent = '';

    if (!text) return;
    await saveEntry(text);
  }

  // --- Save & Sync ---
  async function saveEntry(text) {
    const entry = await DB.add(text);
    renderEntry(entry, true);
    syncToGitHub(entry);
  }

  async function syncToGitHub(entry) {
    if (!GitHub.isConfigured()) return;
    const line = DB.formatLine(entry);
    showSync('Sync...', '');
    try {
      await GitHub.appendLine(line);
      showSync('✓ gespeichert', 'ok');
    } catch (err) {
      showSync('Sync-Fehler: ' + err.message, 'error');
    }
  }

  // --- Render ---
  function renderEntry(entry, prepend = false) {
    const d   = new Date(entry.ts);
    const pad = n => String(n).padStart(2, '0');
    const ts  = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

    const el = document.createElement('div');
    el.className = 'log-entry';
    el.innerHTML = `<span class="timestamp">${ts}</span><span class="text">${escHtml(entry.text)}</span>`;

    if (prepend && logEntries.firstChild) {
      logEntries.insertBefore(el, logEntries.firstChild);
      // remove empty state
      const empty = document.getElementById('log-empty');
      if (empty) empty.remove();
    } else {
      logEntries.appendChild(el);
    }
  }

  async function renderAll() {
    logEntries.innerHTML = '';
    const entries = await DB.getAll();
    if (!entries.length) {
      logEntries.innerHTML = '<div id="log-empty">Noch keine Einträge.<br>Tippe den Knopf und sprich.</div>';
      return;
    }
    // newest first
    [...entries].reverse().forEach(e => renderEntry(e));
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
    inUser.value  = c.user  || '';
    inRepo.value  = c.repo  || '';
    inToken.value = c.token || '';
    modalSettings.classList.remove('hidden');
  }

  function closeSettings() {
    modalSettings.classList.add('hidden');
  }

  function saveSettings() {
    GitHub.save(inUser.value, inRepo.value, inToken.value);
    showSync('Einstellungen gespeichert', 'ok');
    closeSettings();
  }

  async function exportLog() {
    const log = await DB.exportLog();
    const blob = new Blob([log], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'life.log';
    a.click();
    URL.revokeObjectURL(url);
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

  btnSettings.addEventListener('click', openSettings);
  btnCloseSettings.addEventListener('click', closeSettings);
  btnSaveSettings.addEventListener('click', saveSettings);
  btnExport.addEventListener('click', exportLog);

  modalSettings.addEventListener('click', e => {
    if (e.target === modalSettings) closeSettings();
  });

  // --- Init ---
  async function init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    initSpeech();
    await renderAll();

    if (!GitHub.isConfigured()) {
      showSync('⚙ GitHub noch nicht konfiguriert', '');
    }
  }

  init();
})();
