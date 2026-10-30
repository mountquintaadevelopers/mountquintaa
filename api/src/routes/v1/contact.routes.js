const express = require('express');
const router = express.Router();
const contactController = require('../../controllers/contact.controller');
const auth = require('../../middleware/auth');
const requireRole = require('../../middleware/role');

// PUBLIC
router.post('/', contactController.createContact);

// ADMIN JWT required (data endpoint, not a public listing)
router.get('/', auth, requireRole('ADMIN'), contactController.listContacts);
router.get('/:id', auth, requireRole('ADMIN'), contactController.getContact);
router.patch('/:id', auth, requireRole('ADMIN'), contactController.updateContact);

module.exports = router;