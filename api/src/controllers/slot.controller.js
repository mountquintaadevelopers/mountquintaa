const asyncHandler = require('../utils/asyncHandler');
const slotService = require('../services/slot.service');

exports.getAvailableSlots = asyncHandler(async (req, res) => {
  const { date, type } = req.query;
  const data = await slotService.getAvailableSlots({ date, type });
  res.json({ success: true, data });
});

exports.listSlots = asyncHandler(async (req, res) => {
  const { data, pagination } = await slotService.listSlotsAdmin(req.query);
  res.json({ success: true, data, pagination });
});

exports.getSlotById = asyncHandler(async (req, res) => {
  const data = await slotService.getSlotById(req.params.id);
  res.json({ success: true, data });
});

exports.createSlot = asyncHandler(async (req, res) => {
  const data = await slotService.createSlot(req.body);
  res.status(201).json({ success: true, data });
});

exports.updateSlot = asyncHandler(async (req, res) => {
  const data = await slotService.updateSlot(req.params.id, req.body);
  res.json({ success: true, data });
});

exports.deleteSlot = asyncHandler(async (req, res) => {
  const result = await slotService.deleteSlot(req.params.id);
  res.json({
    success: true,
    message: result.softDeleted ? 'Slot has bookings; disabled instead of deleted.' : 'Slot deleted.',
    data: result.slot || null
  });
});
