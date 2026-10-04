import { watchUser, logOut } from "./auth.js";
import { db } from "./firebase.js";
import {
  collection, getDocs, addDoc, doc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { store } from "./config.js";
import { upload } from "./cloudinary.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => store.currency + Number(n).toLocaleString("en-NG");
const thumb = (url, w = 120) => url && url.includes("/upload/") ? url.replace("/upload/", `/upload/f_auto,q_auto,w_${w}/`) : (url || "");
const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

let collections = [];
let products = [];
let editing = null;       // id of the product being edited
let existingImages = [];  // pictures already saved on that product
let started = false;

/* ---------- gate: only admins get in ---------- */
watchUser((user, admin) => {
  $("#gate").hidden = admin;
  $("#adminApp").hidden = !admin;
  $("#adminLogout").hidden = !user;
  if (admin) {
    if (!started) { started = true; start(); }
    return;
  }
  $("#gateMsg").innerHTML = user
    ? "This page is for the store admin only."
    : `Log in with the admin account to continue. <a href="index.html#login">Log in</a>`;
});
$("#adminLogout").onclick = async () => { await logOut(); location.href = "index.html"; };

/* ---------- tabs ---------- */
document.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
function showTab(t) {
  document.querySelectorAll(".tab").forEach((s) => (s.hidden = s.id !== "tab-" + t));
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tab === t));
}
function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

async function start() {
  await loadCollections();
  await loadProducts();
  import("./admin-dash.js").then((m) => m.init());
}

/* ---------- collections ---------- */
async function loadCollections() {
  const snap = await getDocs(collection(db, "collections"));
  collections = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  $("#pCollection").innerHTML = `<option value="">Choose collection</option>` +
    collections.map((c) => `<option>${esc(c.name)}</option>`).join("");
  $("#cList").innerHTML = collections.length
    ? collections.map((c) => `<div class="prow"><strong>${esc(c.name)}</strong><button class="link" data-delc="${esc(c.id)}" type="button">Delete</button></div>`).join("")
    : `<p class="empty">No collections yet. Add one before adding products.</p>`;
}
$("#cForm").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("#cInput").value.trim();
  if (!name) return;
  if (collections.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    $("#cMsg").textContent = "That collection already exists.";
    return;
  }
  $("#cMsg").textContent = "";
  await addDoc(collection(db, "collections"), { name, order: collections.length });
  $("#cInput").value = "";
  await loadCollections();
  toast("Collection added");
};
$("#cList").onclick = async (e) => {
  const b = e.target.closest("[data-delc]");
  if (!b || !confirm("Delete this collection? Products inside it stay on the shelf but lose their collection.")) return;
  await deleteDoc(doc(db, "collections", b.dataset.delc));
  await loadCollections();
};

/* ---------- products: list ---------- */
async function loadProducts() {
  const snap = await getDocs(collection(db, "products"));
  products = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  renderProducts();
}
function renderProducts() {
  $("#pList").innerHTML = products.length ? products.map((p) => {
    const stock = Number(p.stock || 0);
    const note = stock === 0 ? "Sold out" : stock <= 5 ? "Running low" : "";
    return `<div class="prow">
      <img src="${esc(thumb(p.images?.[0]))}" alt="">
      <div class="prow-info">
        <strong>${esc(p.name)}</strong>
        <span>${esc(p.collection || "No collection")}, ${money(p.salePrice || p.price)}${p.salePrice ? " (discount)" : ""}</span>
        ${note ? `<span class="warn">${note}</span>` : ""}
      </div>
      <label class="stockbox">Left
        <input type="number" min="0" value="${stock}" data-stock="${esc(p.id)}" inputmode="numeric">
      </label>
      <div class="prow-actions">
        <button class="link" data-edit="${esc(p.id)}" type="button">Edit</button>
        <button class="link" data-del="${esc(p.id)}" type="button">Delete</button>
      </div>
    </div>`;
  }).join("") : `<p class="empty">No products yet. Use the form above to add the first one.</p>`;
}
$("#pList").onchange = async (e) => {
  const i = e.target.closest("[data-stock]");
  if (!i) return;
  const stock = Math.max(0, Math.floor(+i.value || 0));
  await updateDoc(doc(db, "products", i.dataset.stock), { stock });
  const p = products.find((x) => x.id === i.dataset.stock);
  if (p) p.stock = stock;
  renderProducts();
  toast("Stock updated");
};
$("#pList").onclick = async (e) => {
  const ed = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-del]");
  if (ed) startEdit(ed.dataset.edit);
  if (del && confirm("Delete this product from the shelf?")) {
    await deleteDoc(doc(db, "products", del.dataset.del));
    await loadProducts();
    toast("Product deleted");
  }
};

/* ---------- products: form ---------- */
function renderPreview() {
  $("#imgPreview").innerHTML = existingImages.map((u, i) =>
    `<span class="pv"><img src="${esc(thumb(u))}" alt=""><button type="button" data-rmimg="${i}" aria-label="Remove picture">×</button></span>`).join("");
}
$("#imgPreview").onclick = (e) => {
  const b = e.target.closest("[data-rmimg]");
  if (!b) return;
  existingImages.splice(+b.dataset.rmimg, 1);
  renderPreview();
};
function resetForm() {
  $("#pForm").reset();
  editing = null;
  existingImages = [];
  renderPreview();
  $("#pFormTitle").textContent = "Add a product";
  $("#pSave").textContent = "Add product";
  $("#pCancel").hidden = true;
  $("#pMsg").textContent = "";
}
function startEdit(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  editing = id;
  existingImages = [...(p.images || [])];
  $("#pName").value = p.name || "";
  $("#pCollection").value = p.collection || "";
  $("#pPrice").value = p.price ?? "";
  $("#pSale").value = p.salePrice ?? "";
  $("#pStock").value = p.stock ?? 0;
  $("#pTag").value = p.tag || "";
  $("#pSizes").value = (p.sizes || []).join(", ");
  $("#pColors").value = (p.colors || []).join(", ");
  $("#pDesc").value = p.description || "";
  $("#pImages").value = "";
  renderPreview();
  $("#pFormTitle").textContent = "Edit product";
  $("#pSave").textContent = "Save changes";
  $("#pCancel").hidden = false;
  $("#pForm").scrollIntoView({ behavior: "smooth" });
}
$("#pCancel").onclick = resetForm;

$("#pForm").onsubmit = async (e) => {
  e.preventDefault();
  const msg = $("#pMsg");
  const btn = $("#pSave");
  msg.textContent = "";
  btn.disabled = true;
  try {
    const price = +$("#pPrice").value;
    const sale = $("#pSale").value === "" ? null : +$("#pSale").value;
    if (sale !== null && sale >= price) throw { user: "The discount price must be lower than the normal price." };
    const files = [...$("#pImages").files];
    if (existingImages.length + files.length > 5) throw { user: "You can have up to 5 pictures per product." };
    if (!existingImages.length && !files.length) throw { user: "Add at least one picture." };

    const urls = [];
    for (let i = 0; i < files.length; i++) {
      btn.textContent = `Uploading picture ${i + 1} of ${files.length}`;
      urls.push(await upload(files[i]));
    }
    btn.textContent = "Saving";
    const data = {
      name: $("#pName").value.trim(),
      collection: $("#pCollection").value,
      price, salePrice: sale,
      stock: Math.max(0, Math.floor(+$("#pStock").value)),
      tag: $("#pTag").value,
      sizes: list($("#pSizes").value),
      colors: list($("#pColors").value),
      description: $("#pDesc").value.trim(),
      images: [...existingImages, ...urls]
    };
    if (editing) await updateDoc(doc(db, "products", editing), data);
    else await addDoc(collection(db, "products"), { ...data, createdAt: serverTimestamp() });
    const wasEdit = !!editing;
    resetForm();
    await loadProducts();
    toast(wasEdit ? "Changes saved" : "Product added to the shelf");
  } catch (err) {
    msg.textContent = err.user || "Couldn't save the product. Check your connection and try again.";
  } finally {
    btn.disabled = false;
    btn.textContent = editing ? "Save changes" : "Add product";
  }
};
