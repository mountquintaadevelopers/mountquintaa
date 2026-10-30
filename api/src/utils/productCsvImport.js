const { parse } = require('csv-parse/sync');

function normalizeKey (k) {
  return String(k || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/** Flatten CSV header keys to snake_case for lookup. */
function rowToKeyed (record) {
  const keyed = {};
  for (const [k, v] of Object.entries(record)) {
    keyed[normalizeKey(k)] = v;
  }
  return keyed;
}

function cell (keyed, ...aliases) {
  for (const a of aliases) {
    const v = keyed[normalizeKey(a)];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
}

function parseJsonObject (raw, columnLabel) {
  const s = String(raw || '').trim();
  if (!s) return {};
  try {
    const o = JSON.parse(s);
    if (o === null || typeof o !== 'object' || Array.isArray(o)) {
      throw new Error('must be a JSON object');
    }
    return o;
  } catch (e) {
    throw new Error(`${columnLabel}: invalid JSON (${e.message})`);
  }
}

function parseJsonArray (raw, columnLabel) {
  const s = String(raw || '').trim();
  if (!s) return [];
  try {
    const o = JSON.parse(s);
    if (!Array.isArray(o)) {
      throw new Error('must be a JSON array');
    }
    return o;
  } catch (e) {
    throw new Error(`${columnLabel}: invalid JSON (${e.message})`);
  }
}

function parseImagesCell (raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    return parseJsonArray(s, 'images').map(String).map((x) => x.trim()).filter(Boolean);
  }
  return s.split(/[|;]/).map((x) => x.trim()).filter(Boolean);
}

/**
 * One CSV row → object accepted by productService.bulkCreateProducts.
 * Expected columns (any matching header; case/spaces flexible):
 * - tag_ids / sid / subcategory_slug / tag_slug (at least one tag source OR provide category)
 * - category_id / category_slug (optional; counts toward taxonomy when no tags)
 * - name, price, stock, paw_points (or pawPoints)
 * - sprice, sku (optional)
 * - breed_ids or breed_id (optional)
 * - product_details, manufacture_details (JSON objects as strings; optional → {})
 * - images: "a.webp|b.webp" OR JSON ["a.webp"]
 * - variants: JSON array string (optional)
 */
function csvRowToProduct (keyed) {
  const sidStr = cell(keyed, 'sid', 'subcat_id', 'subcategory_id');
  const subSlug = cell(keyed, 'subcategory_slug', 'subcategoryslug', 'subcat_slug', 'tag_slug', 'tagslug');
  const tagIdsCell = cell(keyed, 'tag_ids', 'tagids', 'tags');

  const product = {};

  if (sidStr !== '') {
    const sid = parseInt(sidStr, 10);
    if (Number.isNaN(sid)) {
      throw new Error('sid must be a number');
    }
    product.sid = sid;
  }

  if (subSlug !== '') {
    product.subcategorySlug = subSlug;
  }

  if (tagIdsCell !== '') {
    product.tag_ids = tagIdsCell;
  }

  const categoryId = cell(keyed, 'category_id', 'collection_id', 'cid');
  if (categoryId !== '') {
    product.categoryId = categoryId;
  }

  const categorySlug = cell(keyed, 'category_slug', 'categoryslug');
  if (categorySlug !== '') {
    product.category_slug = categorySlug;
  }

  const breedIdsCell = cell(keyed, 'breed_ids', 'breedids');
  if (breedIdsCell !== '') {
    product.breed_ids = breedIdsCell;
  }

  const breedId = cell(keyed, 'breed_id', 'breedid');
  if (breedId !== '') {
    product.breedId = breedId;
  }

  if (!product.sid && !product.subcategorySlug && !product.tag_ids && !product.categoryId && !product.category_slug) {
    throw new Error(
      'Provide tag(s): sid, tag_ids, or subcategory_slug / tag_slug — and/or category_id / category_slug'
    );
  }

  product.name = cell(keyed, 'name', 'title');
  if (!product.name) {
    throw new Error('name is required');
  }

  product.price = cell(keyed, 'price');
  product.stock = cell(keyed, 'stock', 'qty', 'quantity');
  product.pawPoints = cell(keyed, 'paw_points', 'pawpoints');

  const sprice = cell(keyed, 'sprice', 'sale_price', 'saleprice');
  if (sprice !== '') product.sprice = sprice;

  const sku = cell(keyed, 'sku');
  if (sku !== '') product.sku = sku;

  const pd = cell(keyed, 'product_details', 'productdetails');
  product.productDetails = pd ? parseJsonObject(pd, 'product_details') : {};

  const md = cell(keyed, 'manufacture_details', 'manufacturedetails');
  product.manufactureDetails = md ? parseJsonObject(md, 'manufacture_details') : {};

  const img = cell(keyed, 'images', 'image', 'photos');
  product.images = parseImagesCell(img);

  const varStr = cell(keyed, 'variants', 'variant');
  if (varStr !== '') {
    product.variants = parseJsonArray(varStr, 'variants');
  }

  return product;
}

/**
 * @param {Buffer|string} buffer
 * @returns {{ products: object[], rowErrors: { line: number, message: string }[] }}
 */
function parseProductCsvBuffer (buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true
  });

  const products = [];
  const rowErrors = [];

  records.forEach((record, idx) => {
    const line = idx + 2;
    const keyed = rowToKeyed(record);
    const isEmptyRow = Object.values(keyed).every(
      (v) => v === undefined || v === null || String(v).trim() === ''
    );
    if (isEmptyRow) {
      return;
    }
    try {
      products.push(csvRowToProduct(keyed));
    } catch (e) {
      rowErrors.push({ line, message: e.message || String(e) });
    }
  });

  return { products, rowErrors };
}

module.exports = { parseProductCsvBuffer, csvRowToProduct, rowToKeyed };
