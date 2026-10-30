const asyncHandler = require('../utils/asyncHandler');
const scannerService = require('../services/scanner.service');

exports.scanBooking = asyncHandler(async (req, res) => {
  const { bookingNumber } = req.body;
  const { alreadyScanned, booking } = await scannerService.scanBooking({
    bookingNumber,
    scannedById: req.user.id
  });

  if (alreadyScanned) {
    return res.json({
      success: false,
      message: 'Booking has already been scanned.',
      data: {
        scannedAt: booking.scannedAt,
        scannedBy: booking.scannedBy ? booking.scannedBy.name : null
      }
    });
  }

  res.json({ success: true, data: booking });
});
