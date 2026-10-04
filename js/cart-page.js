import { getCart, saveCart } from "./cart.js";
import { watchUser } from "./auth.js";
import { db } from "./firebase.js";
import { doc, getDoc, setDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { store } from "./config.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => store.currency + Number(n).toLocaleString("en-NG");

let user = null;
$("#waLink").href = `https://wa.me/${store.whatsapp}`;

/* ---------- cart list ---------- */
function render() {
  const cart = getCart();
  if (!cart.length) {
    $("#cartItems").innerHTML = `<p class="empty">Your cart is empty. <a href="index.html">Start shopping</a></p>`;
    $("#summary").hidden = true;
    $("#checkout").hidden = true;
    $("#loginPrompt").hidden = true;
    return;
  }
  $("#cartItems").innerHTML = cart.map((x, i) => `
    <div class="line">
      <img src="${esc(x.image)}" alt="">
      <div class="line-info">
        <strong>${esc(x.name)}</strong>
        <span>${[x.size, x.color].filter(Boolean).map(esc).join(", ")}</span>
        <span class="card-price">${money(x.price)}</span>
        <button class="link" data-rm="${i}" type="button">Remove</button>
      </div>
      <div class="qty">
        <button data-i="${i}" data-d="-1" type="button" aria-label="Decrease quantity">−</button>
        <span>${x.qty}</span>
        <button data-i="${i}" data-d="1" type="button" aria-label="Increase quantity">+</button>
      </div>
    </div>`).join("");
  $("#total").textContent = money(cart.reduce((n, x) => n + x.price * x.qty, 0));
  $("#summary").hidden = false;
  $("#checkout").hidden = !user;
  $("#loginPrompt").hidden = !!user;
}

$("#cartItems").onclick = (e) => {
  const cart = getCart();
  const rm = e.target.closest("[data-rm]");
  const step = e.target.closest("[data-d]");
  if (rm) cart.splice(+rm.dataset.rm, 1);
  else if (step) {
    const x = cart[+step.dataset.i];
    x.qty = Math.min(Math.max(1, x.qty + +step.dataset.d), x.stock || 99);
  } else return;
  saveCart(cart);
  render();
};

/* ---------- place order ---------- */
$("#checkout").onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = $("#orderMsg");
  const btn = $("#placeOrder");
  msg.textContent = "";
  btn.disabled = true;
  try {
    const f = new FormData(form);
    const items = [];
    let total = 0;
    // Prices and stock are re-checked against the shop, not the browser's copy.
    for (const x of getCart()) {
      const snap = await getDoc(doc(db, "products", x.id));
      if (!snap.exists()) throw { user: `${x.name} is no longer available. Remove it from your cart.` };
      const p = snap.data();
      const stock = Number(p.stock || 0);
      if (stock < x.qty) throw { user: stock ? `Only ${stock} of ${x.name} left. Lower the quantity.` : `${x.name} is sold out. Remove it from your cart.` };
      const price = Number(p.salePrice || p.price);
      items.push({ id: x.id, name: p.name, price, qty: x.qty, size: x.size, color: x.color, image: x.image });
      total += price * x.qty;
    }
    const ref = doc(collection(db, "orders"));
    const code = ref.id.slice(0, 6).toUpperCase();
    const name = f.get("name").trim();
    await setDoc(ref, {
      code, uid: user.uid, email: user.email, customerName: name,
      phone: f.get("phone").trim(), address: f.get("address").trim(), note: f.get("note").trim(),
      items, total, status: "pending",
      day: new Date().toLocaleDateString("en-CA"),
      createdAt: serverTimestamp()
    });
    saveCart([]);
    showPayment(code, total, items, name);
  } catch (err) {
    msg.textContent = err.user || "Couldn't place your order. Check your connection and try again.";
  } finally {
    btn.disabled = false;
  }
};

/* ---------- payment ---------- */
function showPayment(code, total, items, name) {
  const lines = items.map((i) => `- ${i.name}${i.size ? ", " + i.size : ""}${i.color ? ", " + i.color : ""} x${i.qty}`).join("\n");
  const text = `Hello ${store.name}, I'm ${name}.\nOrder ${code}, total ${money(total)}.\n${lines}\nI'm sending my payment receipt now.`;
  $("#cartView").hidden = true;
  const box = $("#payment");
  box.hidden = false;
  box.innerHTML = `
    <h1>Order ${esc(code)} placed</h1>
    <p>Transfer <strong>${money(total)}</strong> to this account:</p>
    <div class="bank">
      <span>${esc(store.bank.name)}</span>
      <strong id="acct">${esc(store.bank.number)}</strong>
      <span>${esc(store.bank.accountName)}</span>
      <button id="copyAcct" class="btn btn-ghost-dark" type="button">Copy account number</button>
    </div>
    <ol class="steps">
      <li>Transfer the exact amount.</li>
      <li>Take a screenshot of the receipt.</li>
      <li>Send it to us on WhatsApp with the button below.</li>
    </ol>
    <a class="btn btn-solid" target="_blank" rel="noopener"
       href="https://wa.me/${store.whatsapp}?text=${encodeURIComponent(text)}">Send receipt on WhatsApp</a>
    <p class="note">We confirm your order once we see your payment.</p>
    <a class="link" href="index.html">Back to shop</a>`;
  $("#copyAcct").onclick = async (e) => {
    try { await navigator.clipboard.writeText(store.bank.number); e.target.textContent = "Copied"; }
    catch { e.target.textContent = "Press and hold the number to copy"; }
  };
  window.scrollTo(0, 0);
}

watchUser((u) => {
  user = u;
  if (u && !$("#cName").value) $("#cName").value = u.displayName || "";
  render();
});
render();
