const express = require('express');
const router = express.Router();
const slotController = require('../../../controllers/slot.controller');
const auth = require('../../../middleware/auth');
const requireRole = require('../../../middleware/role');

router.use(auth, requireRole('ADMIN'));

router.get('/', slotController.listSlots);
router.get('/:id', slotController.getSlotById);
router.post('/', slotController.createSlot);
router.patch('/:id', slotController.updateSlot);
router.delete('/:id', slotController.deleteSlot);

module.exports = router;
