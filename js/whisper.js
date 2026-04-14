// Whisper API — Audio-Aufnahme via MediaRecorder + OpenAI Transcription
const Whisper = (() => {
  const KEY_STORAGE = 'openai_key';
  const LOG = (...args) => console.log('[Whisper]', ...args);
  const ERR = (...args) => console.error('[Whisper]', ...args);

  function getKey()        { return localStorage.getItem(KEY_STORAGE) || ''; }
  function saveKey(key)    {
    LOG('saveKey called, length:', key.trim().length);
    localStorage.setItem(KEY_STORAGE, key.trim());
  }
  function isConfigured()  {
    const ok = !!getKey();
    LOG('isConfigured:', ok);
    return ok;
  }

  async function transcribe(audioBlob) {
    const key = getKey();
    LOG('transcribe called, blob size:', audioBlob.size, 'type:', audioBlob.type);
    if (!key) throw new Error('OpenAI API Key fehlt');

    const form = new FormData();
    form.append('file', audioBlob, 'audio.webm');
    form.append('model', 'whisper-1');
    form.append('language', 'de');

    LOG('Sending request to OpenAI...');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    LOG('Response status:', res.status, res.statusText);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      ERR('API error body:', err);
      throw new Error(err.error?.message || `Whisper ${res.status}`);
    }
    const data = await res.json();
    LOG('Transcription result:', data);
    return (data.text || '').trim();
  }

  return { getKey, saveKey, isConfigured, transcribe };
})();
