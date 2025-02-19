
import { Database, Json } from '@/integrations/supabase/types';

export interface QANode {
  id: string;
  question: string;
  analysis: string;
  citations?: string[];
  children: QANode[];
  isExtendedRoot?: boolean;
  originalNodeId?: string;
  evaluation?: {
    score: number;
    reason: string;
  };
}

export interface StreamingContent {
  content: string;
  citations: string[];
}

export type SavedResearch = Database['public']['Tables']['web_research']['Row'] & {
  areas_for_research: string[];
  sources: string[];
};

export type SavedQATree = Database['public']['Tables']['qa_trees']['Row'] & {
  tree_data: QANode[];
};

export interface QADisplayProps {
  marketId: string;
  marketQuestion: string;
  marketDescription: string;
}
