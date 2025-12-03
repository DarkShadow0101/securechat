// client/src/contexts/AuthContext.js
import React, { useContext, useState, useEffect, createContext } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile,
} from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, setDoc } from "firebase/firestore";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const login = async (email, password) => {
    setError("");
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      if (!userCredential.user.emailVerified) {
        await signOut(auth);
        throw new Error("auth/email-not-verified");
      }
      return userCredential;
    } catch (err) {
      setError(err.message || err.code);
      throw err;
    }
  };

  const signup = async (email, password, name) => {
    setError("");
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await updateProfile(user, { displayName: name });

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: name,
        photoURL: "",
        preferences: { theme: "blue", wallpaper: "", backupFrequency: "off" },
      });

      await sendEmailVerification(user);
      return userCredential;
    } catch (err) {
      setError(err.message || err.code);
      throw err;
    }
  };

  const logout = () => signOut(auth);

  const sendVerificationEmail = async () => {
    setError("");
    try {
      if (auth.currentUser) await sendEmailVerification(auth.currentUser);
      else throw new Error("No authenticated user.");
    } catch (err) {
      setError(err.message || err.code);
      throw err;
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsub;
  }, []);

  const value = { currentUser, login, signup, logout, sendVerificationEmail, error, setError };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};
