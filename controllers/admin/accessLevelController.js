const { getGamePool } = require(global.BASE_DIR + '/db');
const sql = require('mssql');
const serverApi = require(global.BASE_DIR + '/services/serverApi');
const { isAdmin } = require(global.BASE_DIR + '/utils/roles');

async function updateAccessLevel(req, res) {
  // Only admins change access levels (the page shows the control only to them).
  if (!isAdmin(req.user?.role)) return res.status(403).send('Forbidden');
  try {
    const { serverKey, containerId, accessLevel } = req.body;
    const lvl = Math.max(0, Math.min(11, Number(accessLevel)));
    const cid = Number(containerId);
    if (!Number.isInteger(cid) || cid <= 0 || !Number.isFinite(lvl)) return res.status(400).send('Invalid request.');

    if (serverApi.isConfigured(serverKey)) {
      // Through the game: safe while the character is loaded (DbServer would
      // write an old level back over a database edit).
      await serverApi.editCharacter(serverKey, cid, 'set_access_level', String(lvl), req.user.username);
      console.log(`[admin] ${req.user.username} set access level ${lvl} on ${serverKey}:${cid}`);
      if (req.session) req.session.characterEditResult = { ok: true, text: `Sent to the game: access level ${lvl}. Reload in a few seconds to see it.` };
    } else {
      const pool = await getGamePool(serverKey);
      if (!pool) return res.status(400).send('Invalid server.');
      await pool.request()
        .input('lvl', sql.Int, lvl)
        .input('cid', sql.Int, cid)
        .query(`
          UPDATE dbo.Ents
          SET AccessLevel = @lvl
          WHERE ContainerId = @cid
        `);
    }

    res.redirect(req.get('Referrer') || '/');
  } catch (err) {
    console.error('[updateAccessLevel]', err);
    if (req.session) req.session.characterEditResult = { ok: false, text: err.message };
    res.redirect(req.get('Referrer') || '/');
  }
}

module.exports = {
  updateAccessLevel,
};
