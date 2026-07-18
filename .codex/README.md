# Codex project controls

`hooks.json` activates a repository-scoped completion contract for GitHub Issue #48.

- `SessionStart` loads the remaining Phase 48 requirements whenever Codex starts or resumes work in this trusted repository.
- `Stop` reads the authoritative Phase 48 checklist and prevents a successful completion handoff while any requirement remains unchecked.
- `.codex/hooks/needed_completion_guard.mjs` has no third-party dependencies, does not access secrets or the network, and emits only the remaining checklist labels.

Codex requires review and trust for new or changed project hooks. Open `/hooks`, review both commands, and trust them. Project hooks are ignored while the repository is untrusted.

Run the guard directly:

```bash
printf '{"cwd":"%s"}' "$PWD" | node .codex/hooks/needed_completion_guard.mjs stop
```

The guard is an execution-continuity control, not proof that a feature exists. A Phase 48 item may be checked only after its visible UI, repository operation, trusted authorization/RLS, required audit behavior, production deployment, and live evidence are confirmed.
