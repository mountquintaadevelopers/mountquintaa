const prisma = require('../prisma');

const DEFAULTS = { siteVisitEnabled: true, launchEventEnabled: false };

const getBookingSettings = async () => {
  const setting = await prisma.bookingSetting.findFirst();
  if (!setting) return { ...DEFAULTS };
  return {
    siteVisitEnabled: setting.siteVisitEnabled,
    launchEventEnabled: setting.launchEventEnabled
  };
};

// Ensures a single BookingSetting row: updates it if present, creates it otherwise.
const updateBookingSettings = async ({ siteVisitEnabled, launchEventEnabled }) => {
  const existing = await prisma.bookingSetting.findFirst();

  const data = {};
  if (siteVisitEnabled !== undefined) data.siteVisitEnabled = Boolean(siteVisitEnabled);
  if (launchEventEnabled !== undefined) data.launchEventEnabled = Boolean(launchEventEnabled);

  if (existing) {
    const updated = await prisma.bookingSetting.update({ where: { id: existing.id }, data });
    return {
      siteVisitEnabled: updated.siteVisitEnabled,
      launchEventEnabled: updated.launchEventEnabled
    };
  }

  const created = await prisma.bookingSetting.create({
    data: {
      siteVisitEnabled: data.siteVisitEnabled ?? DEFAULTS.siteVisitEnabled,
      launchEventEnabled: data.launchEventEnabled ?? DEFAULTS.launchEventEnabled
    }
  });
  return {
    siteVisitEnabled: created.siteVisitEnabled,
    launchEventEnabled: created.launchEventEnabled
  };
};

module.exports = { getBookingSettings, updateBookingSettings };
