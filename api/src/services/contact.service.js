const prisma = require('../prisma');
const HttpError = require('../utils/http-error');
const { parsePageLimit } = require('../utils/productListQuery');

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

const clean = (value, max) => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s.slice(0, max);
};

/**
 * Public: website enquiry forms, WhatsApp bot and other clients.
 * Validation is unchanged from the original endpoint (name, email, phone required);
 * source / consent / pageUrl are optional extras sent by the website.
 * @param {object} body  { name, email, phone, message?, source?, consent?, pageUrl? }
 * @param {object} meta  { ipAddress }
 */
const createContact = async (body = {}, meta = {}) => {
  const { name, email, phone } = body;
  if (!name || !email || !phone) {
    throw new HttpError('name, email and phone are required', 400);
  }
  const message = body.message || null;

  // Double-click / resubmit guard: identical enquiry within 2 minutes -> return the existing one
  const recent = await prisma.contactMessage.findFirst({
    where: { name, email, phone, message, createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) } },
    orderBy: { createdAt: 'desc' }
  });
  if (recent) return recent;

  return prisma.contactMessage.create({
    data: {
      name,
      email,
      phone,
      message,
      source: clean(body.source, 191),
      consent: body.consent === true || body.consent === 'true' || body.consent === 'on' || body.consent === 1,
      pageUrl: clean(body.pageUrl, 500),
      ipAddress: clean(meta.ipAddress, 64)
    }
  });
};

/**
 * Admin list. Query: page, limit, search, isFollowUped, source, from, to
 */
const listContacts = async (query) => {
  const { page, limit } = parsePageLimit(query);
  const skip = (page - 1) * limit;

  const where = {};
  if (query.search) {
    const q = String(query.search).trim();
    where.OR = [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }];
  }
  if (query.isFollowUped === 'true' || query.isFollowUped === 'false') {
    where.isFollowUped = query.isFollowUped === 'true';
  }
  if (query.source) {
    where.source = String(query.source);
  }
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) {
      const from = new Date(`${query.from}T00:00:00`);
      if (Number.isNaN(from.getTime())) throw new HttpError('Invalid from date (use YYYY-MM-DD)', 400);
      where.createdAt.gte = from;
    }
    if (query.to) {
      const to = new Date(`${query.to}T23:59:59.999`);
      if (Number.isNaN(to.getTime())) throw new HttpError('Invalid to date (use YYYY-MM-DD)', 400);
      where.createdAt.lte = to;
    }
  }

  const [data, total] = await Promise.all([
    prisma.contactMessage.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.contactMessage.count({ where })
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  };
};

const getContact = async (id) => {
  const contactId = parseInt(id, 10);
  const contact = Number.isNaN(contactId) ? null : await prisma.contactMessage.findUnique({ where: { id: contactId } });
  if (!contact) {
    throw new HttpError('Contact not found', 404);
  }
  return contact;
};

const updateContact = async (id, { isFollowUped, adminNote }) => {
  const existing = await getContact(id);

  const data = {};
  if (isFollowUped !== undefined) data.isFollowUped = Boolean(isFollowUped);
  if (adminNote !== undefined) {
    if (adminNote !== null && String(adminNote).length > 191) {
      throw new HttpError('adminNote must be at most 191 characters', 400);
    }
    data.adminNote = adminNote;
  }

  return prisma.contactMessage.update({ where: { id: existing.id }, data });
};

module.exports = { createContact, listContacts, getContact, updateContact };
