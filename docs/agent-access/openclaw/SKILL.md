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

## Required Behavior

- Start by calling `filepad_health` to confirm the connection, workspace, and granted scopes.
- Use `filepad_list_tree`, `filepad_read_file`, and `filepad_search` to inspect workspace context.
- Use Filepad paths and file node ids returned by Filepad tools. Do not guess ids.
- Create durable outputs with `filepad_create_artifact` when the task asks for a note, report, summary, or workspace artifact.
- Propose edits with `filepad_propose_edit` instead of directly changing Filepad-managed files.
- Emit progress or completion with `filepad_emit_event` when the work should appear in Filepad activity.
- Create watcher results/signals with `filepad_create_signal` only when the key has `signals:write` and the observation should be visible in Filepad.

## Do Not

- Do not use `exec`, shell scripts, local filesystem reads, or repository shortcuts to read or mutate Filepad-managed workspace files.
- Do not directly overwrite active workspace files.
- Do not approve your own proposals.
- Do not mutate `.filepad/` metadata.
- Do not treat hidden-from-agent files as available context.
- Do not use Filepad secrets in messages, artifacts, events, or proposals.

## Output Expectations

When you finish Filepad work, report:

- the Filepad tools you used,
- artifacts created,
- proposals submitted,
- events emitted,
- signals created, if any,
- anything blocked by scopes or human approval.
