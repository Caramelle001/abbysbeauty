// Cart lives in the customer's browser until they check out.
const KEY = "abbys_cart";

export function getCart() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}
export function saveCart(cart) {
  try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch {}
}
export function addToCart(item) {
  const cart = getCart();
  const i = cart.findIndex(x => x.id === item.id && x.size === item.size && x.color === item.color);
  if (i > -1) cart[i].qty = Math.min(cart[i].qty + item.qty, item.stock);
  else cart.push(item);
  saveCart(cart);
}
export const cartCount = () => getCart().reduce((n, x) => n + x.qty, 0);
