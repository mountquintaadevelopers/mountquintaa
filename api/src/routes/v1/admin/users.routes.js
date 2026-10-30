const express = require('express');
const router = express.Router();
const adminController = require('../../../controllers/admin.controller');
const auth = require('../../../middleware/auth');
const requireRole = require('../../../middleware/role');

// Admin/scanner account management — ADMIN only.
router.use(auth, requireRole('ADMIN'));

router.get('/', adminController.listAdminUsers);
router.post('/', adminController.createAdminUser);
router.patch('/:id', adminController.updateAdminUser);
router.delete('/:id', adminController.deleteAdminUser);

module.exports = router;
