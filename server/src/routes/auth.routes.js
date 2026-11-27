const express = require('express');
const controller = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { auth } = require('../validators');

const router = express.Router();

router.post('/login', validate(auth.login), controller.login);
router.post('/register', validate(auth.register), controller.register);
router.get('/me', protect, controller.me);

module.exports = router;
