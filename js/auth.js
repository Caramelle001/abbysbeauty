import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, addDoc, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// A user is an admin only if a document exists at admins/{their uid}.
// Customers cannot create that document (see firestore.rules).
export async function checkAdmin(uid) {
  try { return (await getDoc(doc(db, "admins", uid))).exists(); }
  catch { return false; }
}

export async function signUp(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, "users", cred.user.uid), {
    name, email, createdAt: serverTimestamp()
  });
  return cred.user;
}

export async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const admin = await checkAdmin(cred.user.uid);
  // One record per login, used for the admin's daily login stats.
  await addDoc(collection(db, "logins"), {
    uid: cred.user.uid,
    email,
    role: admin ? "admin" : "customer",
    day: new Date().toLocaleDateString("en-CA"), // YYYY-MM-DD
    at: serverTimestamp()
  });
  return { user: cred.user, admin };
}

export const logOut = () => signOut(auth);

export function watchUser(callback) {
  onAuthStateChanged(auth, async (user) => {
    callback(user, user ? await checkAdmin(user.uid) : false);
  });
}
