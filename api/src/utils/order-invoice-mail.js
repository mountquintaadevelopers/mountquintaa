const nodemailer = require('nodemailer');
const { chromium } = require('playwright');
const path = require('path');

const DEFAULT_SMTP_HOST = process.env.ORDER_SMTP_HOST || 'smtp.gmail.com';
const DEFAULT_SMTP_PORT = Number(process.env.ORDER_SMTP_PORT || 465);
const ORDER_SMTP_USER = process.env.ORDER_SMTP_USER || 'papaslifeline.in@gmail.com';
const ORDER_SMTP_PASS = process.env.ORDER_SMTP_PASS || process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '';
const ORDER_MAIL_TEMPLATE_PATH = path.join(__dirname, 'order-mail.js');

function formatCurrency (amount) {
  return `₹ ${Number(amount || 0).toFixed(2)}`;
}

function applyItemsLoop (template, items, baseUrl) {
  const loopRegex = /<!-- ITEMS_LOOP_START -->([\s\S]*?)<!-- ITEMS_LOOP_END -->/;
  const match = template.match(loopRegex);
  if (!match) return template;

  const itemBlockTemplate = match[1];
  const safeItems = items && items.length ? items : [{}];
  const renderedItems = safeItems.map((item) => {
    const productImageUrl = item.product?.images?.[0]?.photoUrl || '';
    const itemName = item.product?.name || item.product_name || 'Order Item';
    const itemVariant = '';
    const itemQty = String(Number(item.quantity || 0) || 1);
    return itemBlockTemplate
      .replaceAll('{{PRODUCT_IMAGE_URL}}', `${baseUrl}${productImageUrl}`)
      .replaceAll('{{ITEM_NAME}}', itemName)
      .replaceAll('{{ITEM_VARIANT}}', itemVariant)
      .replaceAll('{{ITEM_QTY}}', itemQty);
  }).join('');

  return template.replace(loopRegex, renderedItems);
}

async function buildOrderSuccessEmailHtml (order) {
  delete require.cache[require.resolve(ORDER_MAIL_TEMPLATE_PATH)];
  let template = require(ORDER_MAIL_TEMPLATE_PATH);
  const customerName = order.user?.name || order.users?.name || 'Customer';
  const orderDate = new Date(order.createdAt || order.created_at || Date.now()).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const baseUrl = process.env.BASE_URL || 'https://api-papas.wodo.digital/uploads/products/';
  const orderId = String(order.id || order.order_number || order.orderNumber || '');
  const totalAmount = Number(order.totalAmount || order.total_amount || 0);
  const subtotalAmount = Number(order.subtotal || 0);
  const couponDiscount = Number(order.discountAmount || order.discount_amount || 0);
  const pawPointsDiscount = Number(order.pawPointsDiscount || order.paw_points_discount || 0);
  const discountAmount = Math.round((couponDiscount + pawPointsDiscount) * 100) / 100;
  template = applyItemsLoop(template, order.items || [], baseUrl);
  const { delivery, billing } = getMailAddresses(order);
  const paymentMethod = order.payment?.paymentId ? `RAZORPAY - ${order.payment.paymentId}` : 'Online Payment';
  const deliveryMethod = 'Standard Delivery';

  return template
    .replaceAll('{{CUSTOMER_NAME}}', customerName)
    .replaceAll('{{ORDER_DATE}}', orderDate)
    .replaceAll('{{ORDER_ID}}', orderId)
    .replaceAll('{{SUBTOTAL}}', formatCurrency(subtotalAmount))
    .replaceAll('{{DISCOUNT}}', formatCurrency(discountAmount))
    .replaceAll('{{TOTAL}}', formatCurrency(totalAmount))
    .replaceAll('{{DELIVERY_ADDRESS_NAME}}', delivery.name)
    .replaceAll('{{DELIVERY_ADDRESS_LINE_1}}', delivery.line1)
    .replaceAll('{{BILLING_ADDRESS_NAME}}', billing.name)
    .replaceAll('{{BILLING_ADDRESS_LINE_1}}', billing.line1)
    .replaceAll('{{DELIVERY_METHOD}}', deliveryMethod)
    .replaceAll('{{PAYMENT_METHOD}}', paymentMethod);
}

function amountInWords (amount) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convert (n) {
    if (n === 0) return '';
    if (n < 20) return `${ones[n]} `;
    if (n < 100) return `${tens[Math.floor(n / 10)]} ${ones[n % 10]} `;
    if (n < 1000) return `${ones[Math.floor(n / 100)]} Hundred ${convert(n % 100)}`;
    if (n < 100000) return `${convert(Math.floor(n / 1000))}Thousand ${convert(n % 1000)}`;
    if (n < 10000000) return `${convert(Math.floor(n / 100000))}Lakh ${convert(n % 100000)}`;
    return `${convert(Math.floor(n / 10000000))}Crore ${convert(n % 10000000)}`;
  }

  const value = Number(amount || 0);
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);
  let result = convert(rupees).trim();
  if (result === '') result = 'Zero';
  result += ' Rupees';
  if (paise > 0) result += ` and ${convert(paise).trim()} Paise`;
  result += ' Only';
  return result;
}

function getAddressParts (order) {
  const shipping = order.shipping_details || order.shippingDetails || null;
  const delivery = order.deliveryAddress?.address || order.deliveryAddress?.lable || '';
  const fullAddress = shipping?.addressLine || shipping?.address || delivery || 'N/A';
  return { fullAddress };
}

function getMailAddresses (order) {
  const customerName = order.user?.name || order.users?.name || 'Customer';
  const { fullAddress } = getAddressParts(order);

  return {
    delivery: {
      name: customerName,
      line1: fullAddress || 'N/A',
    },
    billing: {
      name: customerName,
      line1: fullAddress || 'N/A',
    }
  };
}

function buildInvoiceHtml (order) {
  const orderDate = new Date(order.createdAt || order.created_at || Date.now()).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const customerName = order.user?.name || order.users?.name || 'Customer';
  const orderNumber = order.order_number || order.orderNumber || order.id;
  const { fullAddress } = getAddressParts(order);
  const subtotal = Number(order.subtotal || 0);
  const couponDiscount = Number(order.discountAmount || order.discount_amount || 0);
  const pawPointsDiscount = Number(order.pawPointsDiscount || order.paw_points_discount || 0);
  const discountAmount = Math.round((couponDiscount + pawPointsDiscount) * 100) / 100;
  const totalAmount = Number(order.totalAmount || order.total_amount || 0);

  let itemTables = '';
  for (const item of (order.items || [])) {
    const name = item.product?.name || item.product_name || `Product #${item.pid}`;
    const qty = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || item.price || 0);
    const lineTotal = Number(item.lineTotal || (qty * unitPrice));
    itemTables += `
      <table style="width:100%;font-size:11px;border-bottom:1px solid #e4e7ec;">
        <tr>
          <td style="width:50%;padding:7px 0;">${name}</td>
          <td style="width:15%;text-align:right;padding:7px 0;" class="mono">${formatCurrency(unitPrice)}</td>
          <td style="width:15%;text-align:right;padding:7px 0;" class="mono">${qty}</td>
          <td style="width:20%;text-align:right;padding:7px 0;" class="mono">${formatCurrency(lineTotal)}</td>
        </tr>
      </table>
    `;
  }

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Roboto+Mono:wght@400&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Inter', sans-serif; font-size: 12px; margin: 0; padding: 0; color: #1a1a1a; }
          table { border-collapse: collapse; }
          .mono { font-family: 'Roboto Mono', monospace; }
        </style>
      </head>
      <body>
        <table style="width:100%;">
          <tr>
            <td style="width:13%;vertical-align:top;padding-top:4px;"><img style="width:65px;" src="https://demo.wodo.digital/assets/logos/papas-logo.png"/></td>
            <td style="width:87%;">
              <div style="font-size:18px;font-weight:600;line-height:1.2;">Papa's Lifeline Pvt Ltd</div>
              <div style="font-size:11px;padding:4px 0 2px;line-height:17px;color:#444;">Papa's Life Line Veterinary Hospital, Induleela, 1610/52, 40th cross, 18th Main Rd, 4th T Block East, Jayanagar, Bengaluru, Karnataka 560041</div>
              <div style="font-size:11px;color:#444;">
                <span style="font-weight:600;">Mobile:</span> +91 7349450915
              </div>
            </td>
          </tr>
        </table>

        <table style="width:100%;margin-top:20px;border-top:5px solid #000000;background-color:#e5e5e5;padding:10px 8px;font-size:12px;">
          <tr>
            <td>
              <span style="font-weight:600;">Order No.&nbsp;:</span> &nbsp;<span class="mono">${orderNumber}</span>
            </td>
            <td style="text-align:right;">
              <span style="font-weight:600;">Order Date&nbsp;:</span> &nbsp;${orderDate}
            </td>
          </tr>
        </table>

        <table style="width:100%;margin-top:10px;">
          <tr>
            <td style="font-size:11px;font-weight:600;padding-bottom:3px;">BILL TO</td>
            <td style="font-size:11px;font-weight:600;padding-bottom:3px;">SHIP TO</td>
          </tr>
          <tr>
            <td style="font-weight:600;font-size:11px;">${customerName}</td>
            <td style="font-weight:600;font-size:11px;">${customerName}</td>
          </tr>
          <tr>
            <td style="color:#444;font-size:11px;">${fullAddress}</td>
            <td style="color:#444;font-size:11px;">${fullAddress}</td>
          </tr>
        
        </table>

        <table style="margin:10px 0 6px 0;width:100%;border-top:1px solid #000000;padding:7px 0;border-bottom:1px solid #000000;font-size:11px;">
          <tr>
            <td style="width:50%;font-weight:600;">ITEMS</td>
            <td style="width:15%;text-align:right;font-weight:600;">PRICE</td>
            <td style="width:15%;text-align:right;font-weight:600;">QTY.</td>
            <td style="width:20%;text-align:right;font-weight:600;">AMOUNT</td>
          </tr>
        </table>

        ${itemTables}

        <table style="width:100%;margin-top:10px;border-top:1px solid #000000;padding:7px 0;border-bottom:1px solid #000000;font-size:11px;">
          <tr>
            <td style="width:50%;font-weight:600;">SUBTOTAL</td>
            <td style="text-align:right;width:15%;">&nbsp;</td>
            <td style="text-align:right;width:15%;">&nbsp;</td>
            <td style="text-align:right;width:20%;font-weight:600;" class="mono">${formatCurrency(subtotal)}</td>
          </tr>
        </table>

        <table style="width:100%;">
          <tr style="height:14px;"><td></td></tr>
          <tr>
            <td style="width:60%;vertical-align:top;">
              <table style="width:100%;">
                <tr><td style="font-weight:600;font-size:11px;">Total Amount (in words)</td></tr>
                <tr><td style="font-size:10px;color:#444;padding-top:2px;">${amountInWords(totalAmount)}</td></tr>
              </table>
            </td>
            <td style="width:40%;vertical-align:top;">
              <table style="width:100%;">
                <tr>
                  <td>
                    <table style="width:100%;border-bottom:1px solid #000000;">
                      <tr>
                        <td style="padding:4px 0;font-size:10px;">DISCOUNT AMOUNT</td>
                        <td style="text-align:right;padding:4px 7px 4px 0;font-size:10px;" class="mono">${formatCurrency(discountAmount)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table style="width:100%;border-bottom:1px solid #000000;">
                      <tr>
                        <td style="font-weight:600;padding:4px 0;font-size:14px;">TOTAL AMOUNT</td>
                        <td style="text-align:right;padding:4px 7px 4px 0;font-weight:600;font-size:14px;" class="mono">${formatCurrency(totalAmount)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr style="height:16px;"><td></td></tr>
          <tr>
            <td style="vertical-align:top;">
              <div style="font-weight:600;font-size:11px;">TERMS AND CONDITIONS</div>
              <ol style="font-size:10px;margin:4px 0;padding-left:16px;color:#444;line-height:17px;">
                <li>Items once sold will not be taken back or exchanged</li>
                <li>All disputes are subject to Bengaluru jurisdiction only</li>
              </ol>
            </td>
            <td style="text-align:right;vertical-align:bottom;">
              <div><img style="width:60px;" src="https://demo.wodo.digital/assets/logos/papas-logo.png"></div>
              <div style="font-weight:600;font-size:11px;margin-top:10px">AUTHORISED SIGNATORY FOR</div>
              <div style="font-size:10px;color:#444;">Papa's Lifeline Pvt Ltd</div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function generateInvoicePdfBuffer (order) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(buildInvoiceHtml(order), { waitUntil: 'networkidle' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '60px', bottom: '40px', left: '30px', right: '30px' },
      displayHeaderFooter: true,
      headerTemplate: `
      <table style="font-size:12px;font-weight:bold;padding-left:30px;width:100%;">
        <tr>
          <td>BILL OF SUPPLY</td>
          <td style="font-size:11px;color:#555;text-align:right;padding:1px;border:none;">
            ORIGINAL FOR RECIPIENT
          </td>
        </tr>
      </table>`,
      footerTemplate: `
      <div style="font-size:10px;width:100%;text-align:center;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>`
    });
  } finally {
    await browser.close();
  }
}

async function sendOrderSuccessEmail (order) {
  if (!order?.user?.email) return;
  if (!ORDER_SMTP_PASS) {
    console.warn('Skipping order email: ORDER_SMTP_PASS/SMTP_PASS is not configured');
    return;
  }

  const pdfBuffer = await generateInvoicePdfBuffer(order);
  const emailHtml = await buildOrderSuccessEmailHtml(order);
  const transporter = nodemailer.createTransport({
    host: DEFAULT_SMTP_HOST,
    port: DEFAULT_SMTP_PORT,
    secure: DEFAULT_SMTP_PORT === 465,
    auth: {
      user: ORDER_SMTP_USER,
      pass: ORDER_SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: ORDER_SMTP_USER,
    to: order.user.email,
    subject: `Your Papa's Lifeline order #${order.id} is confirmed`,
    html: emailHtml,
    attachments: [
      {
        filename: `invoice-order-${order.id}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  });
}

module.exports = {
  sendOrderSuccessEmail,
  generateInvoicePdfBuffer
};
