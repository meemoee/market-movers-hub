
// Research types
export interface ResearchSite {
  url: string;
  title?: string;
  content: string;
}

export interface ResearchIteration {
  id: string;
  iteration: number;
  query: string;
  sites?: ResearchSite[];
  sitesFound: number;
  analysis?: string;
}

export interface ResearchMarket {
  id: string;
  question?: string;
  description?: string;
  focus_text?: string;
  price?: number;
}

export interface ResearchInsights {
  areasForResearch: string[];
  supportingPoints: string[];
  negativePoints: string[];
  reasoning: string;
  probability?: string;
}
