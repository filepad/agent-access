// FILE MEMO: Agent API resource helper used by SDK callers. Official MCP access uses the remote /mcp endpoint.

interface McpAdapterClient {
  getMailbox(options?: {
    limit?: number;
    unreadOnly?: boolean;
    cursor?: string;
  }): Promise<unknown>;
  getFile(fileNodeId: string): Promise<{
    content: { kind: string; text?: string | undefined };
  }>;
}

export class McpAdapter {
  constructor(private readonly client: McpAdapterClient) {}


  /**
   * Read the content of an MCP resource by its stable URI.
   * Supported URI shapes:
   * - filepad://workspace/{workspaceId}/mailbox
   * - filepad://workspace/{workspaceId}/files/{fileNodeId}
   */
  async getResource(uri: string): Promise<{ mimeType: string; text: string }> {
    if (/^filepad:\/\/workspace\/[^/]+\/mailbox$/.test(uri)) {
      const mailbox = await this.client.getMailbox({ limit: 50 });
      return {
        mimeType: 'application/json',
        text: JSON.stringify(mailbox, null, 2),
      };
    }

    const match = uri.match(/^filepad:\/\/workspace\/[^/]+\/files\/(.+)$/);
    if (!match || !match[1]) {
      throw new Error(`Unsupported resource URI: ${uri}`);
    }
    const fileNodeId = match[1];
    const file = await this.client.getFile(fileNodeId);
    if (file.content.kind !== 'inlineText') {
      throw new Error(`Resource ${uri} is not inlineText-readable`);
    }
    return {
      mimeType: 'text/markdown',
      text: file.content.text || '',
    };
  }
}
