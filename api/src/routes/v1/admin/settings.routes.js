const express = require('express');
const router = express.Router();
const adminController = require('../../../controllers/admin.controller');
const auth = require('../../../middleware/auth');
const requireRole = require('../../../middleware/role');

router.use(auth, requireRole('ADMIN'));

router.get('/booking', adminController.getBookingSettings);
router.patch('/booking', adminController.updateBookingSettings);

module.exports = router;
