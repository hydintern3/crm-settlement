# syntax=docker/dockerfile:1.7

FROM node:22.13.0-bookworm-slim AS dependencies
WORKDIR /app

COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci && npm cache clean --force

FROM dependencies AS build
COPY . .
RUN npm run build

FROM node:22.13.0-bookworm-slim AS runtime
LABEL org.opencontainers.image.source="https://github.com/hydintern3/crm-settlement" \
      org.opencontainers.image.title="CRM Analysis Platform" \
      org.opencontainers.image.description="Self-hosted CRM analysis and settlement workspace"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/dist/standalone ./
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/crm/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
