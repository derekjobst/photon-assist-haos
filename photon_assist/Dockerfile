FROM node:22.13.1-alpine3.21

ARG BUILD_VERSION=0.1.0
ARG BUILD_SOURCE=https://github.com/derekjobst/photon-assist-haos

LABEL \
  io.hass.type="app" \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.arch="aarch64|amd64" \
  org.opencontainers.image.source="${BUILD_SOURCE}"

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

CMD ["node", "src/index.js"]
