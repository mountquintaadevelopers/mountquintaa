const asyncHandler = require('../utils/asyncHandler');
const whatsappService = require('../services/whatsapp.service');
const bookingService = require('../services/booking.service');
const slotService = require('../services/slot.service');
const settingsService = require('../services/settings.service');
const {
  FlowEndpointError,
  decryptFlowRequest,
  encryptFlowResponse,
  verifyFlowSignature
} = require('../utils/whatsappFlowCrypto');

const DETAILS_SCREEN = 'DETAILS';

const slotsForDropdown = async (date, type) => {
  const slots = await slotService.getAvailableSlots({ date, type: type || 'SITE_VISIT' });
  return slots.map((slot) => ({
    id: String(slot.id),
    title: `${slot.startTime} - ${slot.endTime} (${slot.remaining} left)`
  }));
};

// Handles Meta's encrypted request/response protocol for WhatsApp Flows
// ("data exchange" endpoint set in WhatsApp Manager > Flows > Endpoint).
exports.flowDataExchange = asyncHandler(async (req, res) => {
  const privateKey = process.env.WHATSAPP_FLOW_PRIVATE_KEY;
  if (!privateKey) {
    return res.status(500).send('WHATSAPP_FLOW_PRIVATE_KEY is not configured');
  }

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const signatureHeader = req.headers['x-hub-signature-256'];
    const valid = verifyFlowSignature(req.rawBody, signatureHeader, appSecret);
    if (!valid) {
      return res.status(432).send();
    }
  }

  let decryptedBody, aesKey, ivBuffer;
  try {
    ({ decryptedBody, aesKey, ivBuffer } = decryptFlowRequest(
      req.body,
      privateKey,
      process.env.WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE
    ));
  } catch (err) {
    if (err instanceof FlowEndpointError) {
      return res.status(err.statusCode).send(err.message);
    }
    throw err;
  }

  const { action, data = {}, version } = decryptedBody;
  let responseObj;

  if (action === 'ping') {
    responseObj = { version, data: { status: 'active' } };
  } else if (action === 'INIT') {
    responseObj = { version, screen: DETAILS_SCREEN, data: { slots: [] } };
  } else if (action === 'data_exchange' && data.trigger === 'visit_date_selected') {
    const slots = await slotsForDropdown(data.date, data.type);
    responseObj = { version, screen: DETAILS_SCREEN, data: { slots } };
  } else if (action === 'data_exchange') {
    responseObj = { version, screen: DETAILS_SCREEN, data: { slots: [] } };
  } else {
    return res.status(400).send('Unhandled action');
  }

  const encrypted = encryptFlowResponse(responseObj, aesKey, ivBuffer);
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(encrypted);
});

// Public-facing (no JWT): consumed by the WhatsApp chatbot/provider.
exports.webhook = asyncHandler(async (req, res) => {
  const result = await whatsappService.handleWebhookEvent(req.body);
  res.json({ success: true, ...result });
});

exports.verifyWebhook = (req, res) => {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (verifyToken && mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ success: false, message: 'Webhook verification failed' });
};

exports.upsertUser = asyncHandler(async (req, res) => {
  const data = await whatsappService.upsertWhatsappUser(req.body);
  res.status(201).json({ success: true, data });
});

exports.getUserByPhone = asyncHandler(async (req, res) => {
  const data = await whatsappService.getWhatsappUserByPhone(req.params.phone);
  res.json({ success: true, data });
});

exports.getUserBookingsByPhone = asyncHandler(async (req, res) => {
  const data = await bookingService.getBookingsByUserPhone(req.params.phone);
  res.json({ success: true, data });
});

exports.getBookingSettings = asyncHandler(async (req, res) => {
  const data = await settingsService.getBookingSettings();
  res.json({ success: true, data });
});

exports.getSlots = asyncHandler(async (req, res) => {
  const { date, type } = req.query;
  const data = await slotService.getAvailableSlots({ date, type });
  res.json({ success: true, data });
});

exports.createBooking = asyncHandler(async (req, res) => {
  const data = await bookingService.createBooking(req.body);
  res.status(201).json({ success: true, data });
});

// Admin-facing (JWT required): manage WhatsApp user logs.
exports.listUsers = asyncHandler(async (req, res) => {
  const { data, pagination } = await whatsappService.listWhatsappUsers(req.query);
  res.json({ success: true, data, pagination });
});

exports.getUserById = asyncHandler(async (req, res) => {
  const data = await whatsappService.getWhatsappUserById(req.params.id);
  res.json({ success: true, data });
});

exports.getUserBookingsById = asyncHandler(async (req, res) => {
  const user = await whatsappService.getWhatsappUserById(req.params.id);
  const data = await bookingService.getBookingsByUserPhone(user.phone);
  res.json({ success: true, data });
});
