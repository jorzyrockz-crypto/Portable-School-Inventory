// Firebase settings for Supply Requests (teachers send requests, the custodian reviews them).
//
// Leave this as null to use the app without Supply Requests. To turn them on:
//   1. Create a Firebase project and a Web app (see README → "Supply requests: Firebase setup").
//   2. Paste the firebaseConfig object Firebase shows you below, replacing null.
//   3. Commit. Phones pick up the change the next time they open the app online.
//
// These values are not secret – every web app that uses Firebase ships them to the browser.
// Access is controlled by firestore.rules, which you publish in the Firebase console.
window.FIREBASE_CONFIG = null;
/* Example:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
*/
