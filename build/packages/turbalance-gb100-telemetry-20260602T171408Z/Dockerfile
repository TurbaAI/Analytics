FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends awscli ca-certificates postgresql-client \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY app.js analytics-core.js index.html nccl-trace-fixtures.js nccl-trace-parser.js styles.css ./
COPY assets ./assets
COPY docs ./docs
COPY fixtures ./fixtures
COPY grafana ./grafana
COPY lib ./lib
COPY ops ./ops
COPY schemas ./schemas
COPY scripts ./scripts
COPY server ./server

RUN chmod +x scripts/*.js

USER node

EXPOSE 8787

CMD ["node", "server/ingestion-server.js"]
