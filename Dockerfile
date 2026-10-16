# API del cotizador (NestJS + PDF con Chromium). Contexto de construcción: la raíz del repositorio.
FROM node:20-bookworm-slim
ENV NODE_ENV=production CHROMIUM_PATH=/usr/bin/chromium CHROMIUM_SIN_SANDBOX=true PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/motor-precios/package.json packages/motor-precios/
COPY apps/api/package.json apps/api/
# Se necesitan las dependencias de desarrollo (tsc) solo para compilar; después se podan.
RUN npm ci --workspace=@bisa/motor-precios --workspace=@bisa/api --include=dev
COPY packages/motor-precios packages/motor-precios
COPY apps/api apps/api
COPY db db
RUN npm run build -w @bisa/motor-precios && npm run build -w @bisa/api \
 && npm prune --omit=dev --workspace=@bisa/motor-precios --workspace=@bisa/api
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
