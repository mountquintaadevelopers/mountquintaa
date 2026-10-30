const asyncHandler = require('../utils/asyncHandler');
const { sendExcelFile } = require('../utils/excelExport');
const bookingService = require('../services/booking.service');
const contactService = require('../services/contact.service');
const whatsappService = require('../services/whatsapp.service');
const prisma = require('../prisma');

exports.exportBookings = asyncHandler(async (req, res) => {
  const bookings = await bookingService.listBookingsForExport(req.query);

  await sendExcelFile(res, {
    filename: `bookings-${Date.now()}.xlsx`,
    columns: [
      { header: 'Booking Number', key: 'bookingNumber', width: 20 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Booking Type', key: 'bookingType', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Number Of People', key: 'numberOfPeople', width: 16 },
      { header: 'Slot Date', key: 'slotDate', width: 15 },
      { header: 'Scanned At', key: 'scannedAt', width: 20 },
      { header: 'Created At', key: 'createdAt', width: 20 }
    ],
    rows: bookings.map((b) => ({
      bookingNumber: b.bookingNumber,
      name: b.user?.name || '',
      phone: b.user?.phone || '',
      email: b.user?.email || '',
      bookingType: b.bookingType,
      status: b.status,
      numberOfPeople: b.numberOfPeople,
      slotDate: b.slot ? b.slot.date.toISOString().split('T')[0] : '',
      scannedAt: b.scannedAt ? b.scannedAt.toISOString() : '',
      createdAt: b.createdAt.toISOString()
    }))
  });
});

exports.exportContacts = asyncHandler(async (req, res) => {
  const contacts = await prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' } });

  await sendExcelFile(res, {
    filename: `contacts-${Date.now()}.xlsx`,
    columns: [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Message', key: 'message', width: 40 },
      { header: 'Source', key: 'source', width: 22 },
      { header: 'Consent', key: 'consent', width: 10 },
      { header: 'Page URL', key: 'pageUrl', width: 35 },
      { header: 'Followed Up', key: 'isFollowUped', width: 14 },
      { header: 'Admin Note', key: 'adminNote', width: 30 },
      { header: 'Created At', key: 'createdAt', width: 20 }
    ],
    rows: contacts.map((c) => ({
      name: c.name,
      email: c.email,
      phone: c.phone,
      message: c.message || '',
      source: c.source || '',
      consent: c.consent ? 'Yes' : 'No',
      pageUrl: c.pageUrl || '',
      isFollowUped: c.isFollowUped ? 'Yes' : 'No',
      adminNote: c.adminNote || '',
      createdAt: c.createdAt.toISOString()
    }))
  });
});

exports.exportWhatsappUsers = asyncHandler(async (req, res) => {
  const users = await whatsappService.listWhatsappUsersForExport();

  await sendExcelFile(res, {
    filename: `whatsapp-users-${Date.now()}.xlsx`,
    columns: [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Visit Count', key: 'visitCount', width: 14 },
      { header: 'Last Visited At', key: 'lastVisitedAt', width: 20 },
      { header: 'Created At', key: 'createdAt', width: 20 }
    ],
    rows: users.map((u) => ({
      name: u.name,
      phone: u.phone,
      visitCount: u.visitCount,
      lastVisitedAt: u.lastVisitedAt ? u.lastVisitedAt.toISOString() : '',
      createdAt: u.createdAt.toISOString()
    }))
  });
});
