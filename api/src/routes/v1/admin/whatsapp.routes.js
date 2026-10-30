const express = require('express');
const router = express.Router();
const whatsappController = require('../../../controllers/whatsapp.controller');
const auth = require('../../../middleware/auth');
const requireRole = require('../../../middleware/role');

router.use(auth, requireRole('ADMIN'));

router.get('/users', whatsappController.listUsers);
router.get('/users/:id', whatsappController.getUserById);
router.get('/users/:id/bookings', whatsappController.getUserBookingsById);

module.exports = router;
