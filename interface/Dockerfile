FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PI_WEB_HOST=0.0.0.0 \
    PI_WEB_PORT=4123 \
    PI_WORKSPACES_DIR=/workspaces

RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.80.3 \
    && mkdir -p /app /workspaces /root/.pi/agent

WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public

EXPOSE 4123
CMD ["node", "server.mjs"]
