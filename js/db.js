// IndexedDB wrapper — lokaler Speicher für alle Log-Einträge
const DB = (() => {
  const DB_NAME = 'life-logger';
  const STORE   = 'entries';
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = e => {
        const store = e.target.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('ts', 'ts', { unique: false });
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror   = () => reject(req.error);
    });
  }

  async function add(text) {
    const d = await open();
    const entry = { ts: new Date().toISOString(), text };
    return new Promise((resolve, reject) => {
      const tx  = d.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).add(entry);
      req.onsuccess = () => resolve({ id: req.result, ...entry });
      req.onerror   = () => reject(req.error);
    });
  }

  async function getAll() {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx  = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index('ts').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  function formatLine(entry) {
    const d = new Date(entry.ts);
    const pad = n => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `[${date} ${time}] ${entry.text}`;
  }

  async function exportLog() {
    const entries = await getAll();
    return entries.map(formatLine).join('\n');
  }

  return { add, getAll, exportLog, formatLine };
})();
