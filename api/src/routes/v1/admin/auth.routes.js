const express = require('express');
const router = express.Router();
const adminController = require('../../../controllers/admin.controller');

// PUBLIC — no JWT possible before login.
router.post('/login', adminController.login);

module.exports = router;
