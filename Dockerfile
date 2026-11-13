# =============================================================================
# PW OpsDesk — Lightweight Production Dockerfile (Node.js 20-Alpine, Non-Root)
# =============================================================================
# Sub-40MB RAM footprint, WebSocket enabled, Non-Root execution
# =============================================================================

FROM node:20-alpine

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source code
COPY core/ ./core/
COPY data/ ./data/
COPY public/ ./public/
COPY sdk/ ./sdk/
COPY server.js .

RUN chown -R node:node /app
USER node

ENV PORT=3000 \
    NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
