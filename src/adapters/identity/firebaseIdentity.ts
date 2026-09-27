import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import type { IdentityAdapter, IdentityState } from "./identity";

const firebaseConfig = {
  apiKey: "AIzaSyCZUVK3qqyrEu1sQFH827sZrx7ptWFt6ao",
  authDomain: "civilbonus-13cd1.firebaseapp.com",
  projectId: "civilbonus-13cd1",
  storageBucket: "civilbonus-13cd1.firebasestorage.app",
  messagingSenderId: "229349996678",
  appId: "1:229349996678:web:e966773d0ff341aa71b907",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export const firebaseIdentityAdapter: IdentityAdapter = {
  subscribe(listener) {
    listener({ status: "loading" });
    return onAuthStateChanged(auth, (user) => {
      const state: IdentityState = user
        ? {
            status: "signedIn",
            user: {
              id: user.uid,
              displayName: user.displayName,
              email: user.email,
              photoUrl: user.photoURL,
            },
          }
        : { status: "signedOut" };
      listener(state);
    });
  },

  async signInWithGoogle() {
    await signInWithPopup(auth, provider);
  },

  async signOut() {
    await firebaseSignOut(auth);
  },
};
