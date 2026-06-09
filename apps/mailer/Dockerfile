# Build context is the monorepo root.
FROM node:22-alpine AS base

RUN corepack enable

WORKDIR /app


FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/email/package.json ./apps/email/
COPY packages/contracts/package.json ./packages/contracts/
RUN CI=1 pnpm install --frozen-lockfile --filter @github-notifier/email...

COPY packages/contracts ./packages/contracts
COPY apps/email ./apps/email

RUN pnpm --filter @github-notifier/email... build


FROM base AS production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/email/package.json ./apps/email/
COPY packages/contracts/package.json ./packages/contracts/
RUN CI=1 pnpm install --frozen-lockfile --prod --filter @github-notifier/email...

COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/apps/email/dist ./apps/email/dist

WORKDIR /app/apps/email

CMD ["node", "dist/main.js"]
