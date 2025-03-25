
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Processes a streaming API response and saves chunks to the analysis_stream table
 */
export class AnalysisStreamProcessor {
  private jobId: string;
  private iteration: number;
  private supabaseClient: any;
  private sequence: number = 0;
  private buffer: string = "";
  private bufferSize: number = 250; // Characters to buffer before saving
  
  constructor(jobId: string, iteration: number, supabaseClient: any) {
    this.jobId = jobId;
    this.iteration = iteration;
    this.supabaseClient = supabaseClient;
  }
  
  /**
   * Process a chunk of data and save to the analysis_stream table when buffer is full
   */
  async processChunk(chunk: string): Promise<void> {
    this.buffer += chunk;
    
    // Save chunks in batches to reduce database load
    if (this.buffer.length >= this.bufferSize) {
      await this.saveBufferToStream();
    }
  }
  
  /**
   * Save the current buffer to the analysis_stream table
   */
  private async saveBufferToStream(): Promise<void> {
    if (!this.buffer) return;
    
    try {
      const currentSequence = this.sequence++;
      const currentChunk = this.buffer;
      this.buffer = ""; // Clear buffer after saving
      
      // Use the database function to append chunk
      const { data, error } = await this.supabaseClient.rpc(
        'append_analysis_chunk', 
        { 
          job_id: this.jobId,
          iteration: this.iteration,
          chunk: currentChunk,
          seq: currentSequence
        }
      );
      
      if (error) {
        console.error('Error saving chunk to stream:', error);
      }
    } catch (err) {
      console.error('Exception saving chunk to stream:', err);
    }
  }
  
  /**
   * Flush any remaining data in the buffer
   */
  async complete(): Promise<void> {
    if (this.buffer) {
      await this.saveBufferToStream();
    }
  }
  
  /**
   * Get the sequence number for the next chunk
   */
  getNextSequence(): number {
    return this.sequence;
  }
}

/**
 * Creates a Supabase client with the provided URL and key
 */
export function createSupabaseClient(supabaseUrl: string, supabaseKey: string) {
  return {
    rpc: async (functionName: string, params: any) => {
      try {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify(params)
        });
        
        if (!response.ok) {
          return { 
            data: null, 
            error: { 
              message: `Error calling ${functionName}: ${response.status}`,
              status: response.status
            } 
          };
        }
        
        const data = await response.json();
        return { data, error: null };
      } catch (error) {
        return { data: null, error: { message: error.message, original: error } };
      }
    }
  };
}
