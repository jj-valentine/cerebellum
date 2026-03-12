import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { registerSemanticSearch } from '../mcp/tools/semantic_search.js';
import { registerListRecent } from '../mcp/tools/list_recent.js';
import { registerStats } from '../mcp/tools/stats.js';
import { registerCapture } from '../mcp/tools/capture.js';

// Single module-level server instance — created once, reused across all requests
const httpMcpServer = new McpServer(
  {
    name: 'cerebellum',
    version: '0.1.0',
  },
  {
    instructions:
      'This is a personal second brain — a semantic memory system. ' +
      'Use semantic_search to find past thoughts by meaning. ' +
      'Use list_recent to browse recent captures. ' +
      'Use stats to see thinking patterns. ' +
      'Use capture to save new insights directly from this session.',
  },
);

registerSemanticSearch(httpMcpServer);
registerListRecent(httpMcpServer);
registerStats(httpMcpServer);
registerCapture(httpMcpServer);

export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'POST' });
    res.end('Method Not Allowed');
    return;
  }

  // New transport per request — stateless pattern
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on('close', () => {
    transport.close().catch(() => undefined);
  });

  await httpMcpServer.connect(transport);
  await transport.handleRequest(req, res, (req as IncomingMessage & { body?: unknown }).body);
}
