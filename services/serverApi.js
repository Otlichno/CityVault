// Character edits through the shard's ServerAPI (Ouroboros Linux servers).
//
// ServerAPI turns each edit into one game command that DbServer runs on a map
// as the character, loading an offline character first, so the game applies
// and saves the change. Writing the same change straight into the database
// can be lost: DbServer keeps characters in memory and writes them back.
//
// config.json, per server: "serverApi": { "url": "http://serverapi:8913",
// "token": "<ServerAPI's COH_SERVERAPI_TOKEN>", "shard": "<optional>" }.
const config = require(global.BASE_DIR + '/utils/config');

// The edits ServerAPI accepts (ServerAPI/src/characterEdit.c), with labels.
const ACTIONS = {
  set_level: 'Set level (1-50)',
  add_xp: 'Add experience',
  set_influence: 'Set influence / infamy',
  set_prestige: "Set the supergroup's prestige",
  rename: 'Rename',
  set_access_level: 'Set access level (0-11)',
  grant_badge: 'Grant a badge (internal name)',
  revoke_badge: 'Remove a badge (internal name)',
  grant_temp_power: 'Grant a temporary power (Set.Power)',
  revoke_temp_power: 'Remove a temporary power (Set.Power)',
  grant_respec: 'Grant a free respec',
  add_costume_slot: 'Add a costume slot',
  unstick: 'Unstick (move to the last safe spot)',
  move_to_zone: 'Send to a zone (map id; online characters)',
};
const NO_VALUE = new Set(['grant_respec', 'add_costume_slot', 'unstick']);

function settingsFor(serverKey) {
  const server = (config.servers || {})[serverKey];
  const api = server && server.serverApi;
  return api && api.url && api.token ? api : null;
}

function isConfigured(serverKey) {
  return !!settingsFor(serverKey);
}

async function call(api, method, path, user) {
  const res = await fetch(api.url.replace(/\/+$/, '') + path, {
    method,
    headers: { Authorization: `Bearer ${api.token}`, 'X-Coh-User': user },
    signal: AbortSignal.timeout(10000),
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new Error((body && body.error) || `ServerAPI answered ${res.status}`);
  return body;
}

async function shardOf(api) {
  if (api.shard) return api.shard;
  const shards = Object.keys((await call(api, 'GET', '/shards', '')) || {});
  if (shards.length !== 1) throw new Error(`ServerAPI serves ${shards.length} shards: set serverApi.shard`);
  return shards[0];
}

// Sends one edit; throws Error with a message for the admin.
async function editCharacter(serverKey, containerId, action, value, user) {
  const api = settingsFor(serverKey);
  if (!api) throw new Error('Character editing needs the shard\'s ServerAPI (serverApi in config.json).');
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) throw new Error('Unknown edit.');
  const id = Number(containerId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Bad character id.');
  value = NO_VALUE.has(action) ? '' : String(value ?? '').trim();
  if (!NO_VALUE.has(action) && !value) throw new Error('This edit needs a value.');
  const shard = await shardOf(api);
  const query = value ? `?value=${encodeURIComponent(value)}` : '';
  await call(api, 'POST', `/${encodeURIComponent(shard)}/characters/${id}/${action}${query}`, `portal:${user}`);
}

module.exports = { ACTIONS, NO_VALUE, isConfigured, editCharacter };
