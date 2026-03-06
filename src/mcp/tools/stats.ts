import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getStats } from '../../db.js';

export function registerStats(server: McpServer) {
  server.registerTool(
    'stats',
    {
      description:
        'See patterns in your brain: total thoughts, breakdown by type, ' +
        'most-used topics, and most-mentioned people.',
    },
    async () => {
      const s = await getStats();

      const type_lines = Object.entries(s.by_type)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `  ${type.padEnd(14)} ${count}`)
        .join('\n');

      const topic_lines = s.top_topics.length
        ? s.top_topics.map(t => `  ${t.topic.padEnd(20)} ${t.count}`).join('\n')
        : '  (none yet)';

      const people_lines = s.top_people.length
        ? s.top_people.map(p => `  ${p.person.padEnd(20)} ${p.count}`).join('\n')
        : '  (none yet)';

      const text = [
        `Total thoughts: ${s.total}`,
        '',
        'By type:',
        type_lines || '  (none)',
        '',
        'Top topics:',
        topic_lines,
        '',
        'Top people:',
        people_lines,
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    },
  );
}
