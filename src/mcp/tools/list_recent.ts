import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listRecent } from '../../db.js';

export function registerListRecent(server: McpServer) {
  server.registerTool(
    'list_recent',
    {
      description:
        'Browse your most recent thoughts. ' +
        'Useful for reviewing what you captured this week.',
      inputSchema: {
        days: z.number().int().min(1).max(90).optional().default(7)
          .describe('How many days back to look (default 7)'),
        limit: z.number().int().min(1).max(100).optional().default(20)
          .describe('Max number of thoughts to return (default 20)'),
      },
    },
    async ({ days, limit }) => {
      const thoughts = await listRecent(days ?? 7, limit ?? 20);

      if (!thoughts.length) {
        return {
          content: [{ type: 'text', text: `No thoughts captured in the last ${days ?? 7} days.` }],
        };
      }

      const lines = thoughts.map((t, i) => {
        const m = t.metadata;
        const date = new Date(t.created_at).toLocaleString();
        return [
          `[${i + 1}] ${date} — ${m.type}`,
          `  ${t.content}`,
          m.topics.length ? `  topics:  ${m.topics.join(', ')}` : '',
          m.people.length ? `  people:  ${m.people.join(', ')}` : '',
          m.action_items.length ? `  actions: ${m.action_items.join(' · ')}` : '',
        ].filter(Boolean).join('\n');
      });

      return {
        content: [
          {
            type: 'text',
            text: `${thoughts.length} thoughts in the last ${days ?? 7} days:\n\n${lines.join('\n\n')}`,
          },
        ],
      };
    },
  );
}
