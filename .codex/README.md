# Optional research-completion controller

This inherited controller tracks the historical Issue #104 research-completion epic. It is opt-in in the client checkout: set `STU_RESEARCH_GUARD=1` only when deliberately working on that research epic. Normal client operations use AGENTS.md, deployment.json, and planning-with-files/.

The original guard implementation and evidence manifest are retained for traceability and automated contracts. It does not grant provider access or prove client readiness. Review and trust project hooks before enabling them.
