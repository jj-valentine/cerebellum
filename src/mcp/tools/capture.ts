import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { enqueue, readQueue } from '../../gatekeeper/queue.js';
import { evaluate } from '../../gatekeeper/index.js';

export function registerCapture(server: McpServer) {
  server.registerTool(
    'capture',
    {
      description:
        'Save a new thought to your brain from any AI tool. ' +
        'The thought is queued and evaluated by the gatekeeper before being stored. ' +
        'Use this to capture insights, decisions, person notes, tasks, or ideas while working. ' +
        'Always provide a capture_reason explaining why this thought is worth storing.',
      inputSchema: {
        content: z.string().min(3).describe(
          'The thought to capture, in plain language',
        ),
        capture_reason: z.string().optional().describe(
          'Why this thought is being captured now — context, trigger, or decision rationale. ' +
          'Required for auto-captures; omit only for explicit user-initiated captures.',
        ),
      },
    },
    async ({ content, capture_reason }) => {
      try {
        const entry = enqueue(content, 'mcp', capture_reason);

        // Fire-and-forget: gate evaluation runs in background
        evaluate(entry).catch(err =>
          console.error('[gate] MCP background evaluation error:', err),
        );

        const total = readQueue().length; // entry already written; count all statuses
        return {
          content: [{
            type: 'text' as const,
            text: `✓ Queued (${total} in queue)\n  Run 'memo review' to evaluate and store.`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
