import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { generateEmbedding } from '../../embeddings.js';
import { searchByEmbedding } from '../../db.js';

export function registerSemanticSearch(server: McpServer) {
  server.registerTool(
    'semantic_search',
    {
      description:
        'Search your brain for thoughts by meaning (not keywords). ' +
        'Returns the most semantically similar thoughts to your query.',
      inputSchema: {
        query: z.string().describe('What to search for — natural language, e.g. "career decisions last month"'),
        limit: z.number().int().min(1).max(50).optional().default(10)
          .describe('Max number of results (default 10, max 50)'),
      },
    },
    async ({ query, limit }) => {
      try {
        const embedding = await generateEmbedding(query);
        const results = await searchByEmbedding(embedding, limit ?? 10);

        if (!results.length) {
          return {
            content: [{ type: 'text', text: 'No matching thoughts found.' }],
          };
        }

        const lines = results.map((t, i) => {
          const m = t.metadata;
          const date = new Date(t.created_at).toLocaleDateString();
          const sim = t.similarity ? ` (${(t.similarity * 100).toFixed(0)}% match)` : '';
          return [
            `[${i + 1}]${sim} — ${date} — ${m.type}`,
            `  ${t.content}`,
            m.topics.length  ? `  topics:  ${m.topics.join(', ')}` : '',
            m.people.length  ? `  people:  ${m.people.join(', ')}` : '',
          ].filter(Boolean).join('\n');
        });

        return {
          content: [{ type: 'text', text: lines.join('\n\n') }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
