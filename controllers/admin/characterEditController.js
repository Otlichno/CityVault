// Admins' character edits (level, influence, rename, badges, ...), applied
// by the game through the shard's ServerAPI: see services/serverApi.js.
const serverApi = require(global.BASE_DIR + '/services/serverApi');
const { isAdmin } = require(global.BASE_DIR + '/utils/roles');

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

async function editCharacter(req, res) {
  if (!isAdmin(req.user?.role)) return res.status(403).send('Forbidden');
  const { serverKey, containerId, action, value } = req.body || {};
  const reason = String(req.body?.reason || '').trim().slice(0, 200);
  const back = ID_RE.test(serverKey || '') && /^\d{1,10}$/.test(containerId || '')
    ? `/character/${serverKey}:${containerId}` : '/';
  let result;
  if (!reason) {
    result = { ok: false, text: 'A reason is required.' };
  } else {
    try {
      await serverApi.editCharacter(serverKey, containerId, action, value, req.user.username);
      console.log(`[admin] ${req.user.username} character edit ${serverKey}:${containerId} ${action} ` +
        `${JSON.stringify(String(value ?? ''))} reason ${JSON.stringify(reason)}`);
      result = { ok: true, text: `Sent to the game: ${serverApi.ACTIONS[action]}. An offline character takes a few seconds; reload to see it.` };
    } catch (err) {
      console.warn(`[admin] character edit ${serverKey}:${containerId} ${action} failed: ${err.message}`);
      result = { ok: false, text: err.message };
    }
  }
  if (req.session) req.session.characterEditResult = result;
  res.redirect(back);
}

module.exports = { editCharacter };
