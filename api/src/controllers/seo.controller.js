const asyncHandler = require('../utils/asyncHandler');
const seoService = require('../services/seo.service');

exports.listSeoPages = asyncHandler(async (req, res) => {
  const data = await seoService.listSeoPages();
  res.json({ success: true, data });
});

exports.getSeoPage = asyncHandler(async (req, res) => {
  const data = await seoService.getSeoPage(req.params.slug);
  res.json({ success: true, data });
});

exports.updateSeoPage = asyncHandler(async (req, res) => {
  const data = await seoService.updateSeoPage(req.params.slug, req.body);
  res.json({ success: true, data });
});
