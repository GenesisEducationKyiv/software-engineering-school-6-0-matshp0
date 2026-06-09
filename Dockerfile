FROM node:22-alpine AS base

RUN corepack enable

WORKDIR /app


FROM base AS builder

COPY package.json pnpm-lock.yaml ./
RUN CI=1 pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY @types ./@types
COPY src ./src

RUN pnpm build


FROM base AS migrator

COPY package.json pnpm-lock.yaml ./
RUN CI=1 pnpm install --frozen-lockfile

COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]


FROM base AS production

COPY package.json pnpm-lock.yaml ./
RUN CI=1 pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

EXPOSE 3000

CMD ["node", "dist/server.js"]
