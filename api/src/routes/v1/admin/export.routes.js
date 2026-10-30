const express = require('express');
const router = express.Router();
const exportController = require('../../../controllers/export.controller');
const auth = require('../../../middleware/auth');
const requireRole = require('../../../middleware/role');

router.use(auth, requireRole('ADMIN'));

router.get('/bookings', exportController.exportBookings);
router.get('/contacts', exportController.exportContacts);
router.get('/whatsapp-users', exportController.exportWhatsappUsers);

module.exports = router;
