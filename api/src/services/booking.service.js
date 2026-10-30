const prisma = require('../prisma');
const HttpError = require('../utils/http-error');
const { generateBookingNumber } = require('../utils/bookingNumber');
const { generateQrCodeFile } = require('../utils/qrcode');
const { parsePageLimit } = require('../utils/productListQuery');
const { BOOKING_TYPES } = require('./slot.service');
const { getBookingSettings } = require('./settings.service');

const SETTING_KEY_BY_TYPE = {
  SITE_VISIT: 'siteVisitEnabled',
  LAUNCH_EVENT: 'launchEventEnabled'
};

const MAX_BOOKING_NUMBER_ATTEMPTS = 5;

// Shared by the website (POST /bookings) and WhatsApp (POST /whatsapp/bookings) endpoints.
const createBooking = async ({ name, phone, email, slotId, bookingType, numberOfPeople }) => {
  if (!name || !phone) {
    throw new HttpError('name and phone are required', 400);
  }
  if (!bookingType || !BOOKING_TYPES.includes(bookingType)) {
    throw new HttpError('A valid bookingType (SITE_VISIT or LAUNCH_EVENT) is required', 400);
  }
  const slotIdInt = parseInt(slotId, 10);
  if (!Number.isInteger(slotIdInt)) {
    throw new HttpError('A valid slotId is required', 400);
  }
  const people = parseInt(numberOfPeople, 10);
  if (!Number.isInteger(people) || people <= 0) {
    throw new HttpError('numberOfPeople must be greater than 0', 400);
  }

  const settings = await getBookingSettings();
  if (settings[SETTING_KEY_BY_TYPE[bookingType]] === false) {
    throw new HttpError(`${bookingType} bookings are currently disabled`, 400);
  }

  let lastError;
  for (let attempt = 0; attempt < MAX_BOOKING_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Lock the slot row so concurrent bookings on the same slot serialize.
        await tx.$executeRaw`SELECT id FROM Slot WHERE id = ${slotIdInt} FOR UPDATE`;

        const slot = await tx.slot.findUnique({ where: { id: slotIdInt } });
        if (!slot) throw new HttpError('Slot not found', 404);
        if (!slot.isEnabled) throw new HttpError('Slot is not enabled', 400);
        if (slot.bookingType !== bookingType) throw new HttpError('Slot booking type mismatch', 400);

        const agg = await tx.booking.aggregate({
          where: { slotId: slot.id, status: { not: 'CANCELLED' } },
          _sum: { numberOfPeople: true }
        });
        const booked = agg._sum.numberOfPeople || 0;
        const remaining = slot.capacity - booked;
        if (people > remaining) {
          throw new HttpError('Insufficient slot capacity', 400);
        }

        let user = await tx.user.findUnique({ where: { phone } });
        if (!user) {
          user = await tx.user.create({ data: { name, phone, email: email || null } });
        }

        const bookingNumber = await generateBookingNumber(tx);

        return tx.booking.create({
          data: {
            bookingNumber,
            userId: user.id,
            slotId: slot.id,
            bookingType,
            numberOfPeople: people,
            status: 'CONFIRMED'
          },
          include: { user: true, slot: true }
        });
      });
    } catch (err) {
      const isDuplicateBookingNumber = err.code === 'P2002';
      if (isDuplicateBookingNumber && attempt < MAX_BOOKING_NUMBER_ATTEMPTS - 1) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
};

const buildBookingWhere = ({ search, type, status, fromDate, toDate }) => {
  const where = {};
  if (type) where.bookingType = type;
  if (status) where.status = status;
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = new Date(`${fromDate}T00:00:00.000Z`);
    if (toDate) where.createdAt.lte = new Date(`${toDate}T23:59:59.999Z`);
  }
  if (search) {
    where.OR = [
      { bookingNumber: { contains: search } },
      { user: { name: { contains: search } } },
      { user: { phone: { contains: search } } }
    ];
  }
  return where;
};

const listBookings = async (query) => {
  const { page, limit } = parsePageLimit(query);
  const skip = (page - 1) * limit;
  const where = buildBookingWhere(query);

  const [data, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: true, slot: true }
    }),
    prisma.booking.count({ where })
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  };
};

const listBookingsForExport = async (query) => {
  const where = buildBookingWhere(query);
  return prisma.booking.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { user: true, slot: true }
  });
};

const getBookingById = async (id) => {
  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(id, 10) },
    include: { user: true, slot: true, scannedBy: { select: { id: true, name: true, email: true, role: true } } }
  });
  if (!booking) throw new HttpError('Booking not found', 404);
  return booking;
};

// Status transitions go through cancel/complete. Otherwise this only allows adjusting
// numberOfPeople and/or rescheduling to a different slot (must share the same bookingType).
const updateBooking = async (id, { numberOfPeople, slotId }) => {
  const bookingId = parseInt(id, 10);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new HttpError('Booking not found', 404);
  if (booking.status === 'CANCELLED') throw new HttpError('Cannot update a cancelled booking', 400);
  if (booking.status === 'COMPLETED') throw new HttpError('Cannot update a completed booking', 400);

  if (numberOfPeople === undefined && slotId === undefined) {
    return prisma.booking.findUnique({ where: { id: bookingId }, include: { user: true, slot: true } });
  }

  let people = booking.numberOfPeople;
  if (numberOfPeople !== undefined) {
    people = parseInt(numberOfPeople, 10);
    if (!Number.isInteger(people) || people <= 0) {
      throw new HttpError('numberOfPeople must be greater than 0', 400);
    }
  }

  let newSlotId = booking.slotId;
  if (slotId !== undefined) {
    newSlotId = parseInt(slotId, 10);
    if (!Number.isInteger(newSlotId)) {
      throw new HttpError('A valid slotId is required', 400);
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM Slot WHERE id = ${newSlotId} FOR UPDATE`;
    const slot = await tx.slot.findUnique({ where: { id: newSlotId } });
    if (!slot) throw new HttpError('Slot not found', 404);
    if (!slot.isEnabled) throw new HttpError('Slot is not enabled', 400);
    if (slot.bookingType !== booking.bookingType) throw new HttpError('Slot booking type mismatch', 400);

    const agg = await tx.booking.aggregate({
      where: { slotId: newSlotId, status: { not: 'CANCELLED' }, id: { not: bookingId } },
      _sum: { numberOfPeople: true }
    });
    const bookedByOthers = agg._sum.numberOfPeople || 0;
    if (people > slot.capacity - bookedByOthers) {
      throw new HttpError('Insufficient slot capacity', 400);
    }

    return tx.booking.update({
      where: { id: bookingId },
      data: { numberOfPeople: people, slotId: newSlotId },
      include: { user: true, slot: true }
    });
  });
};

const cancelBooking = async (id) => {
  const bookingId = parseInt(id, 10);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new HttpError('Booking not found', 404);
  if (booking.status === 'CANCELLED') throw new HttpError('Booking is already cancelled', 400);
  if (booking.status === 'COMPLETED') throw new HttpError('Cannot cancel a completed booking', 400);

  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'CANCELLED' },
    include: { user: true, slot: true }
  });
};

const completeBooking = async (id) => {
  const bookingId = parseInt(id, 10);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new HttpError('Booking not found', 404);
  if (booking.status === 'CANCELLED') throw new HttpError('Cannot complete a cancelled booking', 400);
  if (booking.status === 'COMPLETED') throw new HttpError('Booking is already completed', 400);

  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'COMPLETED' },
    include: { user: true, slot: true }
  });
};

// QR encodes the bookingNumber, the same value the scanner endpoint expects (POST /v1/scanner).
const getBookingQrCode = async (id) => {
  const booking = await prisma.booking.findUnique({ where: { id: parseInt(id, 10) } });
  if (!booking) throw new HttpError('Booking not found', 404);

  const relativePath = await generateQrCodeFile(booking.bookingNumber, booking.bookingNumber);
  return { booking, relativePath };
};

const getBookingsByUserPhone = async (phone) => {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return [];
  return prisma.booking.findMany({
    where: { userId: user.id },
    include: { slot: true },
    orderBy: { createdAt: 'desc' }
  });
};

module.exports = {
  createBooking,
  listBookings,
  listBookingsForExport,
  getBookingById,
  updateBooking,
  cancelBooking,
  completeBooking,
  getBookingQrCode,
  getBookingsByUserPhone
};
