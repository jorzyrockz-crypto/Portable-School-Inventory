// Firebase settings for Supply Requests (teachers send requests, the custodian reviews them).
//
// Set to null to use the app without Supply Requests. To point it at another project:
//   1. Create a Firebase project and a Web app (see README → "Supply requests: Firebase setup").
//   2. Paste the firebaseConfig object Firebase shows you below, replacing the one here.
//   3. Commit. Phones pick up the change the next time they open the app online.
//
// These values are not secret – every web app that uses Firebase ships them to the browser.
// Access is controlled by firestore.rules, which you publish in the Firebase console.
// Project: russapps-custodian-pro
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyChkK98BWFd8KmrrWqgQ5h9xEkPBsnlJwA",
  authDomain: "russapps-custodian-pro.firebaseapp.com",
  projectId: "russapps-custodian-pro",
  storageBucket: "russapps-custodian-pro.firebasestorage.app",
  messagingSenderId: "203141431759",
  appId: "1:203141431759:web:db2a25ad52d091d6a052ba",
  measurementId: "G-CXB58K4113"
};
