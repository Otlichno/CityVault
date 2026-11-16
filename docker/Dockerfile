# CityVault as a container: docker build -f docker/Dockerfile -t cityvault .
#
# Configured from the environment on first start (docker/entrypoint.sh
# writes data/config.json; see docker/README.md). Serves plain HTTP on
# port 3000 for a reverse proxy in front (TLS is the proxy's job).
FROM node:22-bookworm-slim AS build
# Native modules (better-sqlite3, sharp, msnodesqlv8) build here if no
# prebuilt binary fits.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ unixodbc-dev ca-certificates git \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json patch-autoencrypt.js ./
RUN npm install --no-audit --no-fund --omit=dev
COPY . .
RUN rm -rf tools/*.exe ImageServer .git \
 && rm -f data/config.json data/sessions.sqlite \
 && cp -a data data.dist

FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends unixodbc ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
COPY docker/entrypoint.sh /usr/local/bin/cityvault-entrypoint
RUN chmod +x /usr/local/bin/cityvault-entrypoint \
 && mkdir -p /app/data /app/logs /app/public/exports /app/userContent \
 && chown -R node:node /app
USER node
ENV NODE_ENV=production
EXPOSE 3000
VOLUME ["/app/data", "/app/public/exports", "/app/userContent"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["tini", "--", "cityvault-entrypoint"]
CMD ["node", "server.mjs"]
