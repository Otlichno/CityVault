const express = require('express');
const router = express.Router();
const requireAdmin = require(global.BASE_DIR + '/middleware/requireAdmin');

// Everything under /admin is for GMs and admins; pages for admins only
// check that as well. (A route's meta.access only hides its menu link.)
router.use(requireAdmin);

router.use('/', require('./dashboard'));
router.use('/manifest', require('./manifest'));
router.use('/users', require('./users'));
router.use('/updateAccessLevel', require('./updateAccessLevel'));
router.use('/character-edit', require('./characterEdit'));
router.use('/news', require('./news'));
router.use('/style', require('./style')); 
router.use('/blacklist', require('./blacklist')); 
router.use('/config', require('./config'));
router.use('/download-update', require('./update'));
router.use('/templates', require('./templates'));
router.use('/servers', require('./servers'));
router.use('/petitions', require('./petitions'));
router.use('/characterimport', require('./characterImport'));


module.exports = router;