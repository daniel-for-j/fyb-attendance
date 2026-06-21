// FYB Week Attendance - Firebase configuration
//
// HOW TO SET THIS UP (takes about 5 minutes, completely free):
//
// 1. Go to https://console.firebase.google.com and sign in with any Google account.
// 2. Click "Add project" -> name it e.g. "fyb-week-2026" -> finish creation
//    (you can skip Google Analytics, it's not needed).
// 3. In the left sidebar, click "Build" -> "Firestore Database" -> "Create database".
//    - Choose "Start in production mode".
//    - Pick any location close to Nigeria (e.g. eur3 or europe-west).
// 4. After it's created, click the "Rules" tab and replace the contents with:
//
//      rules_version = '2';
//      service cloud.firestore {
//        match /databases/{database}/documents {
//          match /attendance/{docId} {
//            allow read, write: if true;
//          }
//        }
//      }
//
//    Click "Publish". (This keeps it simple/open since this is an internal
//    event tool used only by your registration team with the app link -
//    nobody else will know the project URL.)
//
// 5. Go to Project Settings (gear icon, top left) -> scroll to "Your apps" ->
//    click the "</>" (Web) icon -> register an app (any nickname) ->
//    it will show you a firebaseConfig object like the one below.
//
// 6. Copy those 6 values into the object below, replacing the placeholders.
//
// 7. Save this file and re-upload/redeploy the app. That's it - every
//    device that opens the app will now sync attendance in the background.
//
// If you skip this setup, the app still works perfectly for searching and
// marking attendance on a SINGLE device - it just won't sync to others
// until this is filled in.

window.FYB_FIREBASE_CONFIG = {
    apiKey: "AIzaSyD_Icb-My1xzTCq2Jbqr5h53sBFXW4OPdo",
    authDomain: "fyb-week-2026.firebaseapp.com",
    projectId: "fyb-week-2026",
    storageBucket: "fyb-week-2026.firebasestorage.app",
    messagingSenderId: "1079818338446",
    appId: "1:1079818338446:web:1b1a1847ffaad205dec9df",
    measurementId: "G-Z4MKBBL5J6"
};


