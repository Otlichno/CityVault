#!/bin/sh
# CityVault container start: brings data/ up to date from the image and
# writes the environment's settings into data/config.json (made from
# config.json-default the first time). Settings the environment does not
# give stay as the admin pages left them. See docker/README.md.
set -e
cd /app

# Game data files shipped with the image (badges, map names) are refreshed;
# what the site keeps (config, sessions, news, blacklist) is not.
if [ -d /app/data.dist ]; then
    for f in /app/data.dist/* ; do
        name=$(basename "$f")
        case $name in
            config.json|sessions.sqlite|news.json|badges_blacklist.json)
                [ -e "data/$name" ] || cp -a "$f" "data/$name" ;;
            *) rm -rf "data/$name"; cp -a "$f" "data/$name" ;;
        esac
    done
fi

# *_FILE variables (Docker secrets) become the plain ones.
for v in CITYVAULT_DB_PASSWORD CITYVAULT_SESSION_SECRET CITYVAULT_SMTP_PASSWORD CITYVAULT_MAILERSEND_KEY; do
    eval "file=\${${v}_FILE:-}"
    if [ -n "$file" ] && [ -r "$file" ]; then
        eval "export $v=\"\$(cat \"\$file\")\""
    fi
done

node - <<'EOF'
const fs = require('fs');
const crypto = require('crypto');
const path = '/app/data/config.json';
const env = process.env;
const cfg = fs.existsSync(path)
  ? JSON.parse(fs.readFileSync(path, 'utf8'))
  : JSON.parse(fs.readFileSync('/app/data/config.json-default', 'utf8'));
const set = (obj, key, value) => { if (value !== undefined && value !== '') obj[key] = value; };
const num = v => (v === undefined || v === '' ? undefined : Number(v));

set(cfg, 'siteName', env.CITYVAULT_SITE_NAME);
set(cfg, 'domain', env.CITYVAULT_DOMAIN);
cfg.ipAddr = '0.0.0.0';
cfg.port = 3000;
cfg.useAutoEncrypt = false;           // TLS is the reverse proxy's job
if (env.CITYVAULT_SESSION_SECRET) cfg.session_secret = env.CITYVAULT_SESSION_SECRET;
if (!cfg.session_secret || cfg.session_secret === 'ChangeThisPLEASE')
  cfg.session_secret = crypto.randomBytes(32).toString('hex');

// CITYVAULT_DB_HOST may carry the port as "host,port" (SQL Server's way).
let [hostOnly, hostPort] = String(env.CITYVAULT_DB_HOST || '').split(',');
// A database the host's own programs reach at 127.0.0.1 is, from inside a
// container on its own network, at CITYVAULT_DB_LOCAL_HOST (the host's
// address).
if (['127.0.0.1', 'localhost'].includes(hostOnly) && env.CITYVAULT_DB_LOCAL_HOST) hostOnly = env.CITYVAULT_DB_LOCAL_HOST;
const db = {
  engine: env.CITYVAULT_DB_ENGINE,
  dbHost: hostOnly || undefined,
  dbPort: num(env.CITYVAULT_DB_PORT || hostPort),
  dbUser: env.CITYVAULT_DB_USER,
  dbPass: env.CITYVAULT_DB_PASSWORD,
};
const withDb = (target, name) => {
  for (const [k, v] of Object.entries(db)) set(target, k, v);
  set(target, 'dbName', name);
  return target;
};
if (env.CITYVAULT_DB_HOST) {
  cfg.auth = withDb(cfg.auth || {}, env.CITYVAULT_AUTH_DB || 'cohauth');
  cfg.chat = withDb(cfg.chat || {}, env.CITYVAULT_CHAT_DB || 'cohchat');
  const key = env.CITYVAULT_SERVER_KEY || 'shard';
  // The environment's shard replaces the default's example one.
  if (cfg.servers && cfg.servers.yourserver && key !== 'yourserver') delete cfg.servers.yourserver;
  cfg.servers = cfg.servers || {};
  const server = withDb(cfg.servers[key] || {}, env.CITYVAULT_GAME_DB || 'cohdb');
  set(server, 'label', env.CITYVAULT_SERVER_LABEL || server.label || key);
  set(server, 'badgeVersion', env.CITYVAULT_BADGE_VERSION || server.badgeVersion || 'i25');
  cfg.servers[key] = server;
}

cfg.email = cfg.email || {};
if (env.CITYVAULT_SMTP_HOST) {
  cfg.email.provider = 'smtp';
  cfg.email.smtp = cfg.email.smtp || {};
  set(cfg.email.smtp, 'host', env.CITYVAULT_SMTP_HOST);
  set(cfg.email.smtp, 'port', env.CITYVAULT_SMTP_PORT);
  cfg.email.smtp.auth = cfg.email.smtp.auth || {};
  set(cfg.email.smtp.auth, 'user', env.CITYVAULT_SMTP_USER);
  set(cfg.email.smtp.auth, 'pass', env.CITYVAULT_SMTP_PASSWORD);
} else if (env.CITYVAULT_MAILERSEND_KEY) {
  cfg.email.provider = 'mailsend';
  cfg.email.mailersend = { apiKey: env.CITYVAULT_MAILERSEND_KEY };
}
set(cfg.email, 'fromEmail', env.CITYVAULT_MAIL_FROM);

// Costume portraits are rendered by the Windows game client, which a Linux
// container does not have.
if (cfg.costumeRendering) cfg.costumeRendering.enabled = false;

fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
console.log(`[entrypoint] config: site ${cfg.siteName}, shard(s) ${Object.keys(cfg.servers || {}).join(', ')}, ` +
  `database ${(cfg.auth && cfg.auth.engine) || 'mssql'} at ${cfg.auth && cfg.auth.dbHost}`);
EOF

exec "$@"
