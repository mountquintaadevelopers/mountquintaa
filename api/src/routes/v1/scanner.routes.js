const express = require('express');
const router = express.Router();
const scannerController = require('../../controllers/scanner.controller');
const auth = require('../../middleware/auth');
const requireRole = require('../../middleware/role');

router.use(auth, requireRole('ADMIN', 'SCANNER'));

router.post('/bookings/scan', scannerController.scanBooking);

module.exports = router;
