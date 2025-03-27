
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { ResearchProcessor } from "./researchProcessor.ts";

export interface JobParams {
  query: string;
  marketId: string;
  userId?: string;
  focusText?: string;
  notificationEmail?: string;
  marketData?: any;
}

export class JobHandler {
  private supabase: SupabaseClient;
  
  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }
  
  /**
   * Creates a new research job and starts the background process
   */
  async createJob(params: JobParams): Promise<string> {
    const { 
      query, 
      marketId, 
      userId, 
      focusText, 
      notificationEmail,
      marketData 
    } = params;
    
    // Create the job record in the database
    const { data: job, error } = await this.supabase
      .from('research_jobs')
      .insert({
        query,
        market_id: marketId,
        user_id: userId,
        focus_text: focusText,
        status: 'queued',
        notification_email: notificationEmail,
        market_data: marketData || null,
        progress_log: ['Job created, waiting to start processing'],
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('Error creating job record:', error);
      throw new Error(`Failed to create job record: ${error.message}`);
    }
    
    const jobId = job.id;
    
    // Start the background processing
    this.startBackgroundProcess(jobId, query, marketId, focusText);
    
    return jobId;
  }
  
  /**
   * Starts the background research process for a job
   */
  private startBackgroundProcess(jobId: string, query: string, marketId: string, focusText?: string): void {
    // Use waitUntil to allow the function to continue processing after response is sent
    // This is critical for background processing in Edge Functions
    EdgeRuntime.waitUntil((async () => {
      try {
        console.log(`Starting background research for job ${jobId}`);
        
        // Update job status to processing
        await this.updateJobStatus(jobId, 'processing', {
          started_at: new Date().toISOString(),
          progress_log: ['Background processing started']
        });
        
        // Get the market question for better context
        let marketQuestion = query;
        try {
          const { data: market } = await this.supabase
            .from('markets')
            .select('question, description')
            .eq('id', marketId)
            .maybeSingle();
          
          if (market?.question) {
            marketQuestion = market.question;
            console.log(`Retrieved market question: "${marketQuestion}"`);
          }
        } catch (error) {
          console.warn(`Could not retrieve market question: ${error.message}`);
        }
        
        // Initialize the research processor
        const processor = new ResearchProcessor(this.supabase, jobId, marketId, marketQuestion);
        
        // Start the iterative research process
        await processor.processResearch(focusText);
        
        // Mark job as completed
        await this.updateJobStatus(jobId, 'completed', {
          completed_at: new Date().toISOString(),
          progress_log: ['Research completed successfully']
        });
        
        // Send notification if email is provided
        await this.sendCompletionNotification(jobId);
        
      } catch (error) {
        console.error(`Error in background job ${jobId}: ${error.message}`);
        
        // Mark job as failed
        await this.updateJobStatus(jobId, 'failed', {
          error_message: error.message,
          progress_log: [`Error occurred: ${error.message}`]
        });
      }
    })());
  }
  
  /**
   * Updates the job status and other fields
   */
  private async updateJobStatus(jobId: string, status: string, additionalFields: Record<string, any> = {}): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('research_jobs')
        .update({
          status,
          updated_at: new Date().toISOString(),
          ...additionalFields
        })
        .eq('id', jobId);
      
      if (error) {
        console.error(`Error updating job ${jobId} status to ${status}:`, error);
      }
    } catch (error) {
      console.error(`Failed to update job ${jobId} status:`, error);
    }
  }
  
  /**
   * Sends a notification email upon job completion
   */
  private async sendCompletionNotification(jobId: string): Promise<void> {
    try {
      const { data: job } = await this.supabase
        .from('research_jobs')
        .select('notification_email, notification_sent')
        .eq('id', jobId)
        .maybeSingle();
      
      if (job?.notification_email && !job.notification_sent) {
        // Invoke the send-research-notification function
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-research-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ jobId }),
        });
        
        // Mark notification as sent
        await this.supabase
          .from('research_jobs')
          .update({ notification_sent: true })
          .eq('id', jobId);
      }
    } catch (error) {
      console.error(`Error sending notification for job ${jobId}:`, error);
    }
  }
}
