// FILE MEMO: Public exports for @filepad/mcp-server.

export { FilepadMcpServer } from './server.js';
export { sendMcpMessage } from './transport.js';
export { listToolsForScopes, findTool } from './tool-registry.js';
export type { McpToolDefinition } from './tool-registry.js';
export type { McpHandlerContext } from './handlers.js';
export type { FilepadMcpServerConfig } from './server.js';
