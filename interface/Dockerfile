# PI Studio in Docker. Build context = repository root (see docker-compose.yml) so the image
# gets the same PI version, harness (agents/skills/extensions/packages) and patches as
# install.sh gives a Linux host. The host agent dir is NOT mounted wholesale: its npm
# packages are platform-specific. Only auth.json and sessions are shared (compose).
FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ripgrep bash ca-certificates curl procps \
    && rm -rf /var/lib/apt/lists/* \
    && git config --system safe.directory '*' \
    && git config --system core.autocrlf input \
    && git config --system core.filemode false

# Host-created (Windows) git worktrees point to C:/... gitdirs; see docker/git-host-path.sh.
COPY interface/docker/git-host-path.sh /usr/local/bin/git
RUN sed -i 's/\r$//' /usr/local/bin/git && chmod +x /usr/local/bin/git

COPY . /opt/evolvera
# Windows checkouts may carry CRLF scripts; normalize before running them.
RUN find /opt/evolvera -name '*.sh' -exec sed -i 's/\r$//' {} + \
    && chmod +x /opt/evolvera/*.sh /opt/evolvera/scripts/*.sh \
    && cd /opt/evolvera && HOME=/root bash install.sh && pi --version

ENV NODE_ENV=production \
    PI_WEB_HOST=0.0.0.0 \
    PI_WEB_PORT=4123

WORKDIR /app
COPY interface/package.json interface/server.mjs ./
COPY interface/public ./public

EXPOSE 4123
# Commit identity comes from the host (start-windows.ps1 passes it); optional.
CMD ["sh", "-c", "[ -n \"$GIT_USER_NAME\" ] && /usr/bin/git config --global user.name \"$GIT_USER_NAME\"; [ -n \"$GIT_USER_EMAIL\" ] && /usr/bin/git config --global user.email \"$GIT_USER_EMAIL\"; exec node server.mjs"]
