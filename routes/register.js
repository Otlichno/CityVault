const express = require('express');
const router = express.Router();
const loadController = require(global.BASE_DIR + '/utils/loadController');
const rateLimit = require(global.BASE_DIR + '/middleware/rateLimit');

const {
  handleRegisterPage,
  handleRegister,
  handleConfirmAccount
} = loadController('registerController');


router.get('/', handleRegisterPage);
// New accounts: 5 per client per hour (bots making game accounts).
router.post('/', rateLimit('register', 5, 60 * 60 * 1000), handleRegister);

// Handle email confirmation via token
router.get('/confirm/:token', handleConfirmAccount);

module.exports = router;