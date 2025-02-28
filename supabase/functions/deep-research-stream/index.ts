
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { OpenRouter } from "../deep-research/openRouter.ts";

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive'
};

interface ResearchStep {
  query: string;
  results: string;
}

interface ResearchReport {
  title: string;
  executiveSummary: string;
  keyFindings: string[];
  analysis: string;
  conclusion: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Create a TransformStream for the SSE response
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  
  // Start processing in the background
  const processPromise = (async () => {
    try {
      // Parse the request body
      const { description, marketId } = await req.json();
      
      if (!description) {
        await sendEvent(writer, { type: 'error', message: 'Description is required' });
        return;
      }
      
      console.log(`Starting deep research for market: ${marketId}`);
      
      // Create an OpenRouter instance
      const apiKey = Deno.env.get("OPENROUTER_API_KEY");
      if (!apiKey) {
        await sendEvent(writer, { type: 'error', message: 'OpenRouter API key is not configured' });
        return;
      }
      
      const openRouter = new OpenRouter(apiKey);
      
      // Step 1: Initial query setup
      const initialStep: ResearchStep = {
        query: `Initial research for: ${description.substring(0, 30)}...`,
        results: "Starting research..."
      };
      
      await sendEvent(writer, { type: 'step', step: initialStep });
      
      // Prepare a set of steps for the research process
      const steps: ResearchStep[] = [];
      
      // Step 2: Generate initial search query
      const initialQuery = `Generate a search query to research the following market: ${description}`;
      const searchQuery = await openRouter.complete("openai/gpt-3.5-turbo", [
        { role: "system", content: "You are a research assistant. Generate a concise search query (5-8 words) to research a market." },
        { role: "user", content: initialQuery }
      ]);
      
      const firstStep: ResearchStep = {
        query: searchQuery.trim(),
        results: "Initial query formulated. Starting research..."
      };
      
      steps.push(firstStep);
      await sendEvent(writer, { type: 'step', step: firstStep });
      
      // Step 3: Simulate search results for the first query
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
      
      const firstStepResults: ResearchStep = {
        query: searchQuery.trim(),
        results: "Research completed. Found 0 key findings."
      };
      
      steps.push(firstStepResults);
      await sendEvent(writer, { type: 'step', step: firstStepResults });
      
      // Step 4: Generate a follow-up query
      const followUpQuery = await openRouter.complete("openai/gpt-3.5-turbo", [
        { role: "system", content: "You are a research assistant. Based on the first search query, generate a follow-up query to deepen the research." },
        { role: "user", content: `Based on the first search query: "${searchQuery}", generate a follow-up query to research this market more deeply: ${description}` }
      ]);
      
      const secondStep: ResearchStep = {
        query: followUpQuery.trim(),
        results: "Generated follow-up query based on findings."
      };
      
      steps.push(secondStep);
      await sendEvent(writer, { type: 'step', step: secondStep });
      
      // Step 5: Simulate search results for the second query
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
      
      const secondStepResults: ResearchStep = {
        query: followUpQuery.trim(),
        results: "Research completed. Found 5 key findings."
      };
      
      steps.push(secondStepResults);
      await sendEvent(writer, { type: 'step', step: secondStepResults });
      
      // Step 6: Generate a third query focused on limitations and costs
      const thirdQuery = await openRouter.complete("openai/gpt-3.5-turbo", [
        { role: "system", content: "You are a research assistant. Generate a search query focusing on limitations and costs." },
        { role: "user", content: `Based on previous research, generate a query focusing on limitations and costs for: ${description}` }
      ]);
      
      const thirdStep: ResearchStep = {
        query: thirdQuery.trim(),
        results: "Generated follow-up query based on findings."
      };
      
      steps.push(thirdStep);
      await sendEvent(writer, { type: 'step', step: thirdStep });
      
      // Step 7: Simulate search results for the third query
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate network delay
      
      const thirdStepResults: ResearchStep = {
        query: thirdQuery.trim(),
        results: "Research completed. Found 3 key findings."
      };
      
      steps.push(thirdStepResults);
      await sendEvent(writer, { type: 'step', step: thirdStepResults });
      
      // Step 8: Final synthesis
      const finalStep: ResearchStep = {
        query: "Final synthesis",
        results: "Generating comprehensive research report."
      };
      
      steps.push(finalStep);
      await sendEvent(writer, { type: 'step', step: finalStep });
      
      // Step 9: Generate final report
      const reportPrompt = `
        Create a comprehensive market research report for the following market:
        ${description}
        
        Include:
        1. A title
        2. An executive summary
        3. 5-7 key findings
        4. A brief analysis section
        5. A conclusion
        
        Format the response as a JSON object with the following structure:
        {
          "title": "string",
          "executiveSummary": "string",
          "keyFindings": ["string", "string", ...],
          "analysis": "string",
          "conclusion": "string"
        }
      `;
      
      const reportResponse = await openRouter.complete("openai/gpt-4", [
        { role: "system", content: "You are a professional market researcher with expertise in creating insightful, structured reports. Output ONLY valid JSON." },
        { role: "user", content: reportPrompt }
      ]);
      
      // Parse the JSON response
      try {
        const reportJson = reportResponse.replace(/```json|```/g, '').trim();
        const report = JSON.parse(reportJson) as ResearchReport;
        
        // Send the final report
        await sendEvent(writer, { type: 'report', report });
      } catch (error) {
        console.error("Error parsing report JSON:", error);
        await sendEvent(writer, { 
          type: 'error', 
          message: 'Failed to generate research report. Please try again.' 
        });
      }
    } catch (error) {
      console.error("Error in deep-research-stream:", error);
      
      try {
        await sendEvent(writer, { 
          type: 'error', 
          message: error instanceof Error ? error.message : 'An unknown error occurred' 
        });
      } catch (writeError) {
        console.error("Error sending error event:", writeError);
      }
    } finally {
      try {
        await writer.close();
      } catch (closeError) {
        console.error("Error closing writer:", closeError);
      }
    }
  })();
  
  // Return the response with the stream
  return new Response(stream.readable, {
    headers: corsHeaders
  });
});

// Helper function to send SSE events
async function sendEvent(writer: WritableStreamDefaultWriter, data: any) {
  const encoder = new TextEncoder();
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  await writer.write(encoder.encode(payload));
}
