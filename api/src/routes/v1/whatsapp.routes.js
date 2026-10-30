const express = require('express');
const router = express.Router();
const whatsappController = require('../../controllers/whatsapp.controller');

// All routes here are PUBLIC — no admin JWT. The WhatsApp provider cannot send it.
router.get('/webhook', whatsappController.verifyWebhook);
router.post('/webhook', whatsappController.webhook);

router.post('/flow/data-exchange', whatsappController.flowDataExchange);

router.post('/users', whatsappController.upsertUser);
router.get('/users/:phone', whatsappController.getUserByPhone);
router.get('/users/:phone/bookings', whatsappController.getUserBookingsByPhone);

router.get('/booking-settings', whatsappController.getBookingSettings);
router.get('/slots', whatsappController.getSlots);
router.post('/bookings', whatsappController.createBooking);

module.exports = router;
