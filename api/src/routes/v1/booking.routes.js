const express = require('express');
const router = express.Router();
const bookingController = require('../../controllers/booking.controller');

// PUBLIC
router.post('/', bookingController.createBooking);
router.get('/:id/qrcode', bookingController.getBookingQrCode);
router.put('/:id', bookingController.updateBooking);

module.exports = router;
