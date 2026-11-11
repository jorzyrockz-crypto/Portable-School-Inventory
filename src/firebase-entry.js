// Bundled by scripts/build-assets.mjs into assets/vendor/firebase.js (window.FirebaseSDK).
// Only what the Supply Requests feature uses, so the bundle stays small.
export { initializeApp } from 'firebase/app';
export {
  getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, updateProfile
} from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, getDoc, setDoc, updateDoc, addDoc, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, runTransaction, writeBatch, arrayUnion
} from 'firebase/firestore';
