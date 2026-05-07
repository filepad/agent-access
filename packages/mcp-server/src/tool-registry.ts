// FILE MEMO: Canonical tool registry mapping Filepad Agent Access capabilities to MCP tools.
// Filtered by scopes. Schemas are generated from Zod contracts where possible.

import type {
  AgentAccessScope,
  AgentApiSearchMode,
  AgentCreateArtifactKind,
} from '@filepad/agent-access-sdk';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScopes: AgentAccessScope[];
}

// ── Typed argument shapes (used by handlers after Zod validation) ──

export interface SearchArgs {
  query: string;
  type?: AgentApiSearchMode | undefined;
  limit?: number | undefined;
}

export interface ReadFileArgs {
  fileNodeId: string;
}

export interface CreateArtifactArgs {
  title: string;
  text?: string | undefined;
  kind?: AgentCreateArtifactKind | undefined;
  format?: 'plain_text' | 'markdown' | 'prosemirror_json' | undefined;
}

export interface CreateArtifactFromFileArgs {
  path: string;
  title?: string | undefined;
  kind?: AgentCreateArtifactKind | undefined;
  format?: 'plain_text' | 'markdown' | 'prosemirror_json' | undefined;
}

export interface ProposeEditArgs {
  fileNodeId: string;
  baseVersionId: string;
  summary: string;
  newText: string;
}

export interface EmitEventArgs {
  eventType: string;
  payload?: Record<string, unknown> | undefined;
}

export interface CreateSignalArgs {
  findingTypeKey: string;
  summary: string;
  severity?: 'info' | 'warn' | 'high_alert' | undefined;
  value?: Record<string, unknown> | undefined;
}

export interface ListSignalsArgs {
  findingTypeKey?: string | undefined;
  severity?: 'info' | 'warn' | 'high_alert' | undefined;
  status?: 'suggested' | 'accepted' | 'rejected' | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface GetSignalArgs {
  signalId: string;
}

export interface AckNotificationArgs {
  ids: string[];
}

export type AgentProfileField =
  | 'identity'
  | 'learnings'
  | 'goals'
  | 'timeline';

export interface GetProfileArgs {
  fields?: AgentProfileField[] | undefined;
}

export interface UpdateProfileArgs {
  field: AgentProfileField;
  content: string;
  mode?: 'append' | 'replace' | undefined;
}

export interface ConstitutionArgs {
  refresh?: boolean | undefined;
}

const TOOL_REGISTRY: McpToolDefinition[] = [
  {
    name: 'filepad_connect',
    description:
      'START HERE. Connect to Filepad and return the full agent onboarding diagnostic: identity, workspace, scopes, RuntimeTools, agent home, mailbox, recent outcomes, and suggested first actions. Run this first and again when resuming work.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    requiredScopes: [],
  },
  {
    name: 'filepad_bootstrap',
    description:
      'START HERE alias for filepad_connect. Use this when your MCP client looks for bootstrap/connect tools. Returns the same onboarding diagnostic and suggested first actions.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    requiredScopes: [],
  },
  {
    name: 'filepad_health',
    description:
      'Check that Filepad MCP can authenticate to the workspace and report granted scopes.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    requiredScopes: [],
  },
  {
    name: 'filepad_search',
    description:
      'Search indexed workspace context using keyword, semantic, or hybrid retrieval. ' +
      'Returns matching files with relevance scores and excerpts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        type: {
          type: 'string',
          enum: ['hybrid', 'semantic', 'keyword'],
          description: 'Search mode',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 30,
          description: 'Maximum results to return',
        },
      },
      required: ['query'],
    },
    requiredScopes: ['tools:call', 'env:read'],
  },
  {
    name: 'filepad_read_file',
    description:
      'Read the content of a workspace file by its file node id. ' +
      'Returns inline text content or unsupported for binary files.',
    inputSchema: {
      type: 'object',
      properties: {
        fileNodeId: {
          type: 'string',
          description: 'File node id (fn_...)',
        },
      },
      required: ['fileNodeId'],
    },
    requiredScopes: ['tools:call', 'env:read'],
  },
  {
    name: 'filepad_list_tree',
    description:
      'List the workspace file tree. Returns folders and files visible to the agent.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    requiredScopes: ['tools:call', 'env:read'],
  },
  {
    name: 'filepad_create_artifact',
    description:
      'Create a new artifact in the Filepad workspace. ' +
      'Always pass text as markdown and set format to "markdown" — Filepad converts it to the correct editor format automatically. ' +
      'Choose kind based on what you are creating: ' +
      '"richDoc" for paginated documents (reports, summaries, papers, structured long-form content); ' +
      '"richText" for inline formatted notes with headings and lists; ' +
      '"note" for plain markdown notes; ' +
      '"sheet" for tabular data — pass a markdown table or CSV and Filepad builds the spreadsheet. ' +
      'The artifact becomes a permanent workspace file.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          maxLength: 500,
          description: 'Artifact title',
        },
        text: {
          type: 'string',
          description: 'Content as markdown. For sheet, use a markdown table (| Col | Col |) or CSV rows.',
        },
        kind: {
          type: 'string',
          enum: ['auto', 'note', 'richText', 'richDoc', 'sheet', 'diagram'],
          description:
            'Editor kind. richDoc = paginated document, richText = inline formatted note, note = plain markdown, sheet = spreadsheet, diagram = visual diagram.',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'csv', 'plain_text', 'prosemirror_json'],
          description:
            'Input format. Use "markdown" for all rich editors and notes. Use "csv" for sheet if passing raw CSV instead of a markdown table.',
        },
      },
      required: ['title'],
    },
    requiredScopes: ['tools:call', 'artifacts:direct_write'],
  },
  {
    name: 'filepad_create_artifact_from_file',
    description:
      'Create a Filepad artifact from a local file readable by this MCP server process. ' +
      'The file is read locally and converted the same way as filepad_create_artifact — markdown files become richDoc automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute local file path readable by the MCP process',
        },
        title: {
          type: 'string',
          maxLength: 500,
          description: 'Artifact title; defaults to the filename if omitted',
        },
        kind: {
          type: 'string',
          enum: ['auto', 'note', 'richText', 'richDoc', 'sheet', 'diagram'],
          description: 'Editor kind. Defaults to auto which creates richDoc from .md files.',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'csv', 'plain_text', 'prosemirror_json'],
          description: 'File format. Defaults to markdown for .md files.',
        },
      },
      required: ['path'],
    },
    requiredScopes: ['tools:call', 'artifacts:direct_write'],
  },
  {
    name: 'filepad_propose_edit',
    description:
      'Propose a reviewable edit to an existing file. ' +
      'The edit does not apply until a human approves it. ' +
      'Only files under artifacts/, agents/, skills/, and memory/ can be targeted.',
    inputSchema: {
      type: 'object',
      properties: {
        fileNodeId: {
          type: 'string',
          description: 'Target file node id (fn_...)',
        },
        baseVersionId: {
          type: 'string',
          description: 'Current version id to base the proposal on',
        },
        summary: {
          type: 'string',
          maxLength: 2000,
          description: 'Short summary of the proposed change',
        },
        newText: {
          type: 'string',
          description: 'Complete replacement text',
        },
      },
      required: ['fileNodeId', 'baseVersionId', 'summary', 'newText'],
    },
    requiredScopes: ['files:propose'],
  },
  {
    name: 'filepad_emit_event',
    description:
      'Emit an activity event into the workspace audit trail. ' +
      'Use this to report completion, milestones, or errors.',
    inputSchema: {
      type: 'object',
      properties: {
        eventType: {
          type: 'string',
          maxLength: 200,
          description: 'Event type identifier (e.g. agent.task.completed)',
        },
        payload: {
          type: 'object',
          description: 'Arbitrary JSON payload',
        },
      },
      required: ['eventType'],
    },
    requiredScopes: ['events.write'],
  },
  {
    name: 'filepad_create_signal',
    description:
      'Emit a signal (finding) into the workspace context engine. ' +
      'Signals represent observations, warnings, or alerts.',
    inputSchema: {
      type: 'object',
      properties: {
        findingTypeKey: {
          type: 'string',
          maxLength: 120,
          description: 'Signal classification key',
        },
        summary: {
          type: 'string',
          maxLength: 2000,
          description: 'Human-readable summary',
        },
        severity: {
          type: 'string',
          enum: ['info', 'warn', 'high_alert'],
          description: 'Signal severity',
        },
        value: {
          type: 'object',
          description: 'Structured signal payload',
        },
      },
      required: ['findingTypeKey', 'summary'],
    },
    requiredScopes: ['signals:write'],
  },
  {
    name: 'filepad_list_signals',
    description:
      'Query workspace signals visible to this agent. ' +
      'Signals are structured observations created by agents, Filepad, or automations.',
    inputSchema: {
      type: 'object',
      properties: {
        findingTypeKey: {
          type: 'string',
          description: 'Filter by signal type key',
        },
        severity: {
          type: 'string',
          enum: ['info', 'warn', 'high_alert'],
          description: 'Minimum severity to return',
        },
        status: {
          type: 'string',
          enum: ['suggested', 'accepted', 'rejected'],
          description: 'Filter by signal status',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Maximum signals to return',
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor from a previous response',
        },
      },
    },
    requiredScopes: ['env:read'],
  },
  {
    name: 'filepad_get_signal',
    description:
      'Read one workspace signal by id, including target, citations, provenance, status, and value.',
    inputSchema: {
      type: 'object',
      properties: {
        signalId: {
          type: 'string',
          description: 'Signal id',
        },
      },
      required: ['signalId'],
    },
    requiredScopes: ['env:read'],
  },
  {
    name: 'filepad_ack_notification',
    description:
      'Acknowledge one or more Filepad mailbox notifications after the agent has processed them.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 100,
          description: 'Mailbox notification ids to acknowledge',
        },
      },
      required: ['ids'],
    },
    requiredScopes: ['notifications:read'],
  },
  {
    name: 'filepad_get_profile',
    description:
      'Read this integration agent home profile from agents/integrations/{keyId}. ' +
      'Returns identity, learnings, goals, and timeline profile files when present.',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['identity', 'learnings', 'goals', 'timeline'],
          },
          description: 'Optional profile fields to read',
        },
      },
    },
    requiredScopes: ['env:read'],
  },
  {
    name: 'filepad_update_profile',
    description:
      'Propose a human-reviewable update to this integration agent profile. ' +
      'Writes are proposed edits, never direct mutations.',
    inputSchema: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          enum: ['identity', 'learnings', 'goals', 'timeline'],
          description: 'Profile field to update',
        },
        content: {
          type: 'string',
          description: 'Markdown content to append or replace',
        },
        mode: {
          type: 'string',
          enum: ['append', 'replace'],
          description: 'Append a dated entry or replace the full file',
        },
      },
      required: ['field', 'content'],
    },
    requiredScopes: ['env:read', 'files:propose'],
  },
  {
    name: 'filepad_get_constitution',
    description:
      'Get the workspace constitution — your authoritative workspace identity document. ' +
      'Returns role, territory, behavioral rules, active context, vocabulary, and communication protocols. ' +
      'Read this as you read your framework-native identity (SOUL.md). Refreshes active context on each call.',
    inputSchema: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: 'Force refresh active context from workspace state',
        },
      },
    },
    requiredScopes: ['env:read'],
  },
];

/**
 * Return tools visible to an agent given its granted scopes.
 */
export function listToolsForScopes(
  scopes: AgentAccessScope[],
): McpToolDefinition[] {
  const scopeSet = new Set(scopes);
  return TOOL_REGISTRY.filter((tool) =>
    tool.requiredScopes.every((s) => scopeSet.has(s)),
  );
}

export function findTool(name: string): McpToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}
