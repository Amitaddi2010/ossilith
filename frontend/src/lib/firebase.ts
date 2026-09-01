import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAfZIdyA58O51xPqOwx8f9QR8mx2O4hAH8",
  authDomain: "intellectspots.firebaseapp.com",
  projectId: "intellectspots",
  storageBucket: "intellectspots.firebasestorage.app",
  messagingSenderId: "679797340027",
  appId: "1:679797340027:web:950b769eb4de76722a6fde",
  measurementId: "G-FX2SR1X02K"
};

// Initialize Firebase (singleton pattern for Next.js SSR)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, googleProvider };
