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

export interface ListActiveContractsArgs {
  limit?: number | undefined;
}

export interface ReadActiveContractArgs {
  contractId: string;
}

export interface CreateContractArgs {
  sourceText: string;
}

export interface UpdateContractArgs {
  sourceText: string;
}

export interface RecordContractEvidenceArgs {
  contractId: string;
  checkId?: string | undefined;
  source?: string | undefined;
  status: 'passing' | 'failing' | 'blocked' | 'unverified';
  summary: string;
}

export interface GetContractStatusArgs {
  contractId: string;
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

export interface DescribeToolArgs {
  toolName: string;
}

const TOOL_REGISTRY: McpToolDefinition[] = [
  {
    name: 'filepad_bootstrap',
    description:
      'START HERE. Return the compact Filepad operating brief: workspace identity, permissions, active contracts, assignment, mailbox count, and the next useful action.',
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
    name: 'filepad_describe_tool',
    description:
      'Describe one Filepad tool in detail. Use this only when the compact bootstrap quick reference is not enough and you need the full schema for a specific tool.',
    inputSchema: {
      type: 'object',
      properties: {
        toolName: {
          type: 'string',
          description: 'MCP tool name or RuntimeTool provider name to describe',
        },
      },
      required: ['toolName'],
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
      'Propose a reviewable edit to an existing workspace file. Required shape: filepad_propose_edit({"fileNodeId":"fn_...","baseVersionId":"av_...","summary":"Short change summary","newText":"Complete replacement text"}). ' +
      'The edit does not apply until a human approves it.',
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
      'Read this integration profile from Filepad workspace and integration metadata. ' +
      'Returns identity metadata and clear unavailable markers for legacy profile fields.',
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
      'Get the workspace operating context — permissions, behavioral rules, active context, vocabulary, and communication protocols. ' +
      'Use this for workspace-level configuration; prefer filepad_bootstrap for session start.',
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
  {
    name: 'filepad_diagram_get_structure',
    description:
      'Read the current nodes and edges of a diagram artifact as structured JSON. ' +
      'Always call this before any diagram mutation to discover existing node IDs and the current graph state.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', description: 'Diagram artifact id' },
      },
      required: ['artifactId'],
    },
    requiredScopes: ['tools:call', 'env:read'],
  },
  {
    name: 'filepad_diagram_add_node',
    description:
      'Add a new node to a diagram artifact. ' +
      "Provide a short slug-style id (e.g. 'auth_service', no spaces). " +
      'Use label for the human-readable display text. ' +
      'Call filepad_diagram_get_structure first to see existing nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', description: 'Diagram artifact id' },
        baseVersionId: { type: 'string', description: 'Current version id from get_structure' },
        id: {
          type: 'string',
          description: 'Unique slug-style node id (letters, digits, underscores)',
        },
        label: { type: 'string', description: 'Human-readable display text for the node' },
        shape: {
          type: 'string',
          enum: ['rect', 'stadium', 'rhombus', 'circle'],
          description: 'Node shape (default: rect)',
        },
      },
      required: ['artifactId', 'baseVersionId', 'id', 'label'],
    },
    requiredScopes: ['tools:call', 'artifacts:direct_write'],
  },
  {
    name: 'filepad_diagram_add_edge',
    description:
      'Add a directed edge between two existing nodes in a diagram artifact. ' +
      'Call filepad_diagram_get_structure first to find valid node IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', description: 'Diagram artifact id' },
        baseVersionId: { type: 'string', description: 'Current version id from get_structure' },
        from: { type: 'string', description: 'Source node id' },
        to: { type: 'string', description: 'Target node id' },
        label: { type: 'string', description: 'Optional edge label' },
      },
      required: ['artifactId', 'baseVersionId', 'from', 'to'],
    },
    requiredScopes: ['tools:call', 'artifacts:direct_write'],
  },
  {
    name: 'filepad_diagram_remove_node',
    description:
      'Remove a node and all its connected edges from a diagram artifact.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', description: 'Diagram artifact id' },
        baseVersionId: { type: 'string', description: 'Current version id from get_structure' },
        id: { type: 'string', description: 'Node id to remove' },
      },
      required: ['artifactId', 'baseVersionId', 'id'],
    },
    requiredScopes: ['tools:call', 'artifacts:direct_write'],
  },
  {
    name: 'filepad_diagram_update_node',
    description:
      'Update the label or shape of an existing node in a diagram artifact.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', description: 'Diagram artifact id' },
        baseVersionId: { type: 'string', description: 'Current version id from get_structure' },
        id: { type: 'string', description: 'Node id to update' },
        label: { type: 'string', description: 'New label (omit to keep current)' },
        shape: {
          type: 'string',
          enum: ['rect', 'stadium', 'rhombus', 'circle'],
          description: 'New shape (omit to keep current)',
        },
      },
      required: ['artifactId', 'baseVersionId', 'id'],
    },
    requiredScopes: ['tools:call', 'artifacts:direct_write'],
  },
  {
    name: 'filepad_diagram_patch',
    description:
      'Apply multiple diagram operations atomically in a single call. ' +
      'Use this when building a new diagram from scratch or making several related changes at once — ' +
      'it saves all changes as one version rather than one approval per operation.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', description: 'Diagram artifact id' },
        baseVersionId: { type: 'string', description: 'Current version id from get_structure' },
        ops: {
          type: 'array',
          description: 'Ordered list of diagram operations to apply',
          minItems: 1,
          maxItems: 200,
          items: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: ['add_node', 'add_edge', 'remove_node', 'update_node', 'remove_edge'],
              },
            },
            required: ['kind'],
          },
        },
      },
      required: ['artifactId', 'baseVersionId', 'ops'],
    },
    requiredScopes: ['tools:call', 'artifacts:direct_write'],
  },
  // ── Active Contracts ──
  {
    name: 'filepad_list_active_contracts',
    description:
      'List active contracts in the workspace. Active contracts are durable agreements that track work, rules, checks, and evidence. Use this to see what work is governed by contracts.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100, description: 'Max results' },
      },
    },
    requiredScopes: ['env:read'],
  },
  {
    name: 'filepad_read_active_contract',
    description:
      'Read a specific active contract with its checks and evidence. Returns the full contract projection, check statuses, and recent evidence records.',
    inputSchema: {
      type: 'object',
      properties: {
        contractId: { type: 'string', description: 'Contract ID' },
      },
      required: ['contractId'],
    },
    requiredScopes: ['env:read'],
  },
  {
    name: 'filepad_create_contract',
    description:
      'Create a Filepad active contract from YAML text. Use this when the user asks you to create a governed, machine-checkable contract from a brief or plan. Returns the contract id, lifecycle status, and approval message.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceText: { type: 'string', description: 'Complete Filepad contract YAML.' },
      },
      required: ['sourceText'],
    },
    requiredScopes: ['tools:call', 'artifacts:write'],
  },
  {
    name: 'filepad_update_contract',
    description:
      'Update an existing Filepad active contract from replacement YAML text. The YAML must identify the existing contract. Returns the contract id, lifecycle status, and approval message.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceText: { type: 'string', description: 'Complete replacement Filepad contract YAML.' },
      },
      required: ['sourceText'],
    },
    requiredScopes: ['tools:call', 'artifacts:write'],
  },
  {
    name: 'filepad_record_contract_evidence',
    description:
      'Record evidence for an active contract check. This updates check status and can change contract verification state. Use this only for evidence the agent actually observed; Guardian and hooks own freshness/staleness.',
    inputSchema: {
      type: 'object',
      properties: {
        contractId: { type: 'string', description: 'Contract ID' },
        checkId: { type: 'string', description: 'Optional check ID' },
        source: { type: 'string', enum: ['user', 'filepad_ai', 'external_agent', 'guardian', 'github', 'ci', 'temporal', 'system'] },
        sourceName: { type: 'string', description: 'Human-readable source name (e.g. filepad-guardian)' },
        sourceRuntime: { type: 'string', description: 'Runtime identifier (e.g. cli)' },
        status: { type: 'string', enum: ['passing', 'failing', 'blocked', 'unverified'] },
        summary: { type: 'string', description: 'Evidence summary (1-2000 chars)' },
        provenance: { type: 'object', description: 'First-class provenance: command, cwd, exitCode, stdoutDigest, stderrDigest, gitSha, gitBranch, filePaths, fileHashes, url, sourceId' },
        freshness: { type: 'object', description: 'Freshness metadata: affectedPaths, validForTreeHash, validForGitSha' },
        observedAt: { type: 'string', description: 'ISO timestamp when evidence was observed' },
        data: { type: 'object', description: 'Additional data payload (non-canonical extras only)' },
      },
      required: ['contractId', 'status', 'summary'],
    },
    requiredScopes: ['tools:call', 'artifacts:write'],
  },
  {
    name: 'filepad_get_contract_status',
    description:
      'Get the current contract lifecycle status, verification status, done-when completion, pending approval flag, and per-check statuses.',
    inputSchema: {
      type: 'object',
      properties: {
        contractId: { type: 'string', description: 'Contract ID' },
      },
      required: ['contractId'],
    },
    requiredScopes: ['tools:call'],
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
