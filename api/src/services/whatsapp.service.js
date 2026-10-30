const prisma = require('../prisma');
const HttpError = require('../utils/http-error');
const { parsePageLimit } = require('../utils/productListQuery');
const bookingService = require('./booking.service');

const upsertWhatsappUser = async ({ name, phone }) => {
  if (!phone) throw new HttpError('phone is required', 400);

  const existing = await prisma.whatsAppUserLog.findUnique({ where: { phone } });
  if (existing) {
    return prisma.whatsAppUserLog.update({
      where: { phone },
      data: {
        name: name || existing.name,
        visitCount: existing.visitCount + 1,
        lastVisitedAt: new Date()
      }
    });
  }

  return prisma.whatsAppUserLog.create({
    data: { name: name || 'WhatsApp User', phone, visitCount: 1, lastVisitedAt: new Date() }
  });
};

const getWhatsappUserByPhone = async (phone) => {
  const user = await prisma.whatsAppUserLog.findUnique({ where: { phone } });
  if (!user) throw new HttpError('WhatsApp user not found', 404);
  return user;
};

const getWhatsappUserById = async (id) => {
  const user = await prisma.whatsAppUserLog.findUnique({ where: { id: parseInt(id, 10) } });
  if (!user) throw new HttpError('WhatsApp user not found', 404);
  return user;
};

const listWhatsappUsers = async (query) => {
  const { page, limit } = parsePageLimit(query);
  const skip = (page - 1) * limit;
  const search = query.search;

  const where = search
    ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }] }
    : {};

  const [data, total] = await Promise.all([
    prisma.whatsAppUserLog.findMany({ where, skip, take: limit, orderBy: { lastVisitedAt: 'desc' } }),
    prisma.whatsAppUserLog.count({ where })
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  };
};

const listWhatsappUsersForExport = async () => {
  return prisma.whatsAppUserLog.findMany({ orderBy: { lastVisitedAt: 'desc' } });
};

// Field names match the Footer's on-click-action payload keys in the "Book a Site Visit" Flow JSON.
const FLOW_REPLY_FIELDS = {
  name: 'screen_0_Full_Name_0',
  phone: 'screen_0_Mobile_Number_1',
  email: 'screen_0_Email_Address_2',
  slotId: 'screen_0_Time_Slot_4',
  numberOfPeople: 'screen_0_Number_of_People_5'
};

// Meta delivers a completed Flow as a normal chat message (type "interactive",
// interactive.type "nfm_reply") on this same webhook — not on the encrypted
// data-exchange endpoint, which only handles in-flow screen data.
const extractNfmReplies = (payload) => {
  const entries = payload?.entry || [];
  const replies = [];
  entries.forEach((entry) => {
    (entry.changes || []).forEach((change) => {
      (change.value?.messages || []).forEach((message) => {
        if (message.interactive?.type === 'nfm_reply') {
          replies.push(message.interactive.nfm_reply);
        }
      });
    });
  });
  return replies;
};

const createBookingFromFlowReply = async (reply) => {
  let fields;
  try {
    fields = JSON.parse(reply.response_json || '{}');
  } catch (err) {
    return { error: 'Invalid response_json in Flow reply' };
  }

  const name = fields[FLOW_REPLY_FIELDS.name];
  const phone = fields[FLOW_REPLY_FIELDS.phone];
  const email = fields[FLOW_REPLY_FIELDS.email];
  const slotId = fields[FLOW_REPLY_FIELDS.slotId];
  const numberOfPeople = fields[FLOW_REPLY_FIELDS.numberOfPeople];

  if (!name || !phone || !slotId) {
    return { error: 'Flow reply missing name, phone, or slotId' };
  }

  await upsertWhatsappUser({ name, phone });
  const booking = await bookingService.createBooking({
    name,
    phone,
    email,
    slotId,
    bookingType: 'SITE_VISIT',
    numberOfPeople: numberOfPeople || 1
  });
  return { bookingNumber: booking.bookingNumber };
};

// Provider-specific parsing/verification stays isolated here so the rest of the
// app never depends on a particular WhatsApp provider's payload shape.
const handleWebhookEvent = async (payload) => {
  const replies = extractNfmReplies(payload);
  if (!replies.length) return { received: true };

  const results = [];
  for (const reply of replies) {
    try {
      results.push(await createBookingFromFlowReply(reply));
    } catch (err) {
      results.push({ error: err.message });
    }
  }
  return { received: true, flowReplies: results };
};

module.exports = {
  upsertWhatsappUser,
  getWhatsappUserByPhone,
  getWhatsappUserById,
  listWhatsappUsers,
  listWhatsappUsersForExport,
  handleWebhookEvent
};
