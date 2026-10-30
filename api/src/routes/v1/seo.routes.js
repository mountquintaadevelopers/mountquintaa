const express = require('express');
const router = express.Router();
const seoController = require('../../controllers/seo.controller');

// PUBLIC (read-only) — the website renders page <title>/<meta> tags from this.
// Editing is admin-only: /v1/admin/seo
router.get('/', seoController.listSeoPages);
router.get('/:slug', seoController.getSeoPage);

module.exports = router;
