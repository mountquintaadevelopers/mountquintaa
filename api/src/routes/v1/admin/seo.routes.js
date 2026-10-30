const express = require('express');
const router = express.Router();
const seoController = require('../../../controllers/seo.controller');
const auth = require('../../../middleware/auth');
const requireRole = require('../../../middleware/role');

router.use(auth, requireRole('ADMIN'));

router.get('/', seoController.listSeoPages);
router.get('/:slug', seoController.getSeoPage);
router.patch('/:slug', seoController.updateSeoPage);

module.exports = router;
