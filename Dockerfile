# syntax=docker/dockerfile:1.7
# Digital Twin Agent UI (React + Vite) served by server.mjs, which also proxies /api to the backend and adds X-API-Key
# SERVER SIDE, so the key never reaches the browser. Build context = this ui folder:
#   docker build -t digital-twin-ui ui                  (from the monorepo root)
#   docker build -t digital-twin-ui .                   (from inside ui/ or the UI repository)
# Run (keys from the Docker environment, never baked into the image):
#   docker run --rm -p 4173:4173 -e API_KEY=<same as backend> digital-twin-ui
#   docker run --rm -p 4173:4173 -e API_KEY -e API_TARGET=http://host.docker.internal:8000 digital-twin-ui   (local backend)
#   -e FRAME_ANCESTORS="https://portal.example.com"   lets that site embed the app in an iframe (default: own origin only)

# ---------------------------------------------------------------- 1. build the static app
FROM node:22-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    npm_config_fund=false \
    npm_config_audit=false
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# theme rule (tokens only, no literal colours) is checked on every build; then the production bundle
RUN npm run lint:theme && npm run build

# ---------------------------------------------------------------- 2. small runtime: dist + server.mjs, no node_modules
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4173 \
    API_TARGET=https://digital-twin-backend-8tsc.onrender.com
# API_KEY is NOT set here: pass it at run time (-e API_KEY / compose / the platform's environment settings).
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server.mjs ./server.mjs
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4173) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.mjs"]
