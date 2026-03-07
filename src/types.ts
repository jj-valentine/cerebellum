export type ThoughtType =
  | 'observation'
  | 'task'
  | 'idea'
  | 'reference'
  | 'person_note';

export interface ThoughtMetadata {
  type:         ThoughtType;
  topics:       string[];
  people:       string[];
  action_items: string[];
}

export interface Thought {
  id:         string;
  content:    string;
  metadata:   ThoughtMetadata;
  created_at: string;
}

export interface ThoughtWithSimilarity extends Thought {
  similarity: number;
}
