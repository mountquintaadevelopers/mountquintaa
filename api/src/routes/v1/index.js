const express = require("express");
const router = express.Router();
const userRoutes = require("./user.routes");
const contactRoutes = require("./contact.routes");
const bookingSettingsRoutes = require("./booking-settings.routes");
const slotRoutes = require("./slot.routes");
const bookingRoutes = require("./booking.routes");
const whatsappRoutes = require("./whatsapp.routes");
const scannerRoutes = require("./scanner.routes");
const adminRoutes = require("./admin");
const seoRoutes = require("./seo.routes");

router.use("/users", userRoutes);
router.use("/contact", contactRoutes);
router.use("/booking-settings", bookingSettingsRoutes);
router.use("/slots", slotRoutes);
router.use("/bookings", bookingRoutes);
router.use("/whatsapp", whatsappRoutes);
router.use("/scanner", scannerRoutes);
router.use("/admin", adminRoutes);
router.use("/seo", seoRoutes);

module.exports = router;
