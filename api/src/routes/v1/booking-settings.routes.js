const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/admin.controller');

// PUBLIC — website uses this to decide which booking options to show.
router.get('/', adminController.getBookingSettings);

module.exports = router;
