# RohBar Agent Contract

## Mission
Finish RohBar as a production-grade intercity freight platform. Bias toward concrete implementation, verification, and delivery over discussion.

## Model / reasoning
Use GPT-6 Astra. `medium` is the default effort. Escalate to `high` only for architecture, security, migrations, concurrency, difficult debugging, or high-impact refactors. Use `xhigh` only when those tasks remain genuinely hard. Do not use Ultra by default.

## Context discipline
- Treat an explicit task handoff and current Git diff as authoritative; do not rediscover known project context.
- For substantial follow-up work, prefer a fresh bounded session with a compact handoff over resuming a long high-context session.
- Start with targeted files/diff. Do not scan the whole repo, history, README, or docs unless the task requires it.
- Use Context7 for current library/framework/SDK/API/CLI documentation when implementation depends on version-specific behavior or the API is uncertain. Prefer it over generic web search for library docs.
- Use live web search for current non-library facts or when Context7 is incomplete; do not query both sources redundantly.
- Do not repeat tool calls for facts already established in the current handoff, diff, or validated local state.
- Load skills only when they materially apply; never preload all skill/reference content.
- After a green validation snapshot, rerun only checks invalidated by later edits.
- Keep tool output bounded (`rg` paths/limits, focused diffs, narrow tests).

## Execution
- Infer routine intent from repository context; ask only when missing input can materially change the result.
- Prefer one coherent vertical slice at a time and carry it through code, tests, docs, and a clean commit.
- Reuse current architecture before adding dependencies or abstractions.
- Keep useful tools available; optimize invocation frequency rather than disabling capability. Use Context7 before guessing versioned APIs, and cite/record only the narrow facts needed for implementation.
- Parallelize with subagents only when tasks are independent and do not touch overlapping files; default subagents to low effort and escalate only when their subtask warrants it.
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
