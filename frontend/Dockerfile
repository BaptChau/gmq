# ---------- Étape build : compile l'application Vue avec Vite ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- Étape runtime : nginx sert les fichiers statiques ----------
FROM nginx:1.27-alpine AS runtime

# Configuration nginx (SPA + proxy /api vers le backend)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Fichiers compilés
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
# Note : on cible 127.0.0.1 (et non localhost) car busybox wget résout localhost
# en IPv6 [::1], alors que nginx n'écoute qu'en IPv4.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
