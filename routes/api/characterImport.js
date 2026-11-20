const express = require('express');
const multer = require('multer');
const router = express.Router();
const loadController = require(global.BASE_DIR + '/utils/loadController');

const { importCharacter } = loadController('api/characterImportController');
const { getImportStatus } = loadController('api/importStatusController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1 } });

// Importing needs a signed-in GM or admin: who is importing comes from the
// session, never from the request (it used to trust a viewerUsername field,
// so anyone could import characters into any account). Checked before the
// upload is read.
function requireImporter(req, res, next) {
  const s = req.session;
  if (!s?.username) return res.status(401).send('Sign in first.');
  if (!['admin', 'gm'].includes(s.role)) return res.status(403).send('Only admins or GMs may import characters.');
  next();
}

router.post('/:serverKey', requireImporter, upload.single('importZip'), (req, res, next) => {
  req.body = Object.assign({}, req.body, { viewerUsername: req.session.username });
  next();
}, importCharacter);

router.get('/status/:taskId', getImportStatus);

module.exports = router;
