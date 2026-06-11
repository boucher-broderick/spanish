# Multi-stage build for a lean production image using Next.js standalone output.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100
# Next standalone output: minimal server + only the deps it needs.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Bundled word dataset (DB-or-file fallback in lib/store.ts reads this).
COPY --from=builder /app/data ./data
EXPOSE 3100
CMD ["node", "server.js"]
