const crypto = require('crypto');

describe('razorpay verifyPaymentSignature', () => {
  const { verifyPaymentSignature } = require('./razorpay');

  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = 'unit_test_secret';
  });

  it('accepts a valid HMAC', () => {
    const orderId = 'order_abc';
    const payId = 'pay_xyz';
    const sig = crypto
      .createHmac('sha256', 'unit_test_secret')
      .update(`${orderId}|${payId}`)
      .digest('hex');
    expect(verifyPaymentSignature(orderId, payId, sig)).toBe(true);
  });

  it('rejects wrong signature', () => {
    expect(verifyPaymentSignature('o1', 'p1', '0'.repeat(64))).toBe(false);
  });
});
