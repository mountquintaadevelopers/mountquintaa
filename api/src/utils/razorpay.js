const crypto = require('crypto');
const axios = require('axios');

const RAZORPAY_API = 'https://api.razorpay.com/v1';

function getAuthHeader () {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set');
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

/**
 * @param {{ amountPaise: number, receipt: string, notes?: Record<string, string> }} opts
 */
async function createRazorpayOrder ({ amountPaise, receipt, notes = {} }) {
  const receiptSafe = String(receipt).slice(0, 40);
  const { data } = await axios.post(
    `${RAZORPAY_API}/orders`,
    {
      amount: amountPaise,
      currency: 'INR',
      receipt: receiptSafe,
      notes
    },
    {
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json'
      }
    }
  );
  return data;
}

function verifyPaymentSignature (razorpayOrderId, razorpayPaymentId, razorpaySignature) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    throw new Error('RAZORPAY_KEY_SECRET must be set');
  }
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
  const sig = String(razorpaySignature);
  if (expected.length !== sig.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(sig, 'utf8'));
  } catch {
    return false;
  }
}

module.exports = {
  createRazorpayOrder,
  verifyPaymentSignature
};
