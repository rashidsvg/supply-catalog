// Чистые функции каталога: разбор CSV из таблицы, сборка товаров, фильтры, текст заявки.
// Без DOM — проверяются тестами в tests/catalog.test.mjs.

export const REQUIRED_COLUMNS = ['id', 'название', 'бренд', 'категория', 'размер', 'цена', 'остаток', 'фото'];

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

// Строки таблицы -> позиции (одна строка = товар в одном размере).
// Нет нужной колонки — ошибка; строки с битой ценой/остатком возвращаются в errors.
export function rowsToItems(rows) {
  if (!rows.length) throw new Error('Таблица пустая');
  const header = rows[0].map(h => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter(c => !header.includes(c));
  if (missing.length) throw new Error(`В таблице нет колонок: ${missing.join(', ')}`);
  const col = name => header.indexOf(name);
  const items = [], errors = [];
  rows.slice(1).forEach((r, i) => {
    const get = name => (r[col(name)] ?? '').trim();
    const price = Number(get('цена').replace(/[\s₽.]/g, '').replace(',', '.'));
    const stock = Number(get('остаток'));
    const line = i + 2;
    if (!get('id') || !get('название')) { errors.push(`строка ${line}: нет id или названия`); return; }
    if (!Number.isFinite(price) || price <= 0) { errors.push(`строка ${line}: цена «${get('цена')}»`); return; }
    if (!Number.isInteger(stock)) { errors.push(`строка ${line}: остаток «${get('остаток')}»`); return; }
    items.push({
      id: get('id'), name: get('название'), brand: get('бренд'), category: get('категория'),
      size: get('размер'), price, stock,
      photos: get('фото').split(/\s+/).filter(Boolean),
    });
  });
  return { items, errors };
}

// Позиции с остатком > 0, сгруппированные в товары (одно название + бренд = один товар).
export function buildProducts(items) {
  const map = new Map();
  for (const it of items) {
    if (it.stock <= 0) continue;
    const key = `${it.brand}|${it.name}`;
    if (!map.has(key)) {
      map.set(key, { key, name: it.name, brand: it.brand, category: it.category, photos: it.photos, variants: [] });
    }
    const p = map.get(key);
    if (!p.photos.length && it.photos.length) p.photos = it.photos;
    p.variants.push({ id: it.id, size: it.size, price: it.price, stock: it.stock });
  }
  const products = [...map.values()];
  for (const p of products) {
    p.variants.sort((a, b) => sizeOrder(a.size) - sizeOrder(b.size));
    p.minPrice = Math.min(...p.variants.map(v => v.price));
  }
  return products;
}

const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
export function sizeOrder(size) {
  const s = size.toUpperCase().replace(/\s*EU$/, '').trim();
  const li = LETTER_SIZES.indexOf(s);
  if (li >= 0) return li;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? 100 + n : 1000;
}

export function categories(products) {
  const counts = new Map();
  for (const p of products) counts.set(p.category, (counts.get(p.category) || 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

// filter: { category, brands:Set, sizes:Set, query }
export function filterProducts(products, { category = '', brands = new Set(), sizes = new Set(), query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return products.filter(p =>
    (!category || p.category === category) &&
    (!brands.size || brands.has(p.brand)) &&
    (!sizes.size || p.variants.some(v => sizes.has(v.size))) &&
    (!q || `${p.name} ${p.brand}`.toLowerCase().includes(q)));
}

// Кнопки фильтра размеров: группы «Обувь» (числа, с EU) и «Одежда» (буквы), каждая по порядку.
// count — сколько товаров найдётся с этим размером при остальных фильтрах (категория, бренд, поиск).
// Размер с нулём скрыт, кроме уже выбранного — его можно снять.
export function sizeGroups(products, { category = '', brands = new Set(), sizes = new Set(), query = '' } = {}) {
  const pool = filterProducts(products, { category, brands, query });
  const all = new Set(filterProducts(products, { category }).flatMap(p => p.variants.map(v => v.size)));
  const groups = { 'Обувь': [], 'Одежда': [] };
  for (const size of all) {
    const count = pool.filter(p => p.variants.some(v => v.size === size)).length;
    if (!count && !sizes.has(size)) continue;
    const label = size.trim();
    groups[sizeOrder(size) >= 100 && sizeOrder(size) < 1000 ? 'Обувь' : 'Одежда'].push({ size, label, count });
  }
  return Object.entries(groups).filter(([, list]) => list.length)
    .map(([label, list]) => ({ label, sizes: list.sort((a, b) => sizeOrder(a.size) - sizeOrder(b.size)) }));
}

export function formatPrice(n) {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`;
}

// Простой текст одной строкой, без спецсимволов (тире, ₽, неразрывных пробелов): прежний
// многострочный текст с ними при вставке в ЛС канала Telegram требовал Премиум.
// cartLines: [{ name, size, price }]
export function orderText(cartLines) {
  const items = cartLines.map(l => `${l.name}, размер ${l.size}, ${Math.round(l.price)} руб.`);
  const total = cartLines.reduce((s, l) => s + l.price, 0);
  return `Заказ: ${items.join('; ')} Итого ${Math.round(total)} руб.`;
}
