const prisma = require('../prisma');
const HttpError = require('../utils/http-error');
const { parsePageLimit } = require('../utils/productListQuery');

const BOOKING_TYPES = ['SITE_VISIT', 'LAUNCH_EVENT'];
const pad2 = (n) => String(n).padStart(2, '0');

const formatDateOnly = (d) => {
  const dt = new Date(d);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
};

const formatTimeOnly = (d) => {
  const dt = new Date(d);
  return `${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}`;
};

// Combines a "YYYY-MM-DD" date with an "HH:mm" time into a single UTC instant.
const buildDateTime = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00.000Z`);

const serializeSlot = (slot, booked) => ({
  id: slot.id,
  date: formatDateOnly(slot.date),
  startTime: formatTimeOnly(slot.startTime),
  endTime: formatTimeOnly(slot.endTime),
  bookingType: slot.bookingType,
  capacity: slot.capacity,
  isEnabled: slot.isEnabled,
  booked,
  remaining: slot.capacity - booked
});

const getBookedCounts = async (slotIds) => {
  if (!slotIds.length) return {};
  const rows = await prisma.booking.groupBy({
    by: ['slotId'],
    where: { slotId: { in: slotIds }, status: { not: 'CANCELLED' } },
    _sum: { numberOfPeople: true }
  });
  const map = {};
  rows.forEach((r) => {
    map[r.slotId] = r._sum.numberOfPeople || 0;
  });
  return map;
};

// Shared by the website and WhatsApp availability endpoints.
const getAvailableSlots = async ({ date, type }) => {
  if (!type || !BOOKING_TYPES.includes(type)) {
    throw new HttpError('A valid type (SITE_VISIT or LAUNCH_EVENT) is required', 400);
  }

  const where = { isEnabled: true, bookingType: type };
  if (date) {
    where.date = { gte: buildDateTime(date, '00:00'), lte: buildDateTime(date, '23:59') };
  }

  const slots = await prisma.slot.findMany({ where, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] });
  const bookedMap = await getBookedCounts(slots.map((s) => s.id));

  return slots
    .map((slot) => serializeSlot(slot, bookedMap[slot.id] || 0))
    .filter((slot) => slot.remaining > 0);
};

const listSlotsAdmin = async (query) => {
  const { page, limit } = parsePageLimit(query);
  const skip = (page - 1) * limit;

  const [slots, total] = await Promise.all([
    prisma.slot.findMany({
      skip,
      take: limit,
      orderBy: [{ date: 'desc' }, { startTime: 'asc' }]
    }),
    prisma.slot.count()
  ]);

  const bookedMap = await getBookedCounts(slots.map((s) => s.id));

  return {
    data: slots.map((slot) => serializeSlot(slot, bookedMap[slot.id] || 0)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  };
};

const getSlotById = async (id) => {
  const slot = await prisma.slot.findUnique({ where: { id: parseInt(id, 10) } });
  if (!slot) throw new HttpError('Slot not found', 404);
  const bookedMap = await getBookedCounts([slot.id]);
  return serializeSlot(slot, bookedMap[slot.id] || 0);
};

const createSlot = async ({ date, startTime, endTime, bookingType, capacity }) => {
  if (!date || !startTime || !endTime || !bookingType) {
    throw new HttpError('date, startTime, endTime and bookingType are required', 400);
  }
  if (!BOOKING_TYPES.includes(bookingType)) {
    throw new HttpError('Invalid bookingType', 400);
  }
  const cap = capacity === undefined ? 10 : parseInt(capacity, 10);
  if (!Number.isInteger(cap) || cap <= 0) {
    throw new HttpError('capacity must be a positive integer', 400);
  }

  const slot = await prisma.slot.create({
    data: {
      date: buildDateTime(date, '00:00'),
      startTime: buildDateTime(date, startTime),
      endTime: buildDateTime(date, endTime),
      bookingType,
      capacity: cap
    }
  });
  return serializeSlot(slot, 0);
};

const updateSlot = async (id, patch) => {
  const slotId = parseInt(id, 10);
  const existing = await prisma.slot.findUnique({ where: { id: slotId } });
  if (!existing) throw new HttpError('Slot not found', 404);

  if (patch.bookingType !== undefined && !BOOKING_TYPES.includes(patch.bookingType)) {
    throw new HttpError('Invalid bookingType', 400);
  }

  const dateStr = patch.date || formatDateOnly(existing.date);
  const data = {};
  if (patch.date !== undefined) data.date = buildDateTime(dateStr, '00:00');
  if (patch.startTime !== undefined) data.startTime = buildDateTime(dateStr, patch.startTime);
  if (patch.endTime !== undefined) data.endTime = buildDateTime(dateStr, patch.endTime);
  if (patch.bookingType !== undefined) data.bookingType = patch.bookingType;
  if (patch.capacity !== undefined) {
    const cap = parseInt(patch.capacity, 10);
    if (!Number.isInteger(cap) || cap <= 0) throw new HttpError('capacity must be a positive integer', 400);
    data.capacity = cap;
  }
  if (patch.isEnabled !== undefined) data.isEnabled = Boolean(patch.isEnabled);

  const updated = await prisma.slot.update({ where: { id: slotId }, data });
  const bookedMap = await getBookedCounts([slotId]);
  return serializeSlot(updated, bookedMap[slotId] || 0);
};

const deleteSlot = async (id) => {
  const slotId = parseInt(id, 10);
  const existing = await prisma.slot.findUnique({ where: { id: slotId } });
  if (!existing) throw new HttpError('Slot not found', 404);

  const bookingCount = await prisma.booking.count({ where: { slotId } });
  if (bookingCount > 0) {
    const updated = await prisma.slot.update({ where: { id: slotId }, data: { isEnabled: false } });
    return { softDeleted: true, slot: serializeSlot(updated, 0) };
  }

  await prisma.slot.delete({ where: { id: slotId } });
  return { softDeleted: false };
};

module.exports = {
  BOOKING_TYPES,
  formatDateOnly,
  formatTimeOnly,
  buildDateTime,
  getAvailableSlots,
  listSlotsAdmin,
  getSlotById,
  createSlot,
  updateSlot,
  deleteSlot
};
