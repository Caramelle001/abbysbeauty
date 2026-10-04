import { signUp, logIn, logOut, watchUser } from "./auth.js";
import { store } from "./config.js";

const $ = (s) => document.querySelector(s);
const modal = $("#authModal");
const form = $("#authForm");
const msg = $("#authMsg");
let mode = "login";

function setMode(m) {
  mode = m;
  const login = m === "login";
  $("#nameField").hidden = login;
  $("#nameInput").required = !login;
  $("#authTitle").textContent = login ? "Welcome back" : "Create your account";
  $("#authSubmit").textContent = login ? "Log in" : "Sign up";
  $("#authSwitch").textContent = login ? "New here? Sign up" : "Have an account? Log in";
  msg.textContent = "";
}

function friendly(code = "") {
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Email or password is wrong. Check and try again.";
  if (code.includes("email-already-in-use")) return "That email already has an account. Log in instead.";
  if (code.includes("weak-password")) return "Use a password with at least 6 characters.";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("network")) return "No connection. Check your data and try again.";
  return "Something went wrong. Please try again.";
}

$("#openAuth").onclick = () => { setMode("login"); modal.showModal(); };
$("#closeAuth").onclick = () => modal.close();
$("#authSwitch").onclick = () => setMode(mode === "login" ? "signup" : "login");
$("#logoutBtn").onclick = logOut;

form.onsubmit = async (e) => {
  e.preventDefault();
  msg.textContent = "";
  const btn = $("#authSubmit");
  btn.disabled = true;
  try {
    const f = new FormData(form);
    const email = f.get("email").trim();
    const password = f.get("password");
    if (mode === "signup") {
      await signUp(f.get("name").trim(), email, password);
      modal.close();
    } else {
      const { admin } = await logIn(email, password);
      modal.close();
      if (admin) location.href = "admin.html"; // built in step 5
    }
    form.reset();
  } catch (err) {
    msg.textContent = friendly(err.code);
  } finally {
    btn.disabled = false;
  }
};

watchUser((user, admin) => {
  $("#openAuth").hidden = !!user;
  $("#userMenu").hidden = !user;
  if (user) {
    $("#hello").textContent = "Hi, " + (user.displayName || "there");
    $("#adminLink").hidden = !admin;
  }
});

$("#waLink").href = `https://wa.me/${store.whatsapp}`;

// Lets other pages send people straight to the login popup (index.html#login).
if (location.hash === "#login") { setMode("login"); modal.showModal(); }
