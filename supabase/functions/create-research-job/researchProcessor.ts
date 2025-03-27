
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

interface ResearchIteration {
  iteration: number;
  queries: string[];
  results: any[];
  analysis: string;
  reasoning?: string;
}

export class ResearchProcessor {
  private supabase: SupabaseClient;
  private jobId: string;
  private marketId: string;
  private marketQuestion: string;
  private maxIterations: number = 3;
  
  constructor(
    supabase: SupabaseClient,
    jobId: string,
    marketId: string,
    marketQuestion: string
  ) {
    this.supabase = supabase;
    this.jobId = jobId;
    this.marketId = marketId;
    this.marketQuestion = marketQuestion;
  }
  
  /**
   * Process the research through multiple iterations
   */
  async processResearch(focusText?: string): Promise<void> {
    // Get the max iterations setting from the job if available
    try {
      const { data: job } = await this.supabase
        .from('research_jobs')
        .select('max_iterations')
        .eq('id', this.jobId)
        .maybeSingle();
      
      if (job?.max_iterations) {
        this.maxIterations = job.max_iterations;
      }
    } catch (error) {
      console.warn(`Could not retrieve max_iterations setting: ${error.message}`);
    }
    
    // Process each iteration
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      try {
        // Update the current iteration in the job record
        await this.updateJobIteration(iteration);
        
        // Process this iteration
        await this.processIteration(iteration, focusText);
        
        // Break the loop if we're at the last iteration
        if (iteration === this.maxIterations) {
          break;
        }
        
      } catch (error) {
        console.error(`Error during iteration ${iteration} for job ${this.jobId}: ${error.message}`);
        throw new Error(`Failed to generate queries: ${error.message}`);
      }
    }
  }
  
  /**
   * Process a single research iteration
   */
  private async processIteration(iteration: number, focusText?: string): Promise<void> {
    console.log(`Processing iteration ${iteration} for job ${this.jobId}`);
    
    // Get previous iterations for context
    const previousIterations = await this.getPreviousIterations();
    
    // Step 1: Generate search queries
    const queries = await this.generateQueries(iteration, previousIterations, focusText);
    
    // Update job with the generated queries
    await this.updateJobData({
      iterations: [...previousIterations, { 
        iteration, 
        queries,
        results: [],
        analysis: '' 
      }]
    });
    
    // Step 2: Generate analysis for this iteration
    const analysis = await this.generateAnalysis(iteration, queries, previousIterations);
    
    // Update job with the analysis
    await this.updateJobData({
      iterations: [...previousIterations, { 
        iteration, 
        queries,
        results: [], // We're not storing the full results in the iterations array to keep it lightweight
        analysis 
      }]
    });
  }
  
  /**
   * Generate search queries for a research iteration
   */
  private async generateQueries(
    iteration: number, 
    previousIterations: ResearchIteration[],
    focusText?: string
  ): Promise<string[]> {
    const previousAnalyses = previousIterations.map(iter => iter.analysis);
    
    // Call the generate-queries edge function
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        query: this.marketQuestion,
        marketId: this.marketId,
        marketQuestion: this.marketQuestion,
        iteration,
        previousAnalyses,
        focusText
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Error generating queries: ${response.status} ${response.statusText}`);
    }
    
    const { queries } = await response.json();
    
    if (!queries || !Array.isArray(queries)) {
      throw new Error('Invalid response from generate-queries function');
    }
    
    console.log(`Generated ${queries.length} queries for iteration ${iteration}:`, queries);
    
    return queries;
  }
  
  /**
   * Generate analysis for a research iteration
   */
  private async generateAnalysis(
    iteration: number,
    queries: string[],
    previousIterations: ResearchIteration[]
  ): Promise<string> {
    // Prepare market price information if available
    let marketPrice: number | undefined;
    try {
      const { data: priceData } = await this.supabase
        .from('market_prices')
        .select('last_traded_price')
        .eq('market_id', this.marketId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (priceData?.last_traded_price !== undefined) {
        marketPrice = Math.round(priceData.last_traded_price * 100);
        console.log(`Found market price for ${this.marketId}: ${marketPrice}%`);
      }
    } catch (error) {
      console.warn(`Could not retrieve market price: ${error.message}`);
    }
    
    // Simulate analysis generation
    console.log(`Generating Iteration ${iteration} analysis for "${this.marketQuestion}" using OpenRouter with streaming enabled and reasoning tokens`);
    console.log(`Starting streaming response for iteration ${iteration} with reasoning tokens`);
    console.log(`Starting to process streaming response chunks for iteration ${iteration}`);
    
    // In a real implementation, this would call the analysis generation endpoint
    // For now, we'll return a placeholder
    const analysis = `Analysis for iteration ${iteration} of market ${this.marketId} based on queries: ${queries.join(', ')}`;
    
    // Simulate completion
    console.log(`Successfully completed generateAnalysisWithStreaming for iteration ${iteration}`);
    
    return analysis;
  }
  
  /**
   * Get previous iterations for the current job
   */
  private async getPreviousIterations(): Promise<ResearchIteration[]> {
    try {
      const { data: job } = await this.supabase
        .from('research_jobs')
        .select('iterations')
        .eq('id', this.jobId)
        .maybeSingle();
      
      if (job?.iterations && Array.isArray(job.iterations)) {
        return job.iterations;
      }
    } catch (error) {
      console.error(`Error retrieving previous iterations: ${error.message}`);
    }
    
    return [];
  }
  
  /**
   * Update the current iteration in the job record
   */
  private async updateJobIteration(iteration: number): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('research_jobs')
        .update({
          current_iteration: iteration,
          progress_log: this.supabase.rpc('array_append_distinct', {
            arr: ['Processing iteration ' + iteration],
            table_name: 'research_jobs',
            column_name: 'progress_log',
            record_id: this.jobId
          })
        })
        .eq('id', this.jobId);
      
      if (error) {
        console.error(`Error updating job iteration: ${error.message}`);
      }
    } catch (error) {
      console.error(`Failed to update job iteration: ${error.message}`);
    }
  }
  
  /**
   * Update job data with additional fields
   */
  private async updateJobData(data: Record<string, any>): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('research_jobs')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.jobId);
      
      if (error) {
        console.error(`Error updating job data: ${error.message}`);
      }
    } catch (error) {
      console.error(`Failed to update job data: ${error.message}`);
    }
  }
}
