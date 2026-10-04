import { db } from "./firebase.js";
import {
  collection, getDocs, getCountFromServer, query, where, orderBy, limit,
  doc, addDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { store } from "./config.js";
import { upload } from "./cloudinary.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => store.currency + Number(n).toLocaleString("en-NG");
const thumb = (url, w = 120) => url && url.includes("/upload/") ? url.replace("/upload/", `/upload/f_auto,q_auto,w_${w}/`) : (url || "");
const fail = (el, text = "Couldn't load this. Refresh and try again.") => (el.innerHTML = `<p class="empty">${text}</p>`);
function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

export function init() {
  loadOverview();
  loadOrders();
  loadAds();
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.tab === "overview") loadOverview();
    if (b.dataset.tab === "orders") loadOrders();
  }));
}

/* ---------- overview ---------- */
async function loadOverview() {
  try {
    const days = [...Array(7)].map((_, k) => {
      const d = new Date();
      d.setDate(d.getDate() - k);
      return d.toLocaleDateString("en-CA");
    });
    const today = days[0];
    const [lg, od, pr, users, pend] = await Promise.all([
      getDocs(query(collection(db, "logins"), where("day", ">=", days[6]))),
      getDocs(query(collection(db, "orders"), where("day", ">=", days[6]))),
      getDocs(collection(db, "products")),
      getCountFromServer(collection(db, "users")),
      getCountFromServer(query(collection(db, "orders"), where("status", "==", "pending")))
    ]);
    const logins = lg.docs.map((d) => d.data()).filter((x) => x.role !== "admin");
    const orders = od.docs.map((d) => d.data());
    const products = pr.docs.map((d) => ({ id: d.id, ...d.data() }));

    const loginsToday = logins.filter((x) => x.day === today);
    const ordersToday = orders.filter((x) => x.day === today);
    const sales = ordersToday.filter((x) => x.status === "confirmed" || x.status === "delivered")
      .reduce((n, x) => n + x.total, 0);
    const soldOut = products.filter((p) => !Number(p.stock)).length;
    const low = products.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= 5).length;

    const cards = [
      [loginsToday.length, "Customer logins today"],
      [new Set(loginsToday.map((x) => x.uid)).size, "Different customers today"],
      [ordersToday.length, "Orders today"],
      [money(sales), "Confirmed sales today"],
      [pend.data().count, "Orders waiting for payment check"],
      [users.data().count, "Registered customers"],
      [soldOut, "Products sold out"],
      [low, "Products running low"]
    ];
    $("#stats").innerHTML = cards.map(([v, l]) => `<div class="stat"><strong>${v}</strong><span>${l}</span></div>`).join("");

    $("#week").innerHTML = `<table><thead><tr><th>Day</th><th>Customer logins</th><th>Orders</th></tr></thead><tbody>` +
      days.map((d) => {
        const label = new Date(d + "T12:00:00").toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });
        return `<tr><td>${label}</td><td>${logins.filter((x) => x.day === d).length}</td><td>${orders.filter((x) => x.day === d).length}</td></tr>`;
      }).join("") + `</tbody></table>`;

    const needs = products.filter((p) => Number(p.stock || 0) <= 5).sort((a, b) => (a.stock || 0) - (b.stock || 0));
    $("#lowStock").innerHTML = needs.length
      ? needs.map((p) => `<div class="prow"><strong>${esc(p.name)}</strong><span class="warn">${Number(p.stock) ? p.stock + " left" : "Sold out"}</span></div>`).join("")
      : `<p class="empty">Every product has more than 5 in stock.</p>`;

    const badge = $("#pendingBadge");
    badge.textContent = pend.data().count;
    badge.hidden = !pend.data().count;
  } catch {
    fail($("#stats"));
  }
}

/* ---------- orders ---------- */
let orders = [];
let filter = "pending";
const phoneIntl = (p) => {
  const d = String(p).replace(/\D/g, "");
  return d.startsWith("0") ? "234" + d.slice(1) : d;
};

async function loadOrders() {
  try {
    const snap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(200)));
    orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderOrders();
  } catch {
    fail($("#orderList"));
  }
}
function renderOrders() {
  document.querySelectorAll("#orderFilters [data-f]").forEach((b) =>
    b.setAttribute("aria-pressed", b.dataset.f === filter));
  const list = orders.filter((o) => filter === "all" || o.status === filter);
  if (!list.length) {
    $("#orderList").innerHTML = `<p class="empty">No ${filter === "all" ? "" : filter + " "}orders.</p>`;
    return;
  }
  $("#orderList").innerHTML = list.map((o) => {
    const when = o.createdAt?.toDate?.().toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) || "";
    const actions = o.status === "pending"
      ? `<button class="btn btn-solid" data-act="confirm" data-id="${esc(o.id)}" type="button">Confirm payment</button>
         <button class="link" data-act="cancel" data-id="${esc(o.id)}" type="button">Cancel order</button>`
      : o.status === "confirmed"
        ? `<button class="btn btn-solid" data-act="deliver" data-id="${esc(o.id)}" type="button">Mark as delivered</button>`
        : "";
    return `<article class="order">
      <header><strong>#${esc(o.code)}</strong><span class="st st-${esc(o.status)}">${esc(o.status)}</span><time>${esc(when)}</time></header>
      <p><strong>${esc(o.customerName)}</strong><br>
        <a href="tel:${esc(String(o.phone).replace(/\s/g, ""))}">${esc(o.phone)}</a>,
        <a href="https://wa.me/${esc(phoneIntl(o.phone))}" target="_blank" rel="noopener">WhatsApp</a><br>
        ${esc(o.email)}<br>${esc(o.address)}${o.note ? `<br>Note: ${esc(o.note)}` : ""}</p>
      <ul>${o.items.map((i) => `<li>${esc(i.name)}${i.size ? ", " + esc(i.size) : ""}${i.color ? ", " + esc(i.color) : ""}, x${i.qty} (${money(i.price * i.qty)})</li>`).join("")}</ul>
      <p class="order-total">Total ${money(o.total)}</p>
      <div class="order-actions">${actions}</div>
    </article>`;
  }).join("");
}
$("#orderFilters").onclick = (e) => {
  const b = e.target.closest("[data-f]");
  if (!b) return;
  filter = b.dataset.f;
  renderOrders();
};
$("#orderList").onclick = async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const o = orders.find((x) => x.id === b.dataset.id);
  if (!o) return;
  b.disabled = true;
  try {
    if (b.dataset.act === "confirm") {
      await confirmPayment(o);
      toast("Payment confirmed and stock updated");
    } else if (b.dataset.act === "deliver") {
      await updateDoc(doc(db, "orders", o.id), { status: "delivered", deliveredAt: serverTimestamp() });
      toast("Marked as delivered");
    } else if (b.dataset.act === "cancel") {
      if (!confirm("Cancel this order?")) { b.disabled = false; return; }
      await updateDoc(doc(db, "orders", o.id), { status: "cancelled" });
      toast("Order cancelled");
    }
    await loadOrders();
    loadOverview();
  } catch (err) {
    b.disabled = false;
    toast(err.user || "Couldn't update the order. Try again.");
  }
};

// Confirms an order and takes the items out of stock in one safe step.
async function confirmPayment(o) {
  const need = {};
  o.items.forEach((i) => (need[i.id] = (need[i.id] || 0) + i.qty));
  await runTransaction(db, async (tx) => {
    const oref = doc(db, "orders", o.id);
    const os = await tx.get(oref);
    if (os.data().status !== "pending") throw { user: "This order was already handled." };
    const ids = Object.keys(need);
    const refs = ids.map((id) => doc(db, "products", id));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    snaps.forEach((s, k) => {
      const have = s.exists() ? Number(s.data().stock || 0) : 0;
      if (have < need[ids[k]]) throw { user: `Not enough stock left for ${s.exists() ? s.data().name : "a product"}. Update stock first.` };
    });
    snaps.forEach((s, k) => tx.update(refs[k], { stock: Number(s.data().stock) - need[ids[k]] }));
    tx.update(oref, { status: "confirmed", confirmedAt: serverTimestamp() });
  });
}

/* ---------- ads board ---------- */
let ads = [];
async function loadAds() {
  try {
    const snap = await getDocs(collection(db, "ads"));
    ads = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    $("#aList").innerHTML = ads.length ? ads.map((a) => `
      <div class="prow">
        <img src="${esc(thumb(a.image))}" alt="">
        <div class="prow-info"><strong>${esc(a.title || "No title")}</strong><span>${a.active === false ? "Hidden" : "Showing"}</span></div>
        <div class="prow-actions">
          <button class="link" data-toggle="${esc(a.id)}" type="button">${a.active === false ? "Show" : "Hide"}</button>
          <button class="link" data-dela="${esc(a.id)}" type="button">Delete</button>
        </div>
      </div>`).join("") : `<p class="empty">No ads yet. The shop shows a default banner until you add one.</p>`;
  } catch {
    fail($("#aList"));
  }
}
$("#aForm").onsubmit = async (e) => {
  e.preventDefault();
  const msg = $("#aMsg");
  const btn = $("#aSave");
  const link = $("#aLink").value.trim();
  msg.textContent = "";
  if (link && !/^https?:\/\//.test(link)) { msg.textContent = "The link must start with http:// or https://"; return; }
  btn.disabled = true;
  btn.textContent = "Uploading";
  try {
    const image = await upload($("#aImage").files[0]);
    await addDoc(collection(db, "ads"), { image, title: $("#aTitle").value.trim(), link, active: true, order: ads.length });
    e.target.reset();
    await loadAds();
    toast("Ad added to the board");
  } catch (err) {
    msg.textContent = err.user || "Couldn't save the ad. Check your connection and try again.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Add ad";
  }
};
$("#aList").onclick = async (e) => {
  const t = e.target.closest("[data-toggle]");
  const d = e.target.closest("[data-dela]");
  if (t) {
    const a = ads.find((x) => x.id === t.dataset.toggle);
    await updateDoc(doc(db, "ads", a.id), { active: a.active === false });
    await loadAds();
  }
  if (d && confirm("Delete this ad?")) {
    await deleteDoc(doc(db, "ads", d.dataset.dela));
    await loadAds();
  }
};
  
