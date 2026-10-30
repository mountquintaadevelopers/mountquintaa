const BOOKING_NUMBER_PREFIX = 'BK-';
const BOOKING_NUMBER_PAD = 6;

// Caller must run this inside the same transaction that creates the Booking,
// and should retry on a unique constraint error (P2002) since the count-based
// number can collide under concurrent inserts across different slots.
const generateBookingNumber = async (tx) => {
  const count = await tx.booking.count();
  return `${BOOKING_NUMBER_PREFIX}${String(count + 1).padStart(BOOKING_NUMBER_PAD, '0')}`;
};

module.exports = { generateBookingNumber };
