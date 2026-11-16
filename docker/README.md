# CityVault in a container

```sh
docker build -f docker/Dockerfile -t cityvault .
docker run -d -p 3000:3000 -v cityvault-data:/app/data \
  -e CITYVAULT_DB_ENGINE=mariadb -e CITYVAULT_DB_HOST=db -e CITYVAULT_DB_PORT=3306 \
  -e CITYVAULT_DB_USER=coh -e CITYVAULT_DB_PASSWORD=... \
  -e CITYVAULT_DOMAIN=accounts.example.com cityvault
```

It serves plain HTTP on port 3000: put a reverse proxy with TLS in front.

## Settings

The entrypoint writes these into `data/config.json` on every start (made
from `config.json-default` the first time). Anything not set here stays as
the admin pages leave it.

| Variable | What |
|---|---|
| `CITYVAULT_DB_ENGINE` | `mssql` (SQL Server, the default) or `mariadb` |
| `CITYVAULT_DB_HOST`, `CITYVAULT_DB_PORT` | The database server, `host` or `host,port` (port 1433 / 3306 by default) |
| `CITYVAULT_DB_LOCAL_HOST` | Used instead of a database host of `127.0.0.1`/`localhost` (the Docker host's address, as the container sees it) |
| `CITYVAULT_DB_USER`, `CITYVAULT_DB_PASSWORD` (or `_FILE`) | Its login |
| `CITYVAULT_AUTH_DB`, `CITYVAULT_CHAT_DB`, `CITYVAULT_GAME_DB` | Database names (`cohauth`, `cohchat`, `cohdb`) |
| `CITYVAULT_SERVER_KEY`, `CITYVAULT_SERVER_LABEL` | The shard's key in the config and its name on the site |
| `CITYVAULT_BADGE_VERSION` | `i24` or `i25` (default) |
| `CITYVAULT_SITE_NAME`, `CITYVAULT_DOMAIN` | The site's name and host name (links in emails) |
| `CITYVAULT_SESSION_SECRET` (or `_FILE`) | Signs the session cookie (made up once if not given) |
| `CITYVAULT_SMTP_HOST`, `_PORT`, `_USER`, `_PASSWORD` (or `_FILE`) | Email by SMTP (verification, password resets) |
| `CITYVAULT_MAILERSEND_KEY` (or `_FILE`) | Email by MailerSend instead |
| `CITYVAULT_MAIL_FROM` | The sender address |
| `CITYVAULT_ADMIN` | A game login to make a CityVault admin at start (there is no terminal to ask) |

Volumes: `/app/data` (config, sessions, news), `/app/public/exports`
(character exports) and `/app/userContent` (custom views and styles).

Costume portraits are rendered by the Windows game client, so they stay
off in the container.

## MariaDB

With `CITYVAULT_DB_ENGINE=mariadb`, `db/mariadb.js` stands in for the
mssql package and rewrites CityVault's SQL Server SQL for MariaDB (schema
prefixes, `[names]`, `TOP`, `OFFSET ... FETCH`, `ISNULL`, `NEWID()`,
`CONVERT(BINARY(n), ...)`, `IDENTITY`, `INFORMATION_SCHEMA` and the like).
`node tests/mariadb-sql.test.js` checks the rewriting without a database.
