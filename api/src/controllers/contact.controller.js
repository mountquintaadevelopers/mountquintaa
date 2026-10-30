const asyncHandler = require('../utils/asyncHandler');
const contactService = require('../services/contact.service');

exports.createContact = asyncHandler(async (req, res) => {
  const contact = await contactService.createContact(req.body, { ipAddress: req.ip });
  res.status(201).json({ success: true, data: contact });
});

exports.listContacts = asyncHandler(async (req, res) => {
  const { data, pagination } = await contactService.listContacts(req.query);
  res.json({ success: true, data, pagination });
});

exports.getContact = asyncHandler(async (req, res) => {
  const contact = await contactService.getContact(req.params.id);
  res.json({ success: true, data: contact });
});

exports.updateContact = asyncHandler(async (req, res) => {
  const contact = await contactService.updateContact(req.params.id, req.body);
  res.json({ success: true, data: contact });
});
