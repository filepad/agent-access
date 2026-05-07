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
    expect(tools.map((t) => t.name)).toContain('filepad_connect');
    expect(tools.map((t) => t.name)).toContain('filepad_bootstrap');
    expect(tools.map((t) => t.name)).toContain('filepad_health');
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
    expect(tools.map((t) => t.name)).toContain('filepad_connect');
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

  it('returns connect and health for empty scopes', () => {
    const tools = listToolsForScopes([]);
    expect(tools.map((t) => t.name)).toEqual([
      'filepad_connect',
      'filepad_bootstrap',
      'filepad_health',
    ]);
  });

  it('returns mailbox acknowledgement for notifications:read only', () => {
    const tools = listToolsForScopes(['notifications:read']);
    expect(tools.map((t) => t.name)).toEqual([
      'filepad_connect',
      'filepad_bootstrap',
      'filepad_health',
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
        tool.name === 'filepad_connect' ||
        tool.name === 'filepad_bootstrap'
      ) {
        expect(tool.requiredScopes).toEqual([]);
      } else {
        expect(tool.requiredScopes.length).toBeGreaterThan(0);
      }
    }
  });
});
