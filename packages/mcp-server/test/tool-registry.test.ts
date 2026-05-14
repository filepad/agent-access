// TEST CATEGORY: unit
import { describe, expect, it } from 'vitest';

import { listToolsForScopes, findTool } from '../src/tool-registry.js';
import type { AgentAccessScope } from '@filepad/agent-access-sdk';

describe('tool-registry', () => {
  it('returns all tools when all scopes granted', () => {
	    const scopes: AgentAccessScope[] = [
	      'env:read',
	      'tools:call',
	      'artifacts:direct_write',
	      'files:propose',
      'events.write',
      'signals:write',
      'memory:read',
      'notifications:read',
    ];
    const tools = listToolsForScopes(scopes);
    expect(tools.length).toBeGreaterThanOrEqual(5);
    expect(tools.map((t) => t.name)).toContain('filepad_bootstrap');
    expect(tools.map((t) => t.name)).toContain('filepad_health');
    expect(tools.map((t) => t.name)).toContain('filepad_describe_tool');
    expect(tools.map((t) => t.name)).toContain('filepad_search');
    expect(tools.map((t) => t.name)).toContain('filepad_create_artifact');
    expect(tools.map((t) => t.name)).toContain('filepad_propose_edit');
    expect(tools.map((t) => t.name)).toContain('filepad_emit_event');
    expect(tools.map((t) => t.name)).toContain('filepad_create_signal');
    expect(tools.map((t) => t.name)).toContain('filepad_list_signals');
    expect(tools.map((t) => t.name)).toContain('filepad_get_signal');
    expect(tools.map((t) => t.name)).toContain('filepad_ack_notification');
    expect(tools.map((t) => t.name)).toContain('filepad_get_profile');
    expect(tools.map((t) => t.name)).toContain('filepad_update_profile');
  });

  it('does not expose RuntimeTool-backed read aliases without tools:call', () => {
    const tools = listToolsForScopes(['env:read']);
    expect(tools.map((t) => t.name)).toContain('filepad_bootstrap');
    expect(tools.map((t) => t.name)).toContain('filepad_health');
    expect(tools.map((t) => t.name)).not.toContain('filepad_search');
    expect(tools.map((t) => t.name)).not.toContain('filepad_read_file');
    expect(tools.map((t) => t.name)).not.toContain('filepad_list_tree');
    expect(tools.map((t) => t.name)).toContain('filepad_list_signals');
    expect(tools.map((t) => t.name)).toContain('filepad_get_signal');
    expect(tools.map((t) => t.name)).toContain('filepad_get_profile');
    expect(tools.map((t) => t.name)).not.toContain('filepad_create_artifact');
    expect(tools.map((t) => t.name)).not.toContain('filepad_propose_edit');
    expect(tools.map((t) => t.name)).not.toContain('filepad_update_profile');
  });

  it('does not expose deprecated filepad_connect in the advertised tool list', () => {
    const scopes: AgentAccessScope[] = ['env:read', 'tools:call', 'artifacts:direct_write', 'files:propose', 'events.write', 'signals:write', 'memory:read', 'notifications:read'];
    const tools = listToolsForScopes(scopes);
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('filepad_connect');
    expect(names).toContain('filepad_bootstrap');
  });

  it('does not expose removed filepad_contract_status tool', () => {
    const scopes: AgentAccessScope[] = ['env:read', 'artifacts:write', 'tools:call'];
    const tools = listToolsForScopes(scopes);
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('filepad_contract_status');
    expect(names).toContain('filepad_get_contract_status');
  });

  it('returns connect and health for empty scopes', () => {
    const tools = listToolsForScopes([]);
    expect(tools.map((t) => t.name)).toEqual([
      'filepad_bootstrap',
      'filepad_health',
      'filepad_describe_tool',
    ]);
  });

  it('returns mailbox acknowledgement for notifications:read only', () => {
    const tools = listToolsForScopes(['notifications:read']);
    expect(tools.map((t) => t.name)).toEqual([
      'filepad_bootstrap',
      'filepad_health',
      'filepad_describe_tool',
      'filepad_ack_notification',
    ]);
  });

  it('finds a tool by name', () => {
    const tool = findTool('filepad_search');
    expect(tool).toBeTruthy();
    expect(tool?.name).toBe('filepad_search');
    expect(tool?.requiredScopes).toContain('env:read');
    expect(tool?.requiredScopes).toContain('tools:call');
  });

	  it('requires canonical RuntimeTool scopes for direct artifact creation aliases', () => {
	    const tool = findTool('filepad_create_artifact');
	    const fromFileTool = findTool('filepad_create_artifact_from_file');
	    expect(tool?.requiredScopes).toEqual([
	      'tools:call',
	      'artifacts:direct_write',
	    ]);
	    expect(fromFileTool?.requiredScopes).toEqual([
	      'tools:call',
	      'artifacts:direct_write',
	    ]);
	    expect(
	      listToolsForScopes(['artifacts:write']).map((t) => t.name),
	    ).not.toContain('filepad_create_artifact');
	  });

	  it('exposes artifact editor kind choices for agent-created artifacts', () => {
    const tool = findTool('filepad_create_artifact');
    expect(tool).toBeTruthy();
    expect(tool?.inputSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          kind: expect.objectContaining({
            enum: ['auto', 'note', 'richText', 'richDoc', 'sheet', 'diagram'],
          }),
          format: expect.objectContaining({
            enum: ['markdown', 'csv', 'plain_text', 'prosemirror_json'],
          }),
        }),
      }),
    );
  });

  it('returns undefined for unknown tool', () => {
    const tool = findTool('unknown_tool');
    expect(tool).toBeUndefined();
  });

  // ── Active Contract MCP Tools ──

  it('exposes agent-safe active contract MCP tools', () => {
    const scopes: AgentAccessScope[] = ['env:read', 'artifacts:write', 'tools:call'];
    const tools = listToolsForScopes(scopes);
    const names = tools.map((t) => t.name);
    expect(names).toContain('filepad_list_active_contracts');
    expect(names).toContain('filepad_read_active_contract');
    expect(names).toContain('filepad_create_contract');
    expect(names).toContain('filepad_update_contract');
    expect(names).toContain('filepad_record_contract_evidence');
    expect(names).toContain('filepad_get_contract_status');
    expect(names).not.toContain('filepad_compile_active_contract');
    expect(names).not.toContain('filepad_mark_contract_stale');
  });

  it('active contract read tools require env:read', () => {
    for (const name of ['filepad_list_active_contracts', 'filepad_read_active_contract']) {
      const tool = findTool(name);
      expect(tool).toBeTruthy();
      expect(tool?.requiredScopes).toContain('env:read');
    }
    expect(findTool('filepad_get_contract_status')?.requiredScopes).toContain('tools:call');
  });

  it('active contract write tools require tools:call + artifacts:write', () => {
    const create = findTool('filepad_create_contract');
    expect(create?.requiredScopes).toContain('tools:call');
    expect(create?.requiredScopes).toContain('artifacts:write');

    const update = findTool('filepad_update_contract');
    expect(update?.requiredScopes).toContain('tools:call');
    expect(update?.requiredScopes).toContain('artifacts:write');

    const evidence = findTool('filepad_record_contract_evidence');
    expect(evidence?.requiredScopes).toContain('tools:call');
    expect(evidence?.requiredScopes).toContain('artifacts:write');
  });

  it('active contract read tools visible with env:read', () => {
    const tools = listToolsForScopes(['env:read']);
    const names = tools.map((t) => t.name);
    expect(names).toContain('filepad_list_active_contracts');
    expect(names).toContain('filepad_read_active_contract');
    expect(names).not.toContain('filepad_contract_status');
  });

  it('active contract write tools hidden without artifacts:write', () => {
    const tools = listToolsForScopes(['env:read']);
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('filepad_create_contract');
    expect(names).not.toContain('filepad_update_contract');
    expect(names).not.toContain('filepad_record_contract_evidence');
    expect(names).not.toContain('filepad_mark_contract_stale');
  });

  it('returns constitution tool when env:read scope is granted', () => {
    const tools = listToolsForScopes(['env:read']);
    expect(tools.map((t) => t.name)).toContain('filepad_get_constitution');
  });

  it('constitution tool requires env:read scope', () => {
    const tool = findTool('filepad_get_constitution');
    expect(tool).toBeTruthy();
    expect(tool?.requiredScopes).toContain('env:read');
  });

  it('constitution tool is hidden when env:read scope is not granted', () => {
    const tools = listToolsForScopes(['signals:write']);
    expect(tools.map((t) => t.name)).not.toContain('filepad_get_constitution');
  });

  it('every tool has a name, description, and inputSchema', () => {
	    const scopes: AgentAccessScope[] = [
	      'env:read',
	      'tools:call',
	      'artifacts:direct_write',
	      'files:propose',
      'events.write',
      'signals:write',
      'notifications:read',
    ];
    const tools = listToolsForScopes(scopes);
    for (const tool of tools) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.inputSchema).toBe('object');
      if (
        tool.name === 'filepad_health' ||
        tool.name === 'filepad_bootstrap' ||
        tool.name === 'filepad_describe_tool'
      ) {
        expect(tool.requiredScopes).toEqual([]);
      } else {
        expect(tool.requiredScopes.length).toBeGreaterThan(0);
      }
    }
  });
});
