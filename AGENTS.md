# RohBar Agent Contract

## Mission
Finish RohBar as a production-grade intercity freight platform. Bias toward concrete implementation, verification, and delivery over discussion.

## Model / reasoning
Use GPT-6 Astra. `high` is the normal effort. Use `xhigh` only for architecture, security, migrations, concurrency, complex debugging, or high-impact refactors. Do not use Ultra by default.

## Execution
- Infer routine intent from repository context; ask only when missing input can materially change the result.
- Prefer one coherent vertical slice at a time and carry it through code, tests, docs, and a clean commit.
- Reuse current architecture before adding dependencies or abstractions.
- Use Context7/current authoritative docs only when version-specific behavior matters or is uncertain.
- Parallelize with subagents only when tasks are independent and do not touch overlapping files.
- Keep progress/final reports compact: facts, checks, commit/PR, blockers only.

## Repository invariants
- Never commit secrets or modify `infra/.env`.
- Do not use fake data, placeholders, dead controls, TODO-only implementations, or speculative scaffolding.
- Backend is authoritative for auth, RBAC, state transitions, capacity, offers, assignments, events, and idempotency.
- Schema changes use additive SQLx migrations and preserve existing data.
- User-facing product copy must support RU/TG; avoid expanding hard-coded Russian UI.

## Verification
Frontend changes: run lint, both configured TypeScript checks, and production build when the slice affects build/runtime behavior.

Backend changes: run `cargo fmt --check`, `cargo check --locked`, `cargo clippy --all-targets --all-features --locked -- -D warnings`, and relevant `cargo test --locked`.

Run narrow checks first. Do not repeat broad suites after they pass unless later changes invalidate them.

## Git / delivery
- Start from clean `main`; work on a descriptive branch/worktree.
- Never force-push `main` or rewrite shared history.
- Keep commits cohesive and production-ready.
- Do not deploy from Codex. Merge/deploy only after CI is green and production rollback remains available.
- Update README/roadmap when delivered functionality makes documentation stale.

## Priority
When no narrower task is given, advance remaining production gaps in this order: complete RU/TG localization; production Telegram integration; geocoding/maps/routing; E2E coverage; admin/analytics; observability; later product expansion.
