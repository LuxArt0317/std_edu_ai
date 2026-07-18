# Codex project controls

`hooks.json` activates a repository-scoped completion contract for GitHub Issue #58.

- `SessionStart` loads the remaining Phase 58 all-page Stitch requirements whenever Codex starts or resumes work in this trusted repository.
- `Stop` requires exactly 23 page rows with prompt, screen, HTML-control, implementation, test, review, deployment, and production evidence.
- `.codex/hooks/stitch_all_pages_guard.mjs` has no third-party dependencies, does not access secrets or the network, and emits only missing evidence and checklist labels.

Codex requires review and trust for new or changed project hooks. Open `/hooks`, review both commands, and trust them. Project hooks are ignored while the repository is untrusted.

Run the guard directly:

```bash
printf '{"cwd":"%s"}' "$PWD" | node .codex/hooks/stitch_all_pages_guard.mjs stop
```

The guard is an execution-continuity control, not proof that a design is usable. A Phase 58 item may be checked only after every page's generated controls are inspected, omissions are documented, accepted ideas are implemented through existing trusted workflows, regressions pass, and production is verified. The public `/` route is explicitly excluded from design changes.
