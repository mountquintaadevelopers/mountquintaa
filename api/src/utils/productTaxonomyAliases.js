/** Enrich product JSON with legacy `tag` / `subcategory` / `category` keys for older clients. */
function withTaxonomyAliases(product) {
  if (!product) return product;
  const tags = Array.isArray(product.tags) ? product.tags : [];
  const firstTag = tags[0] ?? null;
  const collection = product.collection ?? null;
  const breeds = Array.isArray(product.breeds) ? product.breeds : [];
  const firstBreed = breeds[0] ?? null;
  return {
    ...product,
    tags,
    tag: firstTag,
    breeds,
    breed: firstBreed,
    breedId: firstBreed?.id ?? null,
    collection,
    category: collection,
    subcategory:
      firstTag != null ? { ...firstTag, category: collection ?? undefined } : null,
  };
}

module.exports = { withTaxonomyAliases };
