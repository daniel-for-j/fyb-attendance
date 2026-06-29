// FYB Week Attendance - cloud sync (Firebase Firestore)
// This is the ONLY file that talks to Firebase. If Firebase isn't configured
// yet (see firebase-config.js), the app still works fully offline on one
// device - sync just silently stays inactive until configured.

const FybSync = (() => {
  let app = null;
  let db = null;
  let configured = false;
  let listenersStarted = false;
  let onStatusChange = () => {};
  let deviceName = localStorage.getItem('fyb_device_name') || '';

  function isConfigured() {
    return (
      window.FYB_FIREBASE_CONFIG &&
      window.FYB_FIREBASE_CONFIG.apiKey &&
      window.FYB_FIREBASE_CONFIG.apiKey !== 'PASTE_YOUR_API_KEY_HERE'
    );
  }

  async function init(statusCallback) {
    onStatusChange = statusCallback || (() => {});

    if (!isConfigured()) {
      configured = false;
      onStatusChange({ state: 'unconfigured' });
      return false;
    }

    try {
      const { initializeApp } = await import(
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'
      );
      const {
        getFirestore,
        enableIndexedDbPersistence,
        collection,
        doc,
        setDoc,
        getDoc,
        onSnapshot,
        serverTimestamp
      } = await import(
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
      );

      app = initializeApp(window.FYB_FIREBASE_CONFIG);
      db = getFirestore(app);

      try {
        await enableIndexedDbPersistence(db);
      } catch (e) {
        console.warn('Firestore offline persistence not enabled:', e.message);
      }

      FybSync._fs = { collection, doc, setDoc, onSnapshot, serverTimestamp };

      configured = true;
      onStatusChange({ state: 'connecting' });
      startRealtimeListener();

      // Force a direct server read to confirm connection (bypasses empty collection sync quirk)
      getDoc(doc(db, 'attendance', '_ping'), { source: 'server' })
        .then(() => onStatusChange({ state: 'online', lastSync: Date.now() }))
        .catch(() => {}); // ignore, let onSnapshot handle error states if any

      return true;
    } catch (err) {
      console.error('Firebase init failed:', err);
      configured = false;
      onStatusChange({ state: 'error', error: err.message });
      return false;
    }
  }

  function startRealtimeListener() {
    if (listenersStarted || !configured) return;
    listenersStarted = true;
    const { collection, onSnapshot } = FybSync._fs;

    onSnapshot(
      collection(db, 'attendance'),
      { includeMetadataChanges: true },
      async (snapshot) => {
        const fromCache = snapshot.metadata.fromCache;
        for (const change of snapshot.docChanges()) {
          const data = change.doc.data();
          await window.FybDB.mergeRemote({
            key: change.doc.id,
            studentId: data.studentId,
            day: data.day,
            present: data.present,
            markedBy: data.markedBy,
            updatedAt: data.updatedAt || 0
          });
        }
        onStatusChange({
          state: fromCache ? 'offline' : 'online',
          lastSync: Date.now()
        });
        window.dispatchEvent(new CustomEvent('fyb-remote-update'));
      },
      (err) => {
        console.error('Firestore listener error:', err);
        onStatusChange({ state: 'error', error: err.message });
      }
    );
  }

  /** Push a single local attendance record up to Firestore. */
  async function pushRecord(record) {
    if (!configured) return false;
    try {
      const { doc, setDoc, serverTimestamp } = FybSync._fs;
      await setDoc(doc(db, 'attendance', record.key), {
        studentId: record.studentId,
        day: record.day,
        present: record.present,
        markedBy: record.markedBy,
        updatedAt: record.updatedAt,
        syncedAt: serverTimestamp()
      });
      return true;
    } catch (err) {
      console.error('Push failed for', record.key, err);
      return false;
    }
  }

  /** Flush all locally unsynced records to the cloud. Call on reconnect. */
  async function flushUnsynced() {
    if (!configured || !navigator.onLine) return;
    const unsynced = await window.FybDB.getUnsynced();
    if (!unsynced.length) return;
    const okKeys = [];
    for (const rec of unsynced) {
      const ok = await pushRecord(rec);
      if (ok) okKeys.push(rec.key);
    }
    if (okKeys.length) await window.FybDB.markSynced(okKeys);
    onStatusChange({ state: 'online', lastSync: Date.now(), flushed: okKeys.length });
  }

  function setDeviceName(name) {
    deviceName = name;
    localStorage.setItem('fyb_device_name', name);
  }

  function getDeviceName() {
    return deviceName;
  }

  // Auto-flush whenever the browser regains connectivity.
  window.addEventListener('online', () => flushUnsynced());

  return {
    init,
    pushRecord,
    flushUnsynced,
    isConfigured,
    setDeviceName,
    getDeviceName
  };
})();

window.FybSync = FybSync;
