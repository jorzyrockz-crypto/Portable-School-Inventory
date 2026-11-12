// Firebase settings for Supply Requests (teachers send requests, the custodian reviews them).
//
// Set to null to use the app without Supply Requests. To point it at another project:
//   1. Create a Firebase project and a Web app (see README → "Supply requests: Firebase setup").
//   2. Paste the firebaseConfig object Firebase shows you below, replacing the one here.
//   3. Commit. Phones pick up the change the next time they open the app online.
//
// These values are not secret – every web app that uses Firebase ships them to the browser.
// Access is controlled by firestore.rules, which you publish in the Firebase console.
// Project: russapps-custodianpro
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAa1JM1jEeja08deEwInAbpvrjkVjBgCTA",
  authDomain: "russapps-custodianpro.firebaseapp.com",
  projectId: "russapps-custodianpro",
  storageBucket: "russapps-custodianpro.firebasestorage.app",
  messagingSenderId: "908399867253",
  appId: "1:908399867253:web:782b92a630109f9b4b8f3c",
  measurementId: "G-M3Y6HHV5PT"
};
