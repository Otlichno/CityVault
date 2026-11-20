const path = require('path');
const fs = require('fs/promises');
const config = require(global.BASE_DIR + '/utils/config');
const { isAdmin } = require(global.BASE_DIR + '/utils/roles');
const { getAuthPool } = require(global.BASE_DIR + '/db');
const sql = require('mssql');


exports.clearCostumeRender = async (req, res) => {
    const { serverKey, containerId, slot = 0 } = req.body;

    // Signed-in users only, and only names that make a portrait file: the
    // fields used to go into the path as they came (a ../ deleted any .png).
    if (!req.session?.username) {
        return res.status(401).send('Sign in first.');
    }
    if (!serverKey || !containerId) {
        return res.status(400).send('Missing required parameters.');
    }
    const servers = require(global.BASE_DIR + '/utils/config').servers || {};
    if (!Object.prototype.hasOwnProperty.call(servers, serverKey) || !/^[A-Za-z0-9_-]{1,64}$/.test(String(serverKey)) ||
        !/^\d{1,10}$/.test(String(containerId)) || !/^\d{1,3}$/.test(String(slot))) {
        return res.status(400).send('Invalid parameters.');
    }

    const filename = `${serverKey}_${containerId}${slot == 0 ? '' : `_${slot}`}`;
    const portraitDir = path.join(global.BASE_DIR, 'public', 'images', 'portrait');
    const imagePath = path.join(portraitDir, `${filename}.png`);
    if (path.dirname(imagePath) !== portraitDir) {
        return res.status(400).send('Invalid parameters.');
    }

    try {
        await fs.unlink(imagePath);
        console.log(`[INFO] Deleted portrait: ${imagePath}`);
    } catch (err) {
        if (err.code !== 'ENOENT') {
        console.warn(`[WARN] Failed to delete portrait: ${err.message}`);
        return res.status(500).send('Failed to delete PNG.');
        }
    }

    try {
    const pool = await getAuthPool();
    const slotIdString = `${slot}_body`;

    await pool.request()
        .input('serverKey', sql.VarChar, serverKey)
        .input('containerId', sql.Int, containerId)
        .input('slotId', sql.VarChar, slotIdString)
        .query(`
        DELETE FROM cohauth.dbo.CostumeHash
        WHERE ServerKey = @serverKey AND ContainerId = @containerId AND SlotId = @slotId
        `);

        console.log(`[INFO] Deleted costume hash for ${containerId} slot ${slot}`);
        req.flash('success', 'Costume render cleared successfully.');
    } catch (err) {
        console.error('[ERROR] Failed to delete hash:', err);
        req.flash('error', 'Error clearing hash.');
        return res.redirect(req.get('Referrer') || '/');
    }


    return res.redirect(req.get('Referrer') || '/');
};
