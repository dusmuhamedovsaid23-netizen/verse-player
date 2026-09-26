// Simple IndexedDB wrapper for storing songs (audio + cover blobs + lyrics/timestamps).
const DB_NAME = 'verse-player';
const DB_VERSION = 1;
const STORE = 'songs';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = fn(store);
    tx.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
    tx.onerror = () => reject(tx.error);
  });
}

export const SongDB = {
  async saveSong(song) {
    // song: {id, title, artist, audioBlob, coverBlob, lyricsRaw, lines, updatedAt}
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(song);
      tx.oncomplete = () => resolve(song);
      tx.onerror = () => reject(tx.error);
    });
  },

  async getSong(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async getAllSongs() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.updatedAt - a.updatedAt));
      req.onerror = () => reject(req.error);
    });
  },

  async deleteSong(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async clearAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};

const SETTINGS_KEY = 'verse-player-settings';
const LAST_SONG_KEY = 'verse-player-last-song';

export const Settings = {
  load() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  },
  save(partial) {
    const current = Settings.load();
    const next = { ...current, ...partial };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
    return next;
  },
  getLastSongId() {
    try { return localStorage.getItem(LAST_SONG_KEY); } catch { return null; }
  },
  setLastSongId(id) {
    try { localStorage.setItem(LAST_SONG_KEY, id); } catch {}
  }
};

export function uid() {
  return 'song-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
