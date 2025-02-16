
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

export interface QADisplayProps {
  marketId: string;
  marketQuestion: string;
  marketDescription: string;
}
