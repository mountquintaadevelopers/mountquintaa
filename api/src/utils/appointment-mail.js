const nodemailer = require('nodemailer');

const DEFAULT_SMTP_HOST = process.env.ORDER_SMTP_HOST || 'smtp.gmail.com';
const DEFAULT_SMTP_PORT = Number(process.env.ORDER_SMTP_PORT || 465);
const ORDER_SMTP_USER = process.env.ORDER_SMTP_USER || 'papaslifeline.in@gmail.com';
const ORDER_SMTP_PASS = process.env.ORDER_SMTP_PASS || process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '';

/** Same header logo as `order-mail.js` */
const APPOINTMENT_LOGO_URL =
  'https://94f443ac-77fc-45f5-ae73-56836caa7677.b-cdn.net/e/5f636431-42e6-42bd-a701-362a89ac4c1a/c1d8d2f5-07ca-4cb1-ac9c-a5f4168025b8.png';

const IST_TZ = 'Asia/Kolkata';

function escapeHtml (s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAppointmentDate (date) {
  return new Date(date).toLocaleString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/** Calendar day (Y/M/D) for the stored instant, in Asia/Kolkata */
function getIstCalendarParts (isoLike) {
  const d = new Date(isoLike);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const get = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** IST wall-clock as UTC instant (IST = UTC+5:30) */
function toUtcFromIstWallClock (year, month, day, hour24, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour24 - 5, minute - 30, 0, 0));
}

function parse12hParts (token) {
  const t = token.trim().toUpperCase().replace(/\s+/g, ' ');
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] != null ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, min };
}

function tryParseTimeToken (s) {
  const u = s.trim().toUpperCase();
  let m = u.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (m) return parse12hParts(`${m[1]}:${m[2]} ${m[3]}`);
  m = u.match(/^(\d{1,2})\s*(AM|PM)$/);
  if (m) return parse12hParts(`${m[1]}:00 ${m[2]}`);
  m = u.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return { h, min };
  }
  return null;
}

/**
 * Parse common slot strings ("10:00 AM - 11:30 AM", "14:00 - 15:00").
 * Defaults to 10:00–11:00 IST on the appointment calendar day if parsing fails.
 */
function parseAppointmentWindowUtc (appointment) {
  const { year, month, day } = getIstCalendarParts(appointment.date);
  const raw = String(appointment.timeslot || '');
  const chunks = raw.split(/\s*[-–—]+\s*|\s+to\s+/i).map((x) => x.trim()).filter(Boolean);

  let start = chunks[0] ? tryParseTimeToken(chunks[0]) : null;
  let end = chunks[1] ? tryParseTimeToken(chunks[1]) : null;

  if (!start) start = { h: 10, min: 0 };
  if (!end) end = { h: start.h + 1, min: start.min };

  let startUtc = toUtcFromIstWallClock(year, month, day, start.h, start.min);
  let endUtc = toUtcFromIstWallClock(year, month, day, end.h, end.min);

  if (endUtc.getTime() <= startUtc.getTime()) {
    endUtc = new Date(startUtc.getTime() + 60 * 60 * 1000);
  }

  return { startUtc, endUtc };
}

function formatGoogleDatesParam (startUtc, endUtc) {
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${fmt(startUtc)}/${fmt(endUtc)}`;
}

function buildGoogleCalendarUrl (appointment) {
  const { startUtc, endUtc } = parseAppointmentWindowUtc(appointment);
  const summary = `Papa's Lifeline — ${appointment.serviceType?.title || 'Appointment'} (#${appointment.id})`;
  const loc = [appointment.branch?.name, appointment.branch?.location].filter(Boolean).join(', ');
  const details = [
    `Pet: ${appointment.MyPet?.name || '—'}`,
    `Service: ${appointment.serviceType?.title || '—'}`,
    `Status: ${appointment.status || '—'}`,
    appointment.problemStatement ? `Notes: ${appointment.problemStatement}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary,
    dates: formatGoogleDatesParam(startUtc, endUtc),
    details,
    location: loc
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildOutlookWebCalendarUrl (appointment) {
  const { startUtc, endUtc } = parseAppointmentWindowUtc(appointment);
  const summary = `Papa's Lifeline — ${appointment.serviceType?.title || 'Appointment'} (#${appointment.id})`;
  const loc = [appointment.branch?.name, appointment.branch?.location].filter(Boolean).join(', ');
  const body = [
    `Pet: ${appointment.MyPet?.name || '—'}`,
    `Time slot: ${appointment.timeslot || '—'}`,
    appointment.problemStatement ? `Notes: ${appointment.problemStatement}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  const params = new URLSearchParams({
    subject: summary,
    startdt: startUtc.toISOString(),
    enddt: endUtc.toISOString(),
    body,
    location: loc
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

function escapeIcsText (s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function buildIcsAttachmentContent (appointment) {
  const { startUtc, endUtc } = parseAppointmentWindowUtc(appointment);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dtStart = startUtc.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dtEnd = endUtc.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const summary = `Papa's Lifeline — ${appointment.serviceType?.title || 'Appointment'} (#${appointment.id})`;
  const location = escapeIcsText([appointment.branch?.name, appointment.branch?.location].filter(Boolean).join(', '));
  const desc = escapeIcsText(
    [
      `Pet: ${appointment.MyPet?.name || '—'}`,
      `Service: ${appointment.serviceType?.title || '—'}`,
      `Time slot: ${appointment.timeslot || '—'}`,
      appointment.problemStatement ? `Notes: ${appointment.problemStatement}` : ''
    ]
      .filter(Boolean)
      .join('\\n')
  );

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Papas Lifeline//Appointment//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:appointment-${appointment.id}@papaslifeline.in`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${location}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

function buildAppointmentEmailHtml (appointment, kind) {
  const customerName = escapeHtml(appointment.user?.name || 'Customer');
  const petName = escapeHtml(appointment.MyPet?.name || 'Your pet');
  const branchName = escapeHtml(appointment.branch?.name || '');
  const branchLocation = escapeHtml(appointment.branch?.location || '');
  const serviceTitle = escapeHtml(appointment.serviceType?.title || 'Service');
  const timeslot = escapeHtml(appointment.timeslot || '—');
  const apptDate = escapeHtml(formatAppointmentDate(appointment.date));
  const status = escapeHtml(appointment.status || '—');
  const problemType = escapeHtml(appointment.problemType || '—');
  const problemStatement = escapeHtml(appointment.problemStatement || '—');
  const heading = kind === 'created' ? 'Appointment confirmed' : 'Appointment updated';
  const intro = kind === 'created'
    ? 'Thank you for booking with us. Here are your appointment details.'
    : 'Your appointment has been updated. Current details are below.';

  const googleCalUrl = buildGoogleCalendarUrl(appointment);
  const outlookCalUrl = buildOutlookWebCalendarUrl(appointment);

  const row = (label, value) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #EEEEEE;font-family:Roboto,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;font-size:14px;color:#777777;width:38%;">${label}</td>
      <td style="padding:8px 0;border-bottom:1px solid #EEEEEE;font-family:Roboto,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;font-size:14px;color:#333333;font-weight:500;">${value}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#242424;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#242424;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#F8F8F8;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="top" style="vertical-align:top;padding-right:12px;">
                    <p style="margin:8px 0 0 0;font-family:Roboto,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;font-size:16px;font-weight:700;color:#333333;">${heading}</p>
                  </td>
                  <td valign="top" align="right" style="width:76px;vertical-align:top;">
                    <img src="${APPOINTMENT_LOGO_URL}" width="69" height="69" alt="Papa's Lifeline" style="display:block;border:0;height:auto;max-width:69px;"/>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 20px 28px;">
              <p style="margin:0;font-family:Roboto,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;font-size:14px;line-height:22px;color:#333333;">Hello ${customerName},</p>
              <p style="margin:12px 0 0 0;font-family:Roboto,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;font-size:14px;line-height:22px;color:#333333;">${intro}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 24px 28px;">
              <p style="margin:0 0 12px 0;font-family:Roboto,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;font-size:14px;font-weight:700;color:#333333;">Reminder — add to your calendar</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
                <tr>
                  <td style="background-color:#037DE2;text-align:center;line-height:24px;padding:12px 24px;border-radius:44px;">
                    <a href="${escapeHtml(googleCalUrl)}" style="display:inline-block;font-family:Roboto,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;text-transform:uppercase;">Add to Google Calendar</a>
                  </td>
                </tr>
              </table>
            
              <p style="margin:0;font-family:Roboto,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;font-size:12px;line-height:18px;color:#666666;">Prefer Apple Calendar or another app? Open the attached <strong>appointment-${escapeHtml(String(appointment.id))}.ics</strong> file to import this visit.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:8px;padding:16px 20px;">
                ${row('Pet', petName)}
                ${row('Service', serviceTitle)}
                ${row('Date', apptDate)}
                ${row('Time slot', timeslot)}
                ${row('Branch', branchName)}
                ${row('Location', branchLocation || '—')}
                ${row('Status', status)}
                ${row('Problem type', problemType)}
                ${row('Notes', problemStatement)}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 32px 28px;">
              <p style="margin:0;font-family:Roboto,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;font-size:13px;line-height:20px;color:#555555;">Papa's Life Line Veterinary Hospital, Induleela, 1610/52, 40th cross, 18th Main Rd, 4th T Block East, Jayanagar, Bengaluru, Karnataka 560041</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendAppointmentEmail (appointment, kind) {
  if (!appointment?.user?.email) return;
  if (!ORDER_SMTP_PASS) {
    console.warn('Skipping appointment email: ORDER_SMTP_PASS/SMTP_PASS is not configured');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: DEFAULT_SMTP_HOST,
    port: DEFAULT_SMTP_PORT,
    secure: DEFAULT_SMTP_PORT === 465,
    auth: {
      user: ORDER_SMTP_USER,
      pass: ORDER_SMTP_PASS
    }
  });

  const id = appointment.id;
  const subject = kind === 'created'
    ? `Your Papa's Lifeline appointment #${id} is booked`
    : `Your Papa's Lifeline appointment #${id} was updated`;

  await transporter.sendMail({
    from: ORDER_SMTP_USER,
    to: appointment.user.email,
    subject,
    html: buildAppointmentEmailHtml(appointment, kind),
    attachments: [
      {
        filename: `appointment-${appointment.id}.ics`,
        content: Buffer.from(buildIcsAttachmentContent(appointment), 'utf-8'),
        contentType: 'text/calendar; charset=utf-8',
        contentDisposition: 'attachment'
      }
    ]
  });
}

module.exports = {
  sendAppointmentEmail
};
