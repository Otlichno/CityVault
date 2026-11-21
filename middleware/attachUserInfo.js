const { getAuthPool } = require(global.BASE_DIR + '/db');
const sql = require('mssql');

// The signed-in user's current role, on every request. A session lives a
// year, so a ban, a deleted account or a changed role must take effect here:
// they used to wait until the session expired (the role cached in the
// session at sign-in was trusted by several pages).
module.exports = async function attachUserInfo(req, res, next) {
  const username = req.session?.username;
  if (!username) return next();

  let user;
  try {
    const pool = await getAuthPool();
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .query(`SELECT account, role, block_flag FROM cohauth.dbo.user_account WHERE account = @username`);
    user = result.recordset[0];
  } catch (err) {
    // Database trouble: carry on as a plain user (no elevated rights).
    console.error('[middleware:attachUserInfo] Failed to load user info:', err);
    req.user = { username, role: 'user' };
    return next();
  }

  if (!user || (user.block_flag & 1)) {
    // Deleted or banned: sign the session out.
    const reason = user ? 'banned' : 'deleted';
    return req.session.regenerate(() => {
      console.log(`[auth] signed out ${username}: account ${reason}`);
      next();
    });
  }

  req.user = { username: user.account, role: user.role };
  if (req.session.role !== user.role) req.session.role = user.role;
  next();
};
