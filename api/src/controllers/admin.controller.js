const asyncHandler = require('../utils/asyncHandler');
const adminService = require('../services/admin.service');
const settingsService = require('../services/settings.service');

exports.login = asyncHandler(async (req, res) => {
  const { token, user } = await adminService.login(req.body);
  res.json({ success: true, token, user });
});

exports.getBookingSettings = asyncHandler(async (req, res) => {
  const data = await settingsService.getBookingSettings();
  res.json({ success: true, data });
});

exports.updateBookingSettings = asyncHandler(async (req, res) => {
  const data = await settingsService.updateBookingSettings(req.body);
  res.json({ success: true, data });
});

exports.listAdminUsers = asyncHandler(async (req, res) => {
  const { data, pagination } = await adminService.listAdminUsers(req.query);
  res.json({ success: true, data, pagination });
});

exports.createAdminUser = asyncHandler(async (req, res) => {
  const data = await adminService.createAdminUser(req.body);
  res.status(201).json({ success: true, data });
});

exports.updateAdminUser = asyncHandler(async (req, res) => {
  const data = await adminService.updateAdminUser(req.params.id, req.body);
  res.json({ success: true, data });
});

exports.deleteAdminUser = asyncHandler(async (req, res) => {
  await adminService.deleteAdminUser(req.params.id);
  res.json({ success: true, message: 'Admin/scanner user deleted.' });
});
