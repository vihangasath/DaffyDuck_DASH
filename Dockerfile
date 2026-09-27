# One image recipe for the three services. Build context: the repository root.
#   docker compose up --build        (see docker-compose.yml)
FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
RUN npm ci

FROM deps AS source
COPY . .
# The competition datasets aren't committed (competition terms). When ./data is present the seed is
# rebuilt from it; otherwise the local packages/core/src/seed.json is used.
RUN if [ -d "data/General Data" ]; then npm run seed:data; fi

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
