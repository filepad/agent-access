# Remote Agent Access Observability

Remote MCP production readiness requires visibility into:

- pairing-code creation, exchange, expiry, and rejection
- remote MCP initialize, tools/list, and tools/call traffic
- authentication failures and revoked credential attempts
- per-workspace rate and concurrency limits
- tool call latency and error class
- contract/evidence writes created by agent actions
- runtime hook blocks or warnings where hooks are installed

Dashboards should separate user-caused auth failures from backend regressions.
