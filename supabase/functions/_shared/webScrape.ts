
import { corsHeaders } from "./cors.ts";

export type WebScrapeRequest = {
  queries: string[];
  marketId: string;
  focusText?: string;
};

/**
 * Initiates a background web scraping process for research
 * @param queries - List of search queries to process
 * @param marketId - The market ID associated with the research
 * @param focusText - Optional text to focus the research on
 * @returns The job ID for the background process
 */
export async function initiateWebScrape(queries: string[], marketId: string, focusText?: string): Promise<string> {
  console.log(`Initiating web scrape for market ${marketId} with ${queries.length} queries`);

  try {
    const webScrapeUrl = "https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/web-scrape";
    
    const response = await fetch(webScrapeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        ...corsHeaders
      },
      body: JSON.stringify({ queries, marketId, focusText })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Web scrape request failed: ${response.status} ${errorText}`);
      throw new Error(`Web scrape request failed: ${response.status} ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`Web scrape initiated with job ID: ${result.jobId}`);
    
    return result.jobId;
  } catch (error) {
    console.error(`Error initiating web scrape: ${error.message}`);
    throw new Error(`Failed to initiate web scrape: ${error.message}`);
  }
}
