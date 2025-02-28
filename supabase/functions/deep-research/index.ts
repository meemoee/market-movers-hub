
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

// Define the structure for research report
interface ResearchReport {
  title: string;
  executiveSummary: string;
  keyFindings: string[];
  analysis: string;
  conclusion: string;
}

// Interface for research steps
interface ResearchStep {
  query: string;
  results: string;
}

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Create a readable stream for the response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Parse the request body
        const { description, marketId } = await req.json();
        
        if (!OPENROUTER_API_KEY) {
          throw new Error('OPENROUTER_API_KEY environment variable not set');
        }
        
        // Use the correct model that works with OpenRouter
        const model = "google/gemini-2.0-flash-001";
        const steps: ResearchStep[] = [];
        
        // Helper function to send progress updates to the client
        const sendUpdate = (type: string, data: any) => {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };
        
        console.log("Starting research process for:", description);
        
        // First generate the research queries based on description
        console.log("Generating research queries");
        sendUpdate("progress", { 
          message: "Generating research queries...",
          currentStep: 0,
          totalSteps: 5
        });
        
        const queriesPrompt = `
You are a market research expert generating targeted research queries for the topic below. 
Generate 5 specific, diverse search queries that would help thoroughly research this topic.
Make sure the queries are specific and information-seeking, not just restatements of the topic.

TOPIC: ${description}

Output the queries in plain text format, one per line.
`;

        const queriesResponse = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://hunchex.com",
            "X-Title": "HunchEx Research Assistant"
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: "user", content: queriesPrompt }
            ]
          })
        });

        if (!queriesResponse.ok) {
          const errorText = await queriesResponse.text();
          console.error('Error response from OpenRouter queries:', errorText);
          throw new Error(`Failed to generate research queries: ${queriesResponse.status} ${queriesResponse.statusText}`);
        }

        const queriesData = await queriesResponse.json();
        const queriesContent = queriesData.choices[0]?.message?.content;
        if (!queriesContent) {
          throw new Error('No content returned for research queries');
        }

        // Extract queries (one per line)
        const researchQueries = queriesContent.split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0)
          .map((line: string) => line.replace(/^\d+\.\s*/, ''))  // Remove numbering if present
          .slice(0, 5);  // Take at most 5 queries
        
        console.log(`Generated ${researchQueries.length} research queries`);
        
        // Track all research results
        let allResearchResults = '';
        
        // For each query, perform research
        for (let i = 0; i < researchQueries.length; i++) {
          const query = researchQueries[i];
          console.log(`Executing research query ${i + 1}/${researchQueries.length}: ${query}`);
          
          // Update client with current query
          sendUpdate("progress", { 
            message: `Researching: ${query}`,
            currentStep: i + 1,
            totalSteps: researchQueries.length
          });
          
          // Generate research results for this query
          const researchPrompt = `
You are a research assistant responding to the following query related to this market topic:
MARKET TOPIC: ${description}
SEARCH QUERY: ${query}

Provide relevant, factual information about this topic based on general knowledge. 
Focus on information that would be useful for market analysis and prediction.
Be thorough but concise.
`;

          const researchResponse = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://hunchex.com",
              "X-Title": "HunchEx Research Assistant"
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: "user", content: researchPrompt }
              ]
            })
          });

          if (!researchResponse.ok) {
            const errorText = await researchResponse.text();
            console.error('Error response from OpenRouter research:', errorText);
            throw new Error(`Failed to execute research query: ${researchResponse.status} ${researchResponse.statusText}`);
          }

          const researchData = await researchResponse.json();
          const researchResults = researchData.choices[0]?.message?.content;
          if (!researchResults) {
            throw new Error('No research results returned');
          }
          
          // Append to all research results
          allResearchResults += `\n\nQUERY: ${query}\nRESULTS: ${researchResults}`;
          
          // Add to steps array and send update
          const step: ResearchStep = { query, results: researchResults };
          steps.push(step);
          sendUpdate("step", { 
            data: step,
            total: researchQueries.length
          });
        }
        
        // Now, generate a comprehensive research report based on all findings
        console.log("Generating final research report");
        sendUpdate("progress", { 
          message: "Generating final report...",
          currentStep: researchQueries.length,
          totalSteps: researchQueries.length
        });
        
        const reportPrompt = `
You are a market analysis expert preparing a formal research report based on the following research findings.
The research relates to this market topic: "${description}"

Here are the research findings from multiple queries:
${allResearchResults}

Create a comprehensive and structured research report with the following sections:
1. A title for the research report
2. Executive Summary
3. Key Findings (as bullet points)
4. Analysis
5. Conclusion

Focus on insights relevant to making predictions about this market.
Format your output as a structured JSON object with the following schema:
{
  "title": "title of the report",
  "executiveSummary": "concise summary of the report",
  "keyFindings": ["finding 1", "finding 2", "finding 3", ...],
  "analysis": "detailed analysis text",
  "conclusion": "conclusion text"
}
`;

        const reportResponse = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://hunchex.com",
            "X-Title": "HunchEx Research Assistant"
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: "user", content: reportPrompt }
            ],
            response_format: { type: "json_object" }
          })
        });

        if (!reportResponse.ok) {
          const errorText = await reportResponse.text();
          console.error('Error response from OpenRouter report:', errorText);
          throw new Error(`Failed to generate research report: ${reportResponse.status} ${reportResponse.statusText}`);
        }

        const reportData = await reportResponse.json();
        const reportContent = reportData.choices[0]?.message?.content;
        
        if (!reportContent) {
          throw new Error('No content returned for research report');
        }
        
        try {
          // Parse the JSON string into an object
          const report = JSON.parse(reportContent) as ResearchReport;
          
          // Send the final report to the client
          sendUpdate("report", { data: report });
          
          // End the stream
          controller.close();
        } catch (error) {
          console.error('Error parsing report JSON:', error);
          throw new Error('Failed to parse research report JSON');
        }
        
      } catch (error) {
        console.error('Error in deep-research:', error);
        sendUpdate("error", { message: error.message || 'Unknown error occurred' });
        controller.close();
      }
    }
  });

  // Return the stream response with the appropriate headers
  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
})
