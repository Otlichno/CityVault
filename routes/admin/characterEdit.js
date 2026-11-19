const express = require('express');
const router = express.Router();
const loadController = require(global.BASE_DIR + '/utils/loadController');
const { editCharacter } = loadController('admin/characterEditController');

router.post('/', editCharacter);

module.exports = router;

module.exports.meta = {
  access: ['admin'],
  display: false
};
