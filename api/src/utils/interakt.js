const https = require('https');

const INTERAKT_BASE_URL = process.env.INTERAKT_BASE_URL || 'https://api.interakt.ai';
const INTERAKT_MESSAGE_PATH = process.env.INTERAKT_MESSAGE_PATH || '/v1/public/message/';
const INTERAKT_API_KEY = process.env.INTERAKT_API_KEY || '';
const INTERAKT_COUNTRY_CODE = String(process.env.INTERAKT_COUNTRY_CODE || '91').replace(/\D/g, '');

const INTERAKT_ABANDONED_CART_TEMPLATE = process.env.INTERAKT_ABANDONED_CART_TEMPLATE || '';
const INTERAKT_ORDER_PLACED_PREPAID_TEMPLATE = process.env.INTERAKT_ORDER_PLACED_PREPAID_TEMPLATE || '';
const INTERAKT_ORDER_PLACED_COD_TEMPLATE = process.env.INTERAKT_ORDER_PLACED_COD_TEMPLATE || '';
const INTERAKT_DELIVERY_TEMPLATE = process.env.INTERAKT_DELIVERY_TEMPLATE || '';

const sanitizePhoneNumber = (value) => String(value || '').replace(/\D/g, '');

const normalizePhoneForInterakt = (phoneNumber, countryCode = INTERAKT_COUNTRY_CODE) => {
  const digits = sanitizePhoneNumber(phoneNumber);
  const cc = sanitizePhoneNumber(countryCode);

  if (!digits || !cc) return digits;
  if (digits.startsWith(cc) && digits.length > 10) {
    return digits.slice(cc.length);
  }
  return digits;
};

const isInteraktConfigured = () => Boolean(INTERAKT_API_KEY);

const sendInteraktTemplateMessage = async ({
  phoneNumber,
  templateName,
  bodyValues = [],
  countryCode = INTERAKT_COUNTRY_CODE
}) => {
  if (!isInteraktConfigured()) {
    return { skipped: true, reason: 'INTERAKT_API_KEY is not configured' };
  }
  if (!templateName) {
    return { skipped: true, reason: 'Template name is not configured' };
  }

  const mobile = normalizePhoneForInterakt(phoneNumber, countryCode);
  if (!mobile) {
    return { skipped: true, reason: 'Phone number is missing' };
  }

  const payload = JSON.stringify({
    countryCode: `+${sanitizePhoneNumber(countryCode || INTERAKT_COUNTRY_CODE) || '91'}`,
    phoneNumber: mobile,
    callbackData: 'papas-api',
    type: 'Template',
    template: {
      name: templateName,
      languageCode: 'en',
      bodyValues
    }
  });

  const url = new URL(INTERAKT_BASE_URL);
  const options = {
    hostname: url.hostname,
    path: INTERAKT_MESSAGE_PATH,
    method: 'POST',
    protocol: url.protocol,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    headers: {
      Authorization: `Basic ${INTERAKT_API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        if (!ok) {
          return reject(new Error(`Interakt request failed: ${res.statusCode} ${responseBody}`));
        }
        try {
          return resolve(responseBody ? JSON.parse(responseBody) : {});
        } catch (_) {
          return resolve({ raw: responseBody });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
};

const sendAbandonedCartMessage = async ({ phoneNumber, userName = '', cartItems = 0 }) => {
  return sendInteraktTemplateMessage({
    phoneNumber,
    templateName: INTERAKT_ABANDONED_CART_TEMPLATE,
    bodyValues: [userName || 'Customer', String(cartItems || 0)]
  });
};

const sendOrderPlacedMessage = async ({
  phoneNumber,
  orderId,
  paymentMode,
  totalAmount
}) => {
  const isCod = String(paymentMode || '').toUpperCase() === 'COD';
  const templateName = isCod ? INTERAKT_ORDER_PLACED_COD_TEMPLATE : INTERAKT_ORDER_PLACED_PREPAID_TEMPLATE;
  return sendInteraktTemplateMessage({
    phoneNumber,
    templateName,
    bodyValues: [String(orderId || ''), String(totalAmount || '')]
  });
};

const sendDeliveryMessage = async ({ phoneNumber, orderId }) => {
  return sendInteraktTemplateMessage({
    phoneNumber,
    templateName: INTERAKT_DELIVERY_TEMPLATE,
    bodyValues: [String(orderId || '')]
  });
};

module.exports = {
  sendAbandonedCartMessage,
  sendOrderPlacedMessage,
  sendDeliveryMessage
};
