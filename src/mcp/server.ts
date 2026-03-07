import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerSemanticSearch } from './tools/semantic_search.js';
import { registerListRecent } from './tools/list_recent.js';
import { registerStats } from './tools/stats.js';
import { registerCapture } from './tools/capture.js';

const server = new McpServer(
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

registerSemanticSearch(server);
registerListRecent(server);
registerStats(server);
registerCapture(server);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error('[cerebellum] MCP server running on stdio');
