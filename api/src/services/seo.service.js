const prisma = require('../prisma');
const HttpError = require('../utils/http-error');

// Fields the admin panel may edit, with their max lengths (null = TEXT column).
// slug, pageName and path are fixed — each row maps to a real website page.
const EDITABLE = {
  title: { max: 255, required: true },
  description: { max: 5000, required: true },
  keywords: { max: 5000 },
  ogTitle: { max: 255 },
  ogDescription: { max: 5000 },
  ogImage: { max: 500, url: true },
  canonicalUrl: { max: 500, url: true }
};

const isHttpUrl = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const listSeoPages = () => prisma.seoPage.findMany({ orderBy: { id: 'asc' } });

const getSeoPage = async (slug) => {
  const page = await prisma.seoPage.findUnique({ where: { slug: String(slug) } });
  if (!page) {
    throw new HttpError('SEO page not found', 404);
  }
  return page;
};

const updateSeoPage = async (slug, body = {}) => {
  await getSeoPage(slug);

  const data = {};
  for (const [field, rule] of Object.entries(EDITABLE)) {
    if (body[field] === undefined) continue;

    let value = body[field] === null ? null : String(body[field]).trim();
    if (value === '') value = null;

    if (value === null) {
      if (rule.required) throw new HttpError(`${field} cannot be empty`, 400);
    } else {
      if (value.length > rule.max) throw new HttpError(`${field} must be at most ${rule.max} characters`, 400);
      if (rule.url && !isHttpUrl(value)) throw new HttpError(`${field} must be a full http(s) URL`, 400);
    }
    data[field] = value;
  }
  if (body.noindex !== undefined) {
    if (typeof body.noindex !== 'boolean') throw new HttpError('noindex must be true or false', 400);
    data.noindex = body.noindex;
  }

  if (Object.keys(data).length === 0) {
    throw new HttpError(`Nothing to update. Editable fields: ${Object.keys(EDITABLE).join(', ')}, noindex`, 400);
  }

  return prisma.seoPage.update({ where: { slug: String(slug) }, data });
};

module.exports = { listSeoPages, getSeoPage, updateSeoPage };
