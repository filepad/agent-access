# Remote Agent Access Migration Runbook

1. Publish `@filepad/agent-connect` and `@filepad/agent-access-sdk`.
2. Ensure OAuth setup writes remote endpoint URL, transport, and bearer
   headers.
3. Update frontend agent setup to present OAuth MCP setup as the primary path.
4. Remove local bridge packages, tests, scripts, and docs.
5. Verify backend typecheck, frontend typecheck, SDK tests, agent-connect tests,
   and targeted backend remote MCP tests.
6. Deploy backend before frontend so OAuth MCP setup has a valid remote
   transport response.
7. Roll back by disabling OAuth setup for affected runtimes while
   keeping existing Agent Access HMAC API clients alive.
