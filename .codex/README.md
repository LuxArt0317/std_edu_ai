# Codex project completion controller

This trusted project layer enforces the evidence contract for parent Issue #104 and child Issues #105–#116.

- `SessionStart` injects the current unresolved evidence summary.
- `Stop` prevents a successful completion handoff while locally actionable or malformed gates remain.
- External-only gates are reported explicitly and are never treated as completed or fabricated.
- `agent/research-104-evidence.json` is the machine-readable source of truth.
- `.codex/hooks/issue104_completion_guard.mjs` has no third-party dependencies, performs no network access, and emits no secrets.

Codex requires review and trust for project-local hooks. In Codex, open `/hooks`, review the two commands from `.codex/hooks.json`, and trust their current hashes. Project hooks are ignored when the repository is untrusted.

Run directly:

```bash
printf '{"cwd":"%s"}' "$PWD" | node .codex/hooks/issue104_completion_guard.mjs session
printf '{"cwd":"%s"}' "$PWD" | node .codex/hooks/issue104_completion_guard.mjs stop
npm run verify:research-104
```

The controller is a continuity guard, not evidence by itself. A measure may be set to `verified` only with a timestamp and concrete artifact, automated test, live result, review, deployment, or production link. External approvals, participant recruitment, physical walkthroughs, and institutional sign-off remain `external` until the responsible person supplies evidence.
