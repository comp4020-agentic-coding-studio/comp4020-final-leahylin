# syntax = docker/dockerfile:1

# Buddy Up: Node 24 runs the TypeScript in src/ directly (type stripping), so
# there's no build step. SQLite is node's built-in node:sqlite, so the only
# runtime dependency is `marked`, for /readme/. docs/decisions/0001 says why.
FROM docker.io/library/node:24-alpine

WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

COPY src ./src
COPY README.md ./

# /data is the Fly volume: the only storage that survives a redeploy
ENV DATA_DIR=/data NODE_ENV=production
EXPOSE 8080
# 256 MB machine: cap the heap well under it
CMD ["node", "--max-old-space-size=160", "--disable-warning=ExperimentalWarning", "src/server.ts"]
