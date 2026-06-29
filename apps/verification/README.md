# Mail Verification Service

Owns the email-verification lifecycle (token + record) and the saga participant
endpoints used by the API during subscribe. Exposes the **same two operations
over two transports**, backed by one `verificationService`:

| Operation | REST | gRPC |
|---|---|---|
| Create verification | `POST /internal/verifications` | `verification.v1.MailVerificationService/CreateVerification` |
| Cancel verification (saga compensation) | `POST /internal/verifications/cancel` | `verification.v1.MailVerificationService/CancelVerification` |

- REST (Fastify) listens on `PORT` (default `3002`).
- gRPC (`@grpc/grpc-js`) listens on `GRPC_PORT` (default `50051`).

The REST implementation is kept alongside gRPC on purpose — the API selects the
transport via `VERIFICATION_TRANSPORT=grpc|rest` (default `grpc`).

## Contract

Defined in [`packages/contracts/proto/verification/v1/verification.proto`](../../packages/contracts/proto/verification/v1/verification.proto)
and generated with **buf** (`ts-proto` → `@grpc/grpc-js` stubs):

```bash
pnpm --filter @github-notifier/contracts proto:lint
pnpm --filter @github-notifier/contracts proto:generate
```

Generated code lands in `packages/contracts/src/verification/gen/` and is
exported as `@github-notifier/contracts/grpc`.

## Throughput: REST vs gRPC

Both endpoints do identical work (insert a verification row + publish the
confirmation event), so this measures transport overhead end to end. Start the
stack (`docker compose -f docker-compose.dev.yml up`), then:

**REST** — [autocannon](https://github.com/mcollina/autocannon):

```bash
npx autocannon -c 50 -d 20 -m POST \
  -H 'content-type=application/json' \
  -b '{"email":"a@b.com","repoFullName":"o/r","unsubToken":"u1"}' \
  http://localhost:3002/internal/verifications
```

**gRPC** — [ghz](https://ghz.sh):

```bash
ghz --insecure \
  --proto packages/contracts/proto/verification/v1/verification.proto \
  --call verification.v1.MailVerificationService.CreateVerification \
  -d '{"email":"a@b.com","repo_full_name":"o/r","unsub_token":"u1"}' \
  -c 50 -z 20s \
  localhost:50051
```

### Results

Run locally and fill in:

| Transport | Req/s | p99 latency |
|---|---|---|
| REST (HTTP/1.1 + JSON) | — | — |
| gRPC (HTTP/2 + Protobuf) | — | — |

Expected: gRPC wins on throughput and tail latency — HTTP/2 multiplexes over one
connection and Protobuf is a compact binary wire format, versus HTTP/1.1
connection churn and JSON parse/stringify per request. The gap narrows here
because the DB insert + broker publish dominate per-request cost.
