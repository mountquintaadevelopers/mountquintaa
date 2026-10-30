const asyncHandler = require('../utils/asyncHandler');
const bookingService = require('../services/booking.service');
const { generateQrCodeFile } = require('../utils/qrcode');

// BASE_URL lets this resolve correctly behind a proxy/load balancer; falls back to the request itself.
const buildAbsoluteUrl = (req, relativePath) => {
  const base = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return `${base}/uploads/${relativePath}`;
};

exports.createBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.createBooking(req.body);
  const relativePath = await generateQrCodeFile(booking.bookingNumber, booking.bookingNumber);
  const qrCodeUrl = buildAbsoluteUrl(req, relativePath);

  res.status(201).json({ success: true, data: { ...booking, qrCodeUrl } });
});

exports.listBookings = asyncHandler(async (req, res) => {
  const { data, pagination } = await bookingService.listBookings(req.query);
  res.json({ success: true, data, pagination });
});

exports.getBookingById = asyncHandler(async (req, res) => {
  const data = await bookingService.getBookingById(req.params.id);
  res.json({ success: true, data });
});

exports.updateBooking = asyncHandler(async (req, res) => {
  const data = await bookingService.updateBooking(req.params.id, req.body);
  res.json({ success: true, data });
});

exports.cancelBooking = asyncHandler(async (req, res) => {
  const data = await bookingService.cancelBooking(req.params.id);
  res.json({ success: true, data });
});

exports.completeBooking = asyncHandler(async (req, res) => {
  const data = await bookingService.completeBooking(req.params.id);
  res.json({ success: true, data });
});

exports.getBookingQrCode = asyncHandler(async (req, res) => {
  const { booking, relativePath } = await bookingService.getBookingQrCode(req.params.id);
  const qrCodeUrl = buildAbsoluteUrl(req, relativePath);

  res.json({
    success: true,
    data: {
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      qrCodeUrl
    }
  });
});
