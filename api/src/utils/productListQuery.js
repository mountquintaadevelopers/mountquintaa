const prisma = require('../prisma');

const splitCsv = (raw) => {
  if (raw === undefined || raw === null || raw === '') return [];
  const s = String(raw).trim();
  if (!s) return [];
  return s
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter(Boolean);
};

/**
 * @param {string} label - human-readable param name for errors
 * @param {unknown} raw
 * @returns {number[]}
 */
exports.parseCsvPositiveInts = (label, raw) => {
  const parts = splitCsv(raw);
  const out = [];
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (Number.isNaN(n) || n < 1) {
      throw new Error(`Invalid ${label}: each value must be a positive integer`);
    }
    out.push(n);
  }
  return [...new Set(out)];
};

/**
 * @param {unknown} raw
 * @returns {number[]}
 */
exports.parseCsvRatings = (raw) => {
  const parts = splitCsv(raw);
  const out = [];
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (Number.isNaN(n) || n < 1 || n > 5) {
      throw new Error('Invalid ratings: each value must be an integer from 1 to 5');
    }
    out.push(n);
  }
  return [...new Set(out)];
};

exports.parsePageLimit = (query) => {
  const pageRaw = query.page;
  const limitRaw = query.limit;
  const page = pageRaw === undefined || pageRaw === '' ? 1 : parseInt(pageRaw, 10);
  const limit = limitRaw === undefined || limitRaw === '' ? 12 : parseInt(limitRaw, 10);
  if (Number.isNaN(page) || page < 1) {
    throw new Error('Invalid page: must be an integer >= 1');
  }
  if (Number.isNaN(limit) || limit < 1) {
    throw new Error('Invalid limit: must be an integer >= 1');
  }
  return { page, limit };
};

exports.parseOptionalFloat = (label, raw) => {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = parseFloat(String(raw).trim());
  if (Number.isNaN(n)) {
    throw new Error(`Invalid ${label}: must be numeric`);
  }
  return n;
};

/**
 * @param {{ brandIds?: number[], breedIds?: number[], categoryIds?: number[], tagIds?: number[] }} filters
 */
exports.assertProductListForeignKeys = async (filters = {}) => {
  const { brandIds = [], breedIds = [], categoryIds = [], tagIds = [] } = filters;
  const tasks = [];
  if (brandIds.length) {
    tasks.push(
      (async () => {
        const rows = await prisma.brands.findMany({
          where: { id: { in: brandIds } },
          select: { id: true },
        });
        if (rows.length !== brandIds.length) {
          const have = new Set(rows.map((r) => r.id));
          const missing = brandIds.filter((id) => !have.has(id));
          throw new Error(`Invalid brand id(s): ${missing.join(', ')}`);
        }
      })()
    );
  }
  if (breedIds.length) {
    tasks.push(
      (async () => {
        const rows = await prisma.breeds.findMany({
          where: { id: { in: breedIds } },
          select: { id: true },
        });
        if (rows.length !== breedIds.length) {
          const have = new Set(rows.map((r) => r.id));
          const missing = breedIds.filter((id) => !have.has(id));
          throw new Error(`Invalid breed id(s): ${missing.join(', ')}`);
        }
      })()
    );
  }
  if (categoryIds.length) {
    tasks.push(
      (async () => {
        const rows = await prisma.collection.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true },
        });
        if (rows.length !== categoryIds.length) {
          const have = new Set(rows.map((r) => r.id));
          const missing = categoryIds.filter((id) => !have.has(id));
          throw new Error(`Invalid category id(s): ${missing.join(', ')}`);
        }
      })()
    );
  }
  if (tagIds.length) {
    tasks.push(
      (async () => {
        const rows = await prisma.tag.findMany({
          where: { id: { in: tagIds } },
          select: { id: true },
        });
        if (rows.length !== tagIds.length) {
          const have = new Set(rows.map((r) => r.id));
          const missing = tagIds.filter((id) => !have.has(id));
          throw new Error(`Invalid tag id(s): ${missing.join(', ')}`);
        }
      })()
    );
  }
  await Promise.all(tasks);
};

/**
 * Breed listing: `brand` may be "1,2,3" or a single slug.
 * @returns {{ brandIds: number[], brandSlug: string | null }}
 */
exports.parseBrandFilterForBreedListing = (raw) => {
  if (raw === undefined || raw === null || raw === '') {
    return { brandIds: [], brandSlug: null };
  }
  const s = String(raw).trim();
  if (!s) return { brandIds: [], brandSlug: null };
  const compact = s.replace(/\s/g, '');
  if (/^\d+(,\d+)*$/.test(compact)) {
    return { brandIds: exports.parseCsvPositiveInts('brand', s), brandSlug: null };
  }
  if (compact.includes(',')) {
    throw new Error('Invalid brand: use comma-separated numeric ids or a single brand slug');
  }
  return { brandIds: [], brandSlug: s };
};

/**
 * Breed listing: `category` may be "4,6,9" or a single collection slug.
 * @returns {{ categoryIds: number[], categorySlug: string | null }}
 */
exports.parseCategoryFilterForBreedListing = (raw) => {
  if (raw === undefined || raw === null || raw === '') {
    return { categoryIds: [], categorySlug: null };
  }
  const s = String(raw).trim();
  if (!s) return { categoryIds: [], categorySlug: null };
  const compact = s.replace(/\s/g, '');
  if (/^\d+(,\d+)*$/.test(compact)) {
    return { categoryIds: exports.parseCsvPositiveInts('category', s), categorySlug: null };
  }
  if (compact.includes(',')) {
    throw new Error('Invalid category: use comma-separated numeric ids or a single category slug');
  }
  return { categoryIds: [], categorySlug: s };
};

/** Product ids whose rounded average review rating is in `ratingValues` (1–5). */
exports.getProductIdsMatchingRoundedAverageRatings = async (ratingValues) => {
  if (!ratingValues || ratingValues.length === 0) return null;
  const want = new Set(ratingValues);
  const grouped = await prisma.review.groupBy({
    by: ['pid'],
    _avg: { rating: true },
  });
  return grouped
    .filter((g) => want.has(Math.round(Number(g._avg.rating) || 0)))
    .map((g) => g.pid);
};
