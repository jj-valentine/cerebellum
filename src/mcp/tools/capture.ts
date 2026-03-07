import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { captureThought, formatConfirmation } from '../../capture.js';

export function registerCapture(server: McpServer) {
  server.registerTool(
    'capture',
    {
      description:
        'Save a new thought to your brain from any AI tool. ' +
        'The thought will be embedded, classified, and stored immediately. ' +
        'Use this to capture insights, decisions, person notes, tasks, or ideas while working.',
      inputSchema: {
        content: z.string().min(3).describe('The thought to capture, in plain language'),
      },
    },
    async ({ content }) => {
      try {
        const result = await captureThought(content);
        return { content: [{ type: 'text', text: formatConfirmation(result) }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
