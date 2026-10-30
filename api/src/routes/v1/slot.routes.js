const express = require('express');
const router = express.Router();
const slotController = require('../../controllers/slot.controller');

// PUBLIC
router.get('/available', slotController.getAvailableSlots);

module.exports = router;
