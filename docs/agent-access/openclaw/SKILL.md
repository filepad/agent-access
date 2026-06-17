---
name: filepad-ai
description: Use Filepad as the workspace interface for files, search, artifacts, proposals, and activity.
metadata:
  openclaw:
    requires:
      bins: ["npx"]
    homepage: "https://filepad.ai"
---

# Filepad

Use Filepad MCP for workspace file work. Treat Filepad as the source of truth for Filepad-managed workspace files, context, artifacts, and reviewable changes.

This skill is the behavior bridge. MCP exposes the tools; these instructions
make Filepad part of the OpenClaw startup loop instead of a passive toolbox.

## Required Behavior

- Start by calling `filepad_bootstrap` to confirm the connection, workspace, granted scopes, available tools, mailbox, recent outcomes, and suggested first actions.
- Treat the `bootstrap.suggestedFirstActions` and `bootstrap.availableToolGroups` response fields as the session startup checklist.
- Use `ask_filepadai` to delegate Filepad workspace work through FilepadAI instead of guessing private workspace internals.
- Use `get_filepadai_task` and `list_filepadai_tasks` to inspect task state returned by FilepadAI.
- Use `register_callback_endpoint` only when this agent host exposes a reachable callback URL for task updates.
- Do not invent Filepad tool names. If a required capability is missing from `filepad_bootstrap`, report the missing capability instead of routing around MCP.

## Do Not

- Do not use `exec`, shell scripts, local filesystem reads, or repository shortcuts to read or mutate Filepad-managed workspace files.
- Do not treat hidden-from-agent files as available context.
- Do not call Filepad HTTP internals directly when a canonical MCP tool exists.
- Do not use Filepad secrets in messages, artifacts, events, or proposals.

## Output Expectations

When you finish Filepad work, report:

- the Filepad MCP tools you used,
- FilepadAI tasks created or inspected,
- callback endpoints registered, if any,
- anything blocked by scopes or human approval.
