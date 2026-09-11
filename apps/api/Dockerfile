FROM rust:1.98.1-bookworm AS builder

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations

RUN cargo build --release --locked

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/rohbar-api /usr/local/bin/rohbar-api

ENV BIND_ADDR=0.0.0.0:8080

USER 10001:10001

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/rohbar-api"]
