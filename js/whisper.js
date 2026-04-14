// Whisper API — Audio-Aufnahme via MediaRecorder + OpenAI Transcription
const Whisper = (() => {
  const KEY_STORAGE = 'openai_key';

  function getKey()        { return localStorage.getItem(KEY_STORAGE) || ''; }
  function saveKey(key)    { localStorage.setItem(KEY_STORAGE, key.trim()); }
  function isConfigured()  { return !!getKey(); }

  async function transcribe(audioBlob) {
    const key = getKey();
    if (!key) throw new Error('OpenAI API Key fehlt');

    const form = new FormData();
    form.append('file', audioBlob, 'audio.webm');
    form.append('model', 'whisper-1');
    form.append('language', 'de');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Whisper ${res.status}`);
    }
    const data = await res.json();
    return (data.text || '').trim();
  }

  return { getKey, saveKey, isConfigured, transcribe };
})();
