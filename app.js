import { CONFIG } from './config.js?v=20261105225018';
import {
  parseCSV, rowsToItems, buildProducts, categories, filterProducts, sizeGroups, formatPrice, orderText,
} from './catalog.js?v=20261105225018';

const tg = window.Telegram?.WebApp;
const inTelegram = Boolean(tg?.initData);
const $app = document.getElementById('app');
const $bottom = document.getElementById('bottom');
const $btn = document.getElementById('bottom-btn');

let products = [];
let stack = [{ v: 'home' }];
const filters = { brands: new Set(), sizes: new Set(), query: '' };
let selectedSize = null;
let cart = loadCart();
let bottomAction = null;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const img = name => /^https?:\/\//.test(name) ? name : `${CONFIG.imgBase}${name}?v=${CONFIG.version}`;
const photo = p => p.photos[0] ? `<img src="${esc(img(p.photos[0]))}" alt="" loading="lazy">` : '';

function loadCart() {
  try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; }
}
function saveCart() { localStorage.setItem('cart', JSON.stringify(cart)); }

function findVariant(id) {
  for (const p of products) {
    const v = p.variants.find(x => x.id === id);
    if (v) return { p, v };
  }
  return null;
}
function cartLines() { return cart.map(findVariant).filter(Boolean); }
const cartTotal = () => cartLines().reduce((s, { v }) => s + v.price, 0);

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function go(view) { stack.push(view); selectedSize = null; render(); window.scrollTo(0, 0); }
function back() { if (stack.length > 1) { stack.pop(); render(); window.scrollTo(0, 0); } }

function setBottom(label, action, disabled = false) {
  if (!label) { $bottom.hidden = true; bottomAction = null; return; }
  $bottom.hidden = false; $btn.textContent = label; $btn.disabled = disabled; bottomAction = action;
}
$btn.addEventListener('click', () => bottomAction && bottomAction());

function cartBottom() {
  if (cart.length) setBottom(`Корзина · ${cart.length} · ${formatPrice(cartTotal())}`, () => go({ v: 'cart' }));
  else setBottom(null);
}

const backLink = () => (!inTelegram && stack.length > 1) ? '<button class="back" data-act="back">‹ Назад</button>' : '';
const topbar = (placeholder) => `<div class="topbar">
    <input class="search" type="search" placeholder="${placeholder}" value="${esc(filters.query)}" data-act="search">
    <button class="cart-ico" data-act="cart">${BAG_ICON}${cart.length ? `<i>${cart.length}</i>` : ''}</button></div>`;

// Иконки категорий в стиле Lucide (футболка — Lucide shirt, ISC); категория без иконки показывается словом.
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
  stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
// Пакет корзины — Lucide shopping-bag (ISC).
const BAG_ICON = svg('<path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667'
  + 'A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/><path d="M3.103 6.034h17.794"/><path d="M16 10a4 4 0 0 1-8 0"/>');
const CAT_ICONS = {
  'обувь': svg('<path d="M2 16v-4a1 1 0 0 1 1-1h1.5l2-4.5h3.5l1 2.5c1.5 1.2 4 1.8 6.5 2.3 2.5.5 4.5 1.7 4.5 3.7v1z"/>'
    + '<path d="M2 16h20v1.5a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 17.5z"/><path d="m9 9.5-1 1.5M11.5 10.5l-1 1.5"/>'),
  'футболки': svg('<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10'
    + 'c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>'),
  'толстовки': svg('<path d="M8.5 4.5 4.6 6a2 2 0 0 0-1.2 1.6L2.5 19h3l.7-8.5V22h11.6V10.5l.7 8.5h3l-.9-11.4'
    + 'a2 2 0 0 0-1.2-1.6l-3.9-1.5"/><path d="M8.5 4.5a3.5 3.5 0 0 1 7 0V7a3.5 3.5 0 0 1-7 0z"/>'
    + '<path d="M10.5 10.5v2M13.5 10.5v2M9 17.5h6"/>'),
};

function viewHome() {
  const cats = categories(products);
  const face = name => CAT_ICONS[name.toLowerCase()] || esc(name.toUpperCase());
  const tile = c => `<button class="tile all cat" data-act="cat" data-cat="${esc(c.name)}">${face(c.name)}
      <span class="cnt">${c.count}</span><span class="lbl">${esc(c.name)}</span></button>`;
  $app.innerHTML = `${topbar('Поиск по названию или бренду')}
    <div class="banner"><b>Всё в наличии на складе в Махачкале</b>
      <span>Под заказ доступны любые вещи — напишите нам в сообщения канала</span></div>
    <div class="tiles">
      <button class="tile all" data-act="cat" data-cat="">NEW<span class="cnt">${products.length}</span><span class="lbl">Новинки</span></button>
      ${cats.map(tile).join('')}
    </div>`;
  cartBottom();
}

function viewList({ category }) {
  const inCat = products.filter(p => !category || p.category === category);
  const brands = [...new Set(inCat.map(p => p.brand).filter(Boolean))].sort();
  const groups = sizeGroups(products, { category, ...filters });
  const sizeCount = groups.reduce((n, g) => n + g.sizes.length, 0);
  const list = filterProducts(products, { category, ...filters });
  const chip = (kind, value, set) => `<button class="chip ${set.has(value) ? 'on' : ''}" data-act="${kind}" data-val="${esc(value)}">${esc(value)}</button>`;
  const sizeChip = ({ size, label, count }) => `<button class="chip ${filters.sizes.has(size) ? 'on' : ''}" data-act="size"
      data-val="${esc(size)}">${esc(label)}<span class="n">${count}</span></button>`;
  const card = p => `<button class="card" data-act="product" data-key="${esc(p.key)}">
      <div class="ph">${photo(p)}</div><div class="name">${esc(p.name)}</div>
      <div class="sizes">Размеры: ${p.variants.map(v => esc(v.size)).join(' / ')}</div>
      <div class="price">${formatPrice(p.minPrice)}</div></button>`;
  $app.innerHTML = `${backLink()}${topbar('Поиск')}
    ${brands.length > 1 ? `<div class="chips-label">Бренд</div><div class="chips">${brands.map(b => chip('brand', b, filters.brands)).join('')}</div>` : ''}
    ${sizeCount > 1 || filters.sizes.size ? groups.map(g => `<div class="chips-label">${groups.length > 1 ? `Размер · ${g.label}` : 'Размер'}</div>
      <div class="chips wrap">${g.sizes.map(sizeChip).join('')}</div>`).join('') : ''}
    <div class="head"><b>${esc(category || (filters.query.trim() ? 'Все товары' : 'Новинки'))}</b><span class="muted">${list.length} шт.</span></div>
    ${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : '<div class="empty">Ничего не нашлось — сбросьте фильтры</div>'}`;
  cartBottom();
}

function viewProduct({ key }) {
  const p = products.find(x => x.key === key);
  if (!p) { $app.innerHTML = `${backLink()}<div class="state">Этого товара уже нет в наличии</div>`; setBottom(null); return; }
  if (p.variants.length === 1) selectedSize = p.variants[0].id;
  const v = p.variants.find(x => x.id === selectedSize);
  $app.innerHTML = `${backLink()}
    <div class="gallery" data-gallery>${p.photos.map(n => `<img src="${esc(img(n))}" alt="">`).join('')}</div>
    ${p.photos.length > 1 ? `<div class="dots">${p.photos.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
    <div class="brand">${esc(p.brand)}</div><div class="title">${esc(p.name)}</div>
    <div class="box"><div class="p">${formatPrice(v ? v.price : p.minPrice)}</div></div>
    <div class="box"><h3>Размер в наличии</h3><div class="sizes-row">
      ${p.variants.map(x => `<button class="sz ${x.id === selectedSize ? 'on' : ''}" data-act="pick" data-id="${esc(x.id)}">${esc(x.size)}${x.stock === 1 ? '<span class="left">1 шт</span>' : ''}</button>`).join('')}
    </div></div>`;
  const gal = $app.querySelector('[data-gallery]');
  gal?.addEventListener('scroll', () => {
    const i = Math.round(gal.scrollLeft / gal.clientWidth);
    $app.querySelectorAll('.dots i').forEach((d, j) => d.classList.toggle('on', i === j));
  });
  if (v && cart.includes(v.id)) setBottom('Уже в корзине — перейти', () => go({ v: 'cart' }));
  else if (v) setBottom(`Добавить в корзину · ${v.size}`, () => {
    cart.push(v.id); saveCart(); tg?.HapticFeedback?.notificationOccurred('success'); toast('Добавлено в корзину'); render();
  });
  else setBottom('Выберите размер', null, true);
}

function viewCart() {
  const lines = cartLines();
  if (!lines.length) {
    $app.innerHTML = `${backLink()}<div class="state">Корзина пустая</div>`; setBottom('В каталог', () => { stack = [{ v: 'home' }]; render(); });
    return;
  }
  $app.innerHTML = `${backLink()}<div class="head"><b>Корзина</b><span class="muted">${lines.length} шт.</span></div>
    ${lines.map(({ p, v }) => `<div class="cart-item"><div class="ph">${photo(p)}</div>
      <div class="info"><div class="n">${esc(p.name)}</div><div class="s">№ ${esc(v.id)} · размер ${esc(v.size)}</div><div class="pr">${formatPrice(v.price)}</div></div>
      <button class="del" data-act="del" data-id="${esc(v.id)}" aria-label="Убрать">✕</button></div>`).join('')}
    <div class="total"><span>Итого</span><b>${formatPrice(cartTotal())}</b></div>
    <div class="note">Оплаты в приложении нет. Мы скопируем текст заявки — останется вставить его в сообщения канала и отправить. Менеджер подтвердит наличие и договорится об оплате и доставке.</div>`;
  setBottom(`Оформить заявку · ${formatPrice(cartTotal())}`, () => {
    go({ v: 'done', text: orderText(lines.map(({ p, v }) => ({ name: p.name, size: v.size, price: v.price }))) });
  });
}

async function copy(text, textarea) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    textarea.focus(); textarea.select();
    return document.execCommand('copy');
  }
}

function viewDone({ text }) {
  $app.innerHTML = `${backLink()}<div class="done"><div class="ok">✓</div><h2>Заявка готова</h2>
    <p>Текст заявки скопирован. Откройте сообщения канала, вставьте его и отправьте. Если вставить не получается — просто напишите этот текст сами. Менеджер ответит вам в Telegram.</p>
    <textarea class="order-text" readonly>${esc(text)}</textarea>
    <button class="link-btn" data-act="copy">Скопировать ещё раз</button></div>`;
  const ta = $app.querySelector('.order-text');
  copy(text, ta).then(ok => toast(ok ? 'Текст заявки скопирован' : 'Не удалось скопировать — выделите текст вручную'));
  $app.querySelector('[data-act="copy"]').onclick = () => copy(text, ta).then(ok => ok && toast('Скопировано'));
  setBottom('Открыть сообщения канала', () => {
    cart = []; saveCart();
    if (inTelegram) tg.openTelegramLink(CONFIG.channelDirectUrl); else window.open(CONFIG.channelDirectUrl, '_blank');
  });
}

function render() {
  const view = stack[stack.length - 1];
  if (inTelegram) stack.length > 1 ? tg.BackButton.show() : tg.BackButton.hide();
  ({ home: viewHome, list: viewList, product: viewProduct, cart: viewCart, done: viewDone })[view.v](view);
}

$app.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act } = el.dataset;
  if (act === 'back') back();
  else if (act === 'cart') go({ v: 'cart' });
  else if (act === 'cat') { filters.brands.clear(); filters.sizes.clear(); go({ v: 'list', category: el.dataset.cat }); }
  else if (act === 'product') go({ v: 'product', key: el.dataset.key });
  else if (act === 'pick') { selectedSize = el.dataset.id; render(); }
  else if (act === 'del') { cart = cart.filter(id => id !== el.dataset.id); saveCart(); render(); }
  else if (act === 'brand' || act === 'size') {
    const set = act === 'brand' ? filters.brands : filters.sizes;
    set.has(el.dataset.val) ? set.delete(el.dataset.val) : set.add(el.dataset.val);
    render();
  }
});
$app.addEventListener('input', e => {
  if (e.target.dataset.act !== 'search') return;
  filters.query = e.target.value;
  const view = stack[stack.length - 1];
  if (view.v === 'home' && filters.query.trim()) { stack.push({ v: 'list', category: '' }); }
  render();
  const input = $app.querySelector('.search');
  input.focus(); input.setSelectionRange(input.value.length, input.value.length);
});

async function load() {
  $app.innerHTML = '<div class="state">Загружаем каталог…</div>';
  try {
    const res = await fetch(CONFIG.sheetCsvUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`таблица ответила ${res.status}`);
    const { items, errors } = rowsToItems(parseCSV(await res.text()));
    if (errors.length) console.error('Строки таблицы пропущены:', errors);
    products = buildProducts(items);
    const before = cart.length;
    cart = cart.filter(id => findVariant(id));
    if (cart.length !== before) { saveCart(); toast('Часть товаров из корзины уже продана'); }
    render();
  } catch (err) {
    console.error(err);
    $app.innerHTML = `<div class="state">Не удалось загрузить каталог<br><span class="muted">${esc(err.message)}</span><br>
      <button class="retry" id="retry">Попробовать ещё раз</button></div>`;
    document.getElementById('retry').onclick = load;
    setBottom(null);
  }
}

if (tg) {
  tg.ready(); tg.expand();
  tg.BackButton.onClick(back);
}
load();
