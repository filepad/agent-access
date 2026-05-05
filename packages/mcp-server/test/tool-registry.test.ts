// TEST CATEGORY: unit
import { describe, expect, it } from 'vitest';

import { listToolsForScopes, findTool } from '../src/tool-registry.js';
import type { AgentAccessScope } from '@filepad/agent-access-sdk';

describe('tool-registry', () => {
  it('returns all tools when all scopes granted', () => {
    const scopes: AgentAccessScope[] = [
      'env:read',
      'artifacts:write',
      'files:propose',
      'events.write',
      'signals:write',
      'memory:read',
      'notifications:read',
    ];
    const tools = listToolsForScopes(scopes);
    expect(tools.length).toBeGreaterThanOrEqual(5);
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

  it('returns only env:read tools when only that scope granted', () => {
    const tools = listToolsForScopes(['env:read']);
    expect(tools.map((t) => t.name)).toContain('filepad_health');
    expect(tools.map((t) => t.name)).toContain('filepad_search');
    expect(tools.map((t) => t.name)).toContain('filepad_read_file');
    expect(tools.map((t) => t.name)).toContain('filepad_list_tree');
    expect(tools.map((t) => t.name)).toContain('filepad_list_signals');
    expect(tools.map((t) => t.name)).toContain('filepad_get_signal');
    expect(tools.map((t) => t.name)).toContain('filepad_get_profile');
    expect(tools.map((t) => t.name)).not.toContain('filepad_create_artifact');
    expect(tools.map((t) => t.name)).not.toContain('filepad_propose_edit');
    expect(tools.map((t) => t.name)).not.toContain('filepad_update_profile');
  });

  it('returns health only for empty scopes', () => {
    const tools = listToolsForScopes([]);
    expect(tools.map((t) => t.name)).toEqual(['filepad_health']);
  });

  it('returns mailbox acknowledgement for notifications:read only', () => {
    const tools = listToolsForScopes(['notifications:read']);
    expect(tools.map((t) => t.name)).toEqual([
      'filepad_health',
      'filepad_ack_notification',
    ]);
  });

  it('finds a tool by name', () => {
    const tool = findTool('filepad_search');
    expect(tool).toBeTruthy();
    expect(tool?.name).toBe('filepad_search');
    expect(tool?.requiredScopes).toContain('env:read');
  });

  it('returns undefined for unknown tool', () => {
    const tool = findTool('unknown_tool');
    expect(tool).toBeUndefined();
  });

  it('every tool has a name, description, and inputSchema', () => {
    const scopes: AgentAccessScope[] = [
      'env:read',
      'artifacts:write',
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
      if (tool.name === 'filepad_health') {
        expect(tool.requiredScopes).toEqual([]);
      } else {
        expect(tool.requiredScopes.length).toBeGreaterThan(0);
      }
    }
  });
});
