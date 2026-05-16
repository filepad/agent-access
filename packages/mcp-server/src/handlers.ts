// FILE MEMO: MCP protocol handlers. Zero business logic — delegates to FilepadAgentClient.
// All tool arguments are parsed through typed schemas before SDK calls.

import type { FilepadAgentClient } from '@filepad/agent-access-sdk';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type {
  AgentAccessScope,
  AgentCreateArtifactKind,
} from '@filepad/agent-access-sdk';
import { findTool, listToolsForScopes } from './tool-registry.js';
import { FILEPAD_MCP_SERVER_VERSION } from './version.js';
import type {
  SearchArgs,
  ReadFileArgs,
  CreateArtifactArgs,
  CreateArtifactFromFileArgs,
  ProposeEditArgs,
  EmitEventArgs,
  CreateSignalArgs,
  ListSignalsArgs,
  GetSignalArgs,
  AckNotificationArgs,
  GetProfileArgs,
  UpdateProfileArgs,
  ConstitutionArgs,
  AgentProfileField,
} from './tool-registry.js';

export interface McpHandlerContext {
  client: FilepadAgentClient;
  workspaceId: string;
  scopes: AgentAccessScope[];
}

// ── Typed argument validators (lightweight, no Zod dependency in this layer) ──

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing or invalid required field: ${field}`);
  }
  return value;
}

function assertOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return undefined;
  return value;
}

function assertOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function assertOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Missing or invalid required field: ${field}`);
  }
  const strings = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  if (strings.length !== value.length || strings.length === 0) {
    throw new Error(`Missing or invalid required field: ${field}`);
  }
  return strings;
}

const AGENT_ARTIFACT_KINDS = new Set<string>([
  'note',
  'auto',
  'richText',
  'richDoc',
  'diagram',
  'sheet',
]);

function isAgentArtifactKind(value: string): value is AgentCreateArtifactKind {
  return AGENT_ARTIFACT_KINDS.has(value);
}

function isArtifactFormat(
  value: string | undefined,
): value is CreateArtifactArgs['format'] {
  return (
    value === 'plain_text' ||
    value === 'markdown' ||
    value === 'prosemirror_json'
  );
}

function parseSearchArgs(args: unknown): SearchArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Missing arguments for filepad_search');
  }
  const a = args as Record<string, unknown>;
  const type = assertOptionalString(a['type']);
  const typeSet = new Set<string>(['hybrid', 'semantic', 'keyword']);
  return {
    query: assertString(a['query'], 'query'),
    type: type && typeSet.has(type) ? (type as SearchArgs['type']) : undefined,
    limit: assertOptionalNumber(a['limit']),
  };
}

function parseReadFileArgs(args: unknown): ReadFileArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Missing arguments for filepad_read_file');
  }
  const a = args as Record<string, unknown>;
  return {
    fileNodeId: assertString(a['fileNodeId'], 'fileNodeId'),
  };
}

function parseCreateArtifactArgs(args: unknown): CreateArtifactArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Missing arguments for filepad_create_artifact');
  }
  const a = args as Record<string, unknown>;
  const kind = assertOptionalString(a['kind']);
  const format = assertOptionalString(a['format']);
  return {
    title: assertString(a['title'], 'title'),
    text: assertOptionalString(a['text']),
    kind: kind && isAgentArtifactKind(kind) ? kind : undefined,
    format: isArtifactFormat(format) ? format : undefined,
  };
}

function parseCreateArtifactFromFileArgs(args: unknown): CreateArtifactFromFileArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Missing arguments for filepad_create_artifact_from_file');
  }
  const a = args as Record<string, unknown>;
  const kind = assertOptionalString(a['kind']);
  const format = assertOptionalString(a['format']);
  return {
    path: assertString(a['path'], 'path'),
    title: assertOptionalString(a['title']),
    kind: kind && isAgentArtifactKind(kind) ? kind : undefined,
    format: isArtifactFormat(format) ? format : undefined,
  };
}

function inferArtifactFormatFromPath(path: string): CreateArtifactArgs['format'] {
  return extname(path).toLowerCase() === '.md' ? 'markdown' : 'plain_text';
}

function parseProposeEditArgs(args: unknown): ProposeEditArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Missing arguments for filepad_propose_edit');
  }
  const a = args as Record<string, unknown>;
  return {
    fileNodeId: assertString(a['fileNodeId'], 'fileNodeId'),
    baseVersionId: assertString(a['baseVersionId'], 'baseVersionId'),
    summary: assertString(a['summary'], 'summary'),
    newText: assertString(a['newText'], 'newText'),
  };
}

function parseEmitEventArgs(args: unknown): EmitEventArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Missing arguments for filepad_emit_event');
  }
  const a = args as Record<string, unknown>;
  return {
    eventType: assertString(a['eventType'], 'eventType'),
    payload: assertOptionalRecord(a['payload']),
  };
}

function parseCreateSignalArgs(args: unknown): CreateSignalArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Missing arguments for filepad_create_signal');
  }
  const a = args as Record<string, unknown>;
  const severity = assertOptionalString(a['severity']);
  const severitySet = new Set<string>(['info', 'warn', 'high_alert']);
  return {
    findingTypeKey: assertString(a['findingTypeKey'], 'findingTypeKey'),
    summary: assertString(a['summary'], 'summary'),
    severity: severity && severitySet.has(severity)
      ? (severity as CreateSignalArgs['severity'])
      : undefined,
    value: assertOptionalRecord(a['value']),
  };
}

function parseListSignalsArgs(args: unknown): ListSignalsArgs {
  if (args === undefined || args === null) return {};
  if (typeof args !== 'object') {
    throw new Error('Invalid arguments for filepad_list_signals');
  }
  const a = args as Record<string, unknown>;
  const severity = assertOptionalString(a['severity']);
  const severitySet = new Set<string>(['info', 'warn', 'high_alert']);
  const status = assertOptionalString(a['status']);
  const statusSet = new Set<string>(['suggested', 'accepted', 'rejected']);
  return {
    findingTypeKey: assertOptionalString(a['findingTypeKey']),
    severity: severity && severitySet.has(severity)
      ? (severity as ListSignalsArgs['severity'])
      : undefined,
    status: status && statusSet.has(status)
      ? (status as ListSignalsArgs['status'])
      : undefined,
    limit: assertOptionalNumber(a['limit']),
    cursor: assertOptionalString(a['cursor']),
  };
}

function parseGetSignalArgs(args: unknown): GetSignalArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Missing arguments for filepad_get_signal');
  }
  const a = args as Record<string, unknown>;
  return {
    signalId: assertString(a['signalId'], 'signalId'),
  };
}

function parseAckNotificationArgs(args: unknown): AckNotificationArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Missing arguments for filepad_ack_notification');
  }
  const a = args as Record<string, unknown>;
  return {
    ids: assertStringArray(a['ids'], 'ids'),
  };
}

const agentProfileFieldSet = new Set<string>([
  'identity',
  'learnings',
  'goals',
  'timeline',
]);

function isAgentProfileField(value: string): value is AgentProfileField {
  return agentProfileFieldSet.has(value);
}

function parseAgentProfileField(
  value: unknown,
  fieldName: string,
): AgentProfileField {
  const parsed = assertString(value, fieldName);
  if (!isAgentProfileField(parsed)) {
    throw new Error(`Invalid ${fieldName}: ${parsed}`);
  }
  return parsed;
}

function parseGetProfileArgs(args: unknown): GetProfileArgs {
  if (args === undefined || args === null) return {};
  if (typeof args !== 'object') {
    throw new Error('Invalid arguments for filepad_get_profile');
  }
  const a = args as Record<string, unknown>;
  const fieldsValue = a['fields'];
  if (fieldsValue === undefined || fieldsValue === null) return {};
  if (!Array.isArray(fieldsValue)) {
    throw new Error('Invalid fields for filepad_get_profile');
  }
  return {
    fields: fieldsValue.map((value) =>
      parseAgentProfileField(value, 'fields'),
    ),
  };
}

function parseUpdateProfileArgs(args: unknown): UpdateProfileArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Missing arguments for filepad_update_profile');
  }
  const a = args as Record<string, unknown>;
  const mode = assertOptionalString(a['mode']);
  const parsedMode =
    mode === 'append' || mode === 'replace' ? mode : undefined;
  return {
    field: parseAgentProfileField(a['field'], 'field'),
    content: assertString(a['content'], 'content'),
    mode: parsedMode,
  };
}

function parseConstitutionArgs(args: unknown): ConstitutionArgs {
  if (args === undefined || args === null) return {};
  if (typeof args !== 'object') return {};
  const a = args as Record<string, unknown>;
  return {
    refresh: typeof a['refresh'] === 'boolean' ? a['refresh'] : undefined,
  };
}

export async function handleInitialize() {
  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
    instructions:
      'Filepad is an agent-first workspace. Call filepad_connect or filepad_bootstrap before any other Filepad tool. The response includes identity, workspace, scopes, available RuntimeTools, agent home, mailbox, recent outcomes, missing permissions, and suggested first actions.',
    serverInfo: {
      name: 'filepad',
      version: FILEPAD_MCP_SERVER_VERSION,
    },
  };
}

export async function handleListTools(
  _request: unknown,
  ctx: McpHandlerContext,
) {
  const listed = await ctx.client.listTools();
  const tools = [
    ...listToolsForScopes(ctx.scopes).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
    ...listed.tools.map((tool) => ({
      name: tool.providerName,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  ];
  return {
    tools,
  };
}

export async function handleCallTool(
  request: unknown,
  ctx: McpHandlerContext,
) {
  const req = request as { params: { name: string; arguments?: unknown } };
  const { name, arguments: args } = req.params;
  const tool = findTool(name);
  if (!tool) {
    const result = await ctx.client.callTool({
      toolName: name,
      input: args,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  const scopeSet = new Set(ctx.scopes);
  const missing = tool.requiredScopes.filter((s) => !scopeSet.has(s));
  if (missing.length > 0) {
    throw new Error(`Missing required scopes: ${missing.join(', ')}`);
  }

  // Delegate to Agent Access SDK — zero business logic here
  switch (name) {
    case 'filepad_health': {
      const result = await ctx.client.verifyCredentials();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'ok',
                workspaceId: ctx.workspaceId,
                scopes: result.scopes,
                version: FILEPAD_MCP_SERVER_VERSION,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case 'filepad_connect':
    case 'filepad_bootstrap': {
      const result = await ctx.client.connect();
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'filepad_search': {
      const parsed = parseSearchArgs(args);
      const result = await ctx.client.callTool({
        toolName: 'workspace_search',
        input: {
          query: parsed.query,
          ...(parsed.type ? { searchType: parsed.type } : {}),
          ...(parsed.limit ? { limit: parsed.limit } : {}),
        },
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'filepad_read_file': {
      const parsed = parseReadFileArgs(args);
      const result = await ctx.client.callTool({
        toolName: 'workspace_read_file',
        input: { fileNodeId: parsed.fileNodeId },
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'filepad_list_tree': {
      const result = await ctx.client.callTool({
        toolName: 'workspace_list_file_tree',
        input: {},
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'filepad_create_artifact': {
      const parsed = parseCreateArtifactArgs(args);
      const result = await ctx.client.createArtifact({
        title: parsed.title,
        text: parsed.text ?? '',
        ...(parsed.kind ? { kind: parsed.kind } : {}),
        ...(parsed.format ? { format: parsed.format } : {}),
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'filepad_create_artifact_from_file': {
      const parsed = parseCreateArtifactFromFileArgs(args);
      const text = await readFile(parsed.path, 'utf8');
      const result = await ctx.client.createArtifact({
        title: parsed.title ?? basename(parsed.path),
        text,
        kind: parsed.kind ?? 'auto',
        format: parsed.format ?? inferArtifactFormatFromPath(parsed.path),
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'filepad_propose_edit': {
      const parsed = parseProposeEditArgs(args);
      const result = await ctx.client.proposeEdit({
        fileNodeId: parsed.fileNodeId,
        baseVersionId: parsed.baseVersionId,
        summary: parsed.summary,
        newText: parsed.newText,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'filepad_emit_event': {
      const parsed = parseEmitEventArgs(args);
      const result = await ctx.client.createEvent({
        eventType: parsed.eventType,
        ...(parsed.payload ? { payload: parsed.payload } : {}),
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'filepad_create_signal': {
      const parsed = parseCreateSignalArgs(args);
      const result = await ctx.client.createSignal({
        findingTypeKey: parsed.findingTypeKey,
        summary: parsed.summary,
        ...(parsed.severity ? { severity: parsed.severity } : {}),
        ...(parsed.value ? { value: parsed.value } : {}),
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'filepad_list_signals': {
      const parsed = parseListSignalsArgs(args);
      const result = await ctx.client.getSignals(parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'filepad_get_signal': {
      const parsed = parseGetSignalArgs(args);
      const result = await ctx.client.getSignal(parsed.signalId);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'filepad_ack_notification': {
      const parsed = parseAckNotificationArgs(args);
      const result = await ctx.client.ackMailbox(parsed.ids);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'filepad_get_profile': {
      const parsed = parseGetProfileArgs(args);
      const result = await ctx.client.getAgentProfile(parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'filepad_update_profile': {
      const parsed = parseUpdateProfileArgs(args);
      const result = await ctx.client.updateAgentProfile(parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'filepad_get_constitution': {
      parseConstitutionArgs(args);
      const result = await ctx.client.getConstitution();
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    default:
      throw new Error(`Unhandled tool: ${name}`);
  }
}

export async function handleListResources(
  _request: unknown,
  ctx: McpHandlerContext,
) {
  const canReadEnvironment = ctx.scopes.includes('env:read');
  const canReadMailbox = ctx.scopes.includes('notifications:read');
  const tree = canReadEnvironment
    ? await ctx.client.getFileTree()
    : { nodes: [] };

  const resources = [
    ...(canReadMailbox
      ? [
          {
            uri: `filepad://workspace/${ctx.workspaceId}/mailbox`,
            name: 'mailbox',
            mimeType: 'application/json',
            description:
              'Unread and recent notifications for this external agent',
          },
        ]
      : []),
    ...(canReadEnvironment
      ? [
          {
            uri: `filepad://workspace/${ctx.workspaceId}/constitution`,
            name: 'constitution',
            mimeType: 'application/json',
            description:
              'Workspace constitution — authoritative identity document for this external agent',
          },
          {
            uri: `filepad://workspace/${ctx.workspaceId}/environment`,
            name: 'environment',
            mimeType: 'application/json',
            description: 'Workspace environment summary',
          },
          {
            uri: `filepad://workspace/${ctx.workspaceId}/tree`,
            name: 'file-tree',
            mimeType: 'application/json',
            description: 'Workspace file tree',
          },
        ]
      : []),
    ...tree.nodes
      .filter((n) => n.kind === 'file')
      .map((n) => ({
        uri: `filepad://workspace/${ctx.workspaceId}/files/${n.id}`,
        name: n.name,
        mimeType: n.name.endsWith('.md') ? 'text/markdown' : 'text/plain',
        description: `Workspace file: ${n.name}`,
      })),
  ];

  return { resources };
}

export async function handleReadResource(
  request: unknown,
  ctx: McpHandlerContext,
) {
  const req = request as { params: { uri: string } };
  const uri = req.params.uri;

  if (uri === `filepad://workspace/${ctx.workspaceId}/environment`) {
    const env = await ctx.client.getEnvironment();
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(env, null, 2),
        },
      ],
    };
  }

  if (uri === `filepad://workspace/${ctx.workspaceId}/constitution`) {
    const result = await ctx.client.getConstitution();
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  if (uri === `filepad://workspace/${ctx.workspaceId}/tree`) {
    const tree = await ctx.client.getFileTree();
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(tree, null, 2),
        },
      ],
    };
  }

  if (uri === `filepad://workspace/${ctx.workspaceId}/mailbox`) {
    const mailbox = await ctx.client.getMailbox({ limit: 50 });
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(mailbox, null, 2),
        },
      ],
    };
  }

  const fileMatch = uri.match(
    new RegExp(`^filepad://workspace/${ctx.workspaceId}/files/(.+)$`),
  );
  if (fileMatch && fileMatch[1]) {
    const file = await ctx.client.getFile(fileMatch[1]);
    const text =
      file.content.kind === 'inlineText'
        ? (file.content.text ?? '')
        : JSON.stringify(file.content);
    return {
      contents: [
        {
          uri,
          mimeType: file.node.name.endsWith('.md')
            ? 'text/markdown'
            : 'text/plain',
          text,
        },
      ],
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}

export async function handleListPrompts(
  _request: unknown,
  ctx: McpHandlerContext,
) {
  const prompts = await ctx.client.getMcpPrompts();
  return {
    prompts: prompts.prompts.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    })),
  };
}

export async function handleGetPrompt(
  request: unknown,
  ctx: McpHandlerContext,
) {
  const req = request as { params: { name: string } };
  const { name } = req.params;
  const prompts = await ctx.client.getMcpPrompts();
  const prompt = prompts.prompts.find((p) => p.name === name);
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  const fileNodeId = prompt.contentUrl.split('/').pop();
  if (!fileNodeId) {
    throw new Error(`Invalid contentUrl for prompt: ${name}`);
  }

  const file = await ctx.client.getFile(fileNodeId);

  return {
    description: prompt.description,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            file.content.kind === 'inlineText'
              ? (file.content.text ?? '')
              : '',
        },
      },
    ],
  };
}
