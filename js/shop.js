import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { store } from "./config.js";
import { addToCart, cartCount } from "./cart.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => store.currency + Number(n).toLocaleString("en-NG");
// Ask Cloudinary for a smaller, optimised copy of each picture.
const img = (url, w = 500) =>
  url && url.includes("/upload/") ? url.replace("/upload/", `/upload/f_auto,q_auto,w_${w}/`) : (url || "");
const time = (p) => p.createdAt?.toMillis?.() ?? 0;
const priceOf = (p) => Number(p.salePrice || p.price || 0);
const inStock = (p) => Number(p.stock || 0) > 0;

let products = [];
let collections = [];
const state = { q: "", collection: "All", size: "", color: "", min: "", max: "", stock: "all", sort: "newest" };

/* ---------- load ---------- */
async function load() {
  try {
    const [p, c, a] = await Promise.all([
      getDocs(collection(db, "products")),
      getDocs(collection(db, "collections")),
      getDocs(collection(db, "ads"))
    ]);
    products = p.docs.map((d) => ({ id: d.id, ...d.data() }));
    collections = c.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
    const ads = a.docs.map((d) => d.data()).filter((x) => x.active !== false && x.image)
      .sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
    renderAds(ads);
    fillFilters();
    renderChips();
    render();
  } catch {
    renderAds([]);
    $("#grid").innerHTML = `<p class="empty">Couldn't load products. Check your connection and refresh.</p>`;
  }
}

/* ---------- ads board ---------- */
function renderAds(ads) {
  const board = $("#adsBoard");
  if (!ads.length) {
    board.innerHTML = `<div class="ad ad-default"><div><h2>Perfumes, our main sale</h2><p>New arrivals and offers land here first.</p></div></div>`;
    return;
  }
  board.innerHTML = ads.map((a) => {
    const inner = `<img src="${esc(img(a.image, 1000))}" alt="${esc(a.title || "Offer")}" loading="lazy">` +
      (a.title ? `<span class="ad-title">${esc(a.title)}</span>` : "");
    return /^https?:\/\//.test(a.link || "")
      ? `<a class="ad" href="${esc(a.link)}" target="_blank" rel="noopener">${inner}</a>`
      : `<div class="ad">${inner}</div>`;
  }).join("");
  if (ads.length > 1) {
    let paused = false;
    board.addEventListener("pointerdown", () => (paused = true));
    board.addEventListener("pointerup", () => setTimeout(() => (paused = false), 4000));
    setInterval(() => {
      if (paused || document.hidden) return;
      const end = board.scrollLeft + board.clientWidth >= board.scrollWidth - 4;
      board.scrollTo({ left: end ? 0 : board.scrollLeft + board.clientWidth, behavior: "smooth" });
    }, 4500);
  }
}

/* ---------- filters ---------- */
function fillFilters() {
  const uniq = (key) => [...new Set(products.flatMap((p) => p[key] || []))].sort();
  $("#fSize").innerHTML += uniq("sizes").map((s) => `<option>${esc(s)}</option>`).join("");
  $("#fColor").innerHTML += uniq("colors").map((s) => `<option>${esc(s)}</option>`).join("");
}
function renderChips() {
  const names = ["All", ...collections.map((c) => c.name)];
  $("#collections").innerHTML = names.map((n) =>
    `<button type="button" class="chip" data-c="${esc(n)}" aria-pressed="${n === state.collection}">${esc(n)}</button>`).join("");
}
function visible() {
  const q = state.q.trim().toLowerCase();
  const list = products.filter((p) => {
    if (state.collection !== "All" && p.collection !== state.collection) return false;
    if (q && !`${p.name} ${p.collection} ${p.description || ""}`.toLowerCase().includes(q)) return false;
    if (state.size && !(p.sizes || []).includes(state.size)) return false;
    if (state.color && !(p.colors || []).includes(state.color)) return false;
    if (state.min !== "" && priceOf(p) < +state.min) return false;
    if (state.max !== "" && priceOf(p) > +state.max) return false;
    if (state.stock === "in" && !inStock(p)) return false;
    if (state.stock === "out" && inStock(p)) return false;
    return true;
  });
  const sorts = {
    newest: (a, b) => time(b) - time(a),
    oldest: (a, b) => time(a) - time(b),
    low: (a, b) => priceOf(a) - priceOf(b),
    high: (a, b) => priceOf(b) - priceOf(a)
  };
  return list.sort(sorts[state.sort]);
}

/* ---------- shelf ---------- */
function render() {
  const list = visible();
  $("#resultCount").textContent = `${list.length} ${list.length === 1 ? "item" : "items"}`;
  if (!list.length) {
    $("#grid").innerHTML = `<p class="empty">${products.length ? "Nothing matches. Try clearing a filter." : "No products yet. Check back soon."}</p>`;
    return;
  }
  $("#grid").innerHTML = list.map((p) => {
    const sale = p.salePrice && p.salePrice < p.price;
    const badge = !inStock(p) ? "Sold out" : p.tag === "combo" ? "Combo" : sale ? "Discount" : p.tag === "special" ? "Special" : "";
    return `<button type="button" class="card${inStock(p) ? "" : " is-out"}" data-id="${esc(p.id)}">
      <span class="card-img"><img src="${esc(img(p.images?.[0]))}" alt="${esc(p.name)}" loading="lazy">${badge ? `<span class="badge">${badge}</span>` : ""}</span>
      <span class="card-name">${esc(p.name)}</span>
      <span class="card-price">${money(priceOf(p))}${sale ? ` <s>${money(p.price)}</s>` : ""}</span>
    </button>`;
  }).join("");
}

/* ---------- product popup ---------- */
function openProduct(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  const ok = inStock(p);
  const sale = p.salePrice && p.salePrice < p.price;
  const pics = (p.images || []).slice(0, 5);
  const opts = (arr) => arr.map((v) => `<option>${esc(v)}</option>`).join("");
  $("#productBody").innerHTML = `
    <img id="pmMain" class="pm-main" src="${esc(img(pics[0], 800))}" alt="${esc(p.name)}">
    ${pics.length > 1 ? `<div class="pm-thumbs">${pics.map((u) => `<img src="${esc(img(u, 120))}" data-big="${esc(img(u, 800))}" alt="">`).join("")}</div>` : ""}
    <h2>${esc(p.name)}</h2>
    <p class="card-price">${money(priceOf(p))}${sale ? ` <s>${money(p.price)}</s>` : ""}</p>
    ${p.description ? `<p>${esc(p.description)}</p>` : ""}
    <p class="stock">${ok ? (p.stock <= 5 ? `Only ${p.stock} left` : "In stock") : "Sold out"}</p>
    ${ok ? `<form id="addForm">
      ${p.sizes?.length ? `<label>Size <select name="size" required><option value="">Choose size</option>${opts(p.sizes)}</select></label>` : ""}
      ${p.colors?.length ? `<label>Colour <select name="color" required><option value="">Choose colour</option>${opts(p.colors)}</select></label>` : ""}
      <label>Quantity <input name="qty" type="number" min="1" max="${p.stock}" value="1" required></label>
      <button class="btn btn-solid" type="submit">Add to cart</button>
    </form>` : ""}
    <button class="link" id="closeProduct" type="button">Close</button>`;
  $("#productModal").showModal();
  $("#closeProduct").onclick = () => $("#productModal").close();
  document.querySelectorAll(".pm-thumbs img").forEach((t) =>
    (t.onclick = () => ($("#pmMain").src = t.dataset.big)));
  const form = $("#addForm");
  if (form) form.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(form);
    addToCart({
      id: p.id, name: p.name, price: priceOf(p), image: img(pics[0], 200),
      size: f.get("size") || "", color: f.get("color") || "",
      qty: Math.min(Math.max(1, +f.get("qty")), p.stock), stock: p.stock
    });
    $("#cartCount").textContent = cartCount();
    $("#productModal").close();
    toast(`${p.name} added to cart`);
  };
}
function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

/* ---------- events ---------- */
$("#q").oninput = (e) => { state.q = e.target.value; render(); };
$("#fSize").onchange = (e) => { state.size = e.target.value; render(); };
$("#fColor").onchange = (e) => { state.color = e.target.value; render(); };
$("#fMin").oninput = (e) => { state.min = e.target.value; render(); };
$("#fMax").oninput = (e) => { state.max = e.target.value; render(); };
$("#fStock").onchange = (e) => { state.stock = e.target.value; render(); };
$("#fSort").onchange = (e) => { state.sort = e.target.value; render(); };
$("#clearFilters").onclick = () => {
  Object.assign(state, { q: "", size: "", color: "", min: "", max: "", stock: "all", sort: "newest" });
  $("#q").value = $("#fSize").value = $("#fColor").value = $("#fMin").value = $("#fMax").value = "";
  $("#fStock").value = "all";
  $("#fSort").value = "newest";
  render();
};
$("#collections").onclick = (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  state.collection = b.dataset.c;
  renderChips();
  render();
};
$("#grid").onclick = (e) => {
  const c = e.target.closest(".card");
  if (c) openProduct(c.dataset.id);
};

$("#cartCount").textContent = cartCount();
load();
