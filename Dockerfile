# The Sweet binary and Litestream in one image. deploy/ has the compose stack that runs it.

FROM node:22-alpine AS web
RUN npm install -g pnpm@11
WORKDIR /src/web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web ./
# Vite writes to ../internal/web/dist.
RUN pnpm build

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . ./
COPY --from=web /src/internal/web/dist ./internal/web/dist
# go:embed cannot reach ../../migrations (see the Makefile).
RUN rm -rf cmd/sweet/migrations && cp -R migrations cmd/sweet/migrations \
 && CGO_ENABLED=0 go build -trimpath -ldflags '-s -w' -o /sweet ./cmd/sweet

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 1000 sweet \
 && mkdir /data && chown sweet /data
COPY --from=litestream/litestream:0.5.18 /usr/local/bin/litestream /usr/local/bin/litestream
COPY --from=build /sweet /usr/local/bin/sweet
COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/entrypoint.sh /usr/local/bin/sweet-entrypoint
USER sweet
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["sweet-entrypoint"]
