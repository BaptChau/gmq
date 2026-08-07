# ---------- Étape build : installe les dépendances de production ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NODE_ENV=production

# better-sqlite3 est un module natif : outils de compilation au cas où
# aucun binaire pré-compilé n'est disponible pour la plateforme.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# ---------- Étape runtime : image minimale, exécutée sans privilèges ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/gmq.db
WORKDIR /app

# On ne copie que le nécessaire depuis l'étape build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/schema.sql ./schema.sql
COPY --from=build /app/package.json ./package.json

# Dossier de données persistant, possédé par l'utilisateur non-root `node`
RUN mkdir -p /data && chown -R node:node /data /app

USER node
EXPOSE 3000
VOLUME ["/data"]

# Healthcheck via l'endpoint /health (pas de curl dans l'image slim)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
