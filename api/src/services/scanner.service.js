const prisma = require('../prisma');
const HttpError = require('../utils/http-error');

const SCANNED_BY_SELECT = { id: true, name: true, email: true, role: true };

const scanBooking = async ({ bookingNumber, scannedById }) => {
  if (!bookingNumber) throw new HttpError('bookingNumber is required', 400);

  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { bookingNumber },
      include: { user: true, slot: true, scannedBy: { select: SCANNED_BY_SELECT } }
    });
    if (!booking) throw new HttpError('Booking not found', 404);
    if (booking.status === 'CANCELLED') {
      throw new HttpError('Booking has been cancelled and cannot be scanned.', 400);
    }
    if (booking.scannedAt) {
      return { alreadyScanned: true, booking };
    }

    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { scannedAt: new Date(), scannedById },
      include: { user: true, slot: true, scannedBy: { select: SCANNED_BY_SELECT } }
    });
    return { alreadyScanned: false, booking: updated };
  });
};

module.exports = { scanBooking };
