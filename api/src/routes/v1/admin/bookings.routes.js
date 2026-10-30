const express = require('express');
const router = express.Router();
const bookingController = require('../../../controllers/booking.controller');
const auth = require('../../../middleware/auth');
const requireRole = require('../../../middleware/role');

router.use(auth, requireRole('ADMIN','SCANNER'));

router.get('/', bookingController.listBookings);
router.get('/:id', bookingController.getBookingById);
router.patch('/:id', bookingController.updateBooking);
router.patch('/:id/cancel', bookingController.cancelBooking);
router.patch('/:id/complete', bookingController.completeBooking);

module.exports = router;
