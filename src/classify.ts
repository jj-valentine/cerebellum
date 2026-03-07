import { cfg } from './config.js';
import type { ThoughtMetadata } from './types.js';

const SYSTEM_PROMPT = `You extract structured metadata from a personal thought/note.

Return ONLY valid JSON matching this shape:
{
  "type": "observation" | "task" | "idea" | "reference" | "person_note",
  "topics": string[],      // 1-3 short lowercase tags
  "people": string[],      // full names mentioned (empty array if none)
  "action_items": string[] // specific next actions implied (empty array if none)
}

Type guide:
- observation: something noticed or experienced
- task: something to do
- idea: creative or strategic thought
- reference: a fact, link, or source to remember
- person_note: primarily about a specific person`;

export async function classifyThought(content: string): Promise<ThoughtMetadata> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.openrouter.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.openrouter.classifierModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Classification request failed (${response.status}): ${body}`);
  }

  const json = await response.json() as {
    choices: Array<{ message: { content: string | null } }>
  };

  if (!json.choices?.length || json.choices[0].message.content === null) {
    console.warn('[classify] API returned no choices or null content — using default metadata');
    return { type: 'observation', topics: [], people: [], action_items: [] };
  }

  const VALID_TYPES: ThoughtMetadata['type'][] = ['observation', 'task', 'idea', 'reference', 'person_note'];

  try {
    const parsed = JSON.parse(json.choices[0].message.content) as ThoughtMetadata;
    const rawType = (parsed.type ?? 'observation').toLowerCase() as ThoughtMetadata['type'];
    return {
      type:         VALID_TYPES.includes(rawType) ? rawType : 'observation',
      topics:       parsed.topics        ?? [],
      people:       parsed.people        ?? [],
      action_items: parsed.action_items  ?? [],
    };
  } catch {
    console.warn('[classify] JSON parse failed — using default metadata');
    return { type: 'observation', topics: [], people: [], action_items: [] };
  }
}
