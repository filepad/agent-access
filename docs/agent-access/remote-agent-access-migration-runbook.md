# Remote Agent Access Migration Runbook

1. Publish `@filepad/agent-connect` and `@filepad/agent-access-sdk`.
2. Ensure pairing responses include remote endpoint URL, transport, and bearer
   handoff header.
3. Update frontend agent setup to present pairing as the primary path.
4. Remove local bridge packages, tests, scripts, and docs.
5. Verify backend typecheck, frontend typecheck, SDK tests, agent-connect tests,
   and targeted backend remote MCP tests.
6. Deploy backend before frontend so generated pairing codes have a valid remote
   transport response.
7. Roll back by disabling pairing-code creation for affected runtimes while
   keeping existing Agent Access HMAC API clients alive.
