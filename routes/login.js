const express = require('express');
const router = express.Router();
const loadController = require(global.BASE_DIR + '/utils/loadController');
const rateLimit = require(global.BASE_DIR + '/middleware/rateLimit');

const {
  handleLoginPage,
  handleLogin,
  handleResetPage,
  handleResetRequest,
  handleResetConfirmPage,
  handleResetConfirm
} = loadController('loginController');


// Serve /login page
router.get('/', handleLoginPage);
// Sign-in: 10 tries per client in 10 minutes (password guessing).
router.post('/', rateLimit('login', 10, 10 * 60 * 1000), handleLogin);

// Password reset request form
router.get('/reset', handleResetPage);
router.post('/reset', rateLimit('reset', 5, 60 * 60 * 1000), handleResetRequest);

// Password reset confirmation (with token)
router.get('/reset/confirm', handleResetConfirmPage);
router.post('/reset/confirm', rateLimit('reset-confirm', 10, 60 * 60 * 1000), handleResetConfirm);

module.exports = router;
