FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Create workspace directories and default config
RUN mkdir -p /workspace/group /home/node/.claude && \
    echo '{}' > /home/node/.claude.json && \
    chown -R node:node /workspace /home/node/.claude /home/node/.claude.json

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER node
WORKDIR /workspace/group

ENTRYPOINT ["/entrypoint.sh"]
