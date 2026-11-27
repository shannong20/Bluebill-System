const express = require('express');
const controller = require('../controllers/report.controller');
const validate = require('../middleware/validate');
const { common, shifts } = require('../validators');

const router = express.Router();

router.get('/summary', controller.summary);
router.get('/notifications', controller.notifications);

module.exports = router;
