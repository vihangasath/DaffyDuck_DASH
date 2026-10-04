# One image recipe for the three services. Build context: the repository root.
#   docker compose up --build        (see docker-compose.yml)
# Hosts with no build-target setting (Render, see render.yaml) pick the stage with SERVICE=api|web|admin.
ARG SERVICE=admin

FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
# Venue Wi-Fi drops connections: retry each download, and keep the npm cache between builds
# so a second `docker compose up --build` only fetches what failed.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --fetch-retries=6 --fetch-retry-mintimeout=5000 --fetch-retry-maxtimeout=120000

FROM deps AS source
COPY . .
# Private CSVs rebuild the judged seed. A clean public checkout creates a clearly marked
# independent synthetic fixture; a local private seed is used when it already exists.
RUN node scripts/ensure-seed.mjs

# ── API: owns the database, runs migrations and seeds on first start ──
FROM source AS api
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["npm", "run", "start", "-w", "@waypoint/api"]

# ── Operations web app ──
FROM source AS web-build
# The /api proxy target is fixed at build time (Next.js rewrites).
ARG API_URL=http://api:4000
ENV API_URL=$API_URL
RUN npm run build -w @waypoint/web

FROM node:24-alpine AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=web-build /repo/apps/web/.next/standalone ./
COPY --from=web-build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# ── Admin console ──
FROM source AS admin-build
ARG API_URL=http://api:4000
ENV API_URL=$API_URL
RUN npm run build -w @waypoint/admin

FROM node:24-alpine AS admin
WORKDIR /app
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0
COPY --from=admin-build /repo/apps/admin/.next/standalone ./
COPY --from=admin-build /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=admin-build /repo/apps/admin/public ./apps/admin/public
EXPOSE 3001
CMD ["node", "apps/admin/server.js"]

# ── The stage named by SERVICE (docker compose names its target directly) ──
FROM ${SERVICE}
