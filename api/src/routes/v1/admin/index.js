const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const slotsRoutes = require('./slots.routes');
const bookingsRoutes = require('./bookings.routes');
const settingsRoutes = require('./settings.routes');
const whatsappRoutes = require('./whatsapp.routes');
const usersRoutes = require('./users.routes');
const exportRoutes = require('./export.routes');
const seoRoutes = require('./seo.routes');

router.use('/auth', authRoutes);
router.use('/slots', slotsRoutes);
router.use('/bookings', bookingsRoutes);
router.use('/settings', settingsRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/users', usersRoutes);
router.use('/export', exportRoutes);
router.use('/seo', seoRoutes);

module.exports = router;
