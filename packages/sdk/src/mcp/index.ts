// MCP sub-entrypoint — remote MCP transport helpers only.
// The local stdio MCP server has been removed; use remote HTTP transport via agent-connect.
export { sendRemoteMcpMessage, sendMcpMessage, type RemoteMcpConfig, type JsonRpcMessage } from '../core/remote-mcp.js';
export { McpAdapter } from '../core/mcp.js';
