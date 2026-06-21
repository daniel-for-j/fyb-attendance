// FYB Week Attendance - local database (IndexedDB)
// Every attendance mark is written here FIRST, instantly, with no network
// dependency. sync.js later pushes unsynced records to Firestore and pulls
// remote changes back in. This file has zero knowledge of Firebase.

const FYB_DB_NAME = 'fyb-attendance-db';
const FYB_DB_VERSION = 1;
const STORE = 'attendance';

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(FYB_DB_NAME, FYB_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // key = `${matricKey}__${day}`
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('matricKey', 'matricKey', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function normKey(matric) {
  return String(matric || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const FybDB = {
  /**
   * Mark or unmark a student present for a given day.
   * Always writes locally first (instant, offline-safe).
   */
  async setAttendance(matric, day, present, markedBy) {
    const db = await openDB();
    const matricKey = normKey(matric);
    const key = `${matricKey}__${day}`;
    const record = {
      key,
      matricKey,
      matric,
      day,
      present: !!present,
      markedBy: markedBy || 'Unknown',
      updatedAt: Date.now(),
      synced: 0 // 0 = false, 1 = true (IndexedDB indexes work better with primitives)
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  },

  /** Get attendance for one student across all days. Returns {day: record} */
  async getForStudent(matric) {
    const db = await openDB();
    const matricKey = normKey(matric);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const idx = tx.objectStore(STORE).index('matricKey');
      const req = idx.getAll(matricKey);
      req.onsuccess = () => {
        const out = {};
        for (const rec of req.result) out[rec.day] = rec;
        resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
  },

  /** Get all attendance records (used for stats and full sync). */
  async getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  /** Get all records not yet synced to the cloud. */
  async getUnsynced() {
    const all = await this.getAll();
    return all.filter((r) => !r.synced);
  },

  /** Mark a batch of local keys as synced. */
  async markSynced(keys) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const key of keys) {
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          const rec = getReq.result;
          if (rec) {
            rec.synced = 1;
            store.put(rec);
          }
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Merge an incoming remote record into local storage.
   * Last-write-wins by updatedAt, remote always marked synced.
   */
  async mergeRemote(remoteRecord) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const getReq = store.get(remoteRecord.key);
      getReq.onsuccess = () => {
        const local = getReq.result;
        if (!local || remoteRecord.updatedAt >= local.updatedAt) {
          store.put({ ...remoteRecord, synced: 1 });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  normKey
};

window.FybDB = FybDB;
