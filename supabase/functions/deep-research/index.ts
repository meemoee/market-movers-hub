
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { callOpenRouter } from './openRouter.ts';

interface RequestBody {
  description: string;
  marketId: string;
}

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

serve(async (req: Request) => {
  // Handle CORS preflight request
  const corsResponse = handleCorsOptions(req);
  if (corsResponse) {
    return corsResponse;
  }

  try {
    const requestData: RequestBody = await req.json();
    const { description, marketId } = requestData;

    if (!description) {
      throw new Error('Missing market description');
    }

    console.log(`Starting deep research for market: ${marketId}`);
    console.log(`Description: ${description}`);

    // Generate a set of search queries
    const queries = await generateSearchQueries(description);
    console.log("Generated queries:", queries);

    // Perform research steps
    const steps: ResearchStep[] = [];
    for (const query of queries) {
      console.log(`Executing research step with query: "${query}"`);
      
      // Simulate search results for demo purposes
      const results = `Research results for "${query}": Found several relevant articles discussing market trends, expert opinions, and historical data.`;
      
      steps.push({ query, results });
    }

    // Generate the final research report
    const report = await generateResearchReport(description, steps);
    console.log("Generated research report:", report);

    return new Response(
      JSON.stringify({
        success: true,
        steps,
        report
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error("Error in deep-research function:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

async function generateSearchQueries(description: string): Promise<string[]> {
  const prompt = `
Given the following market description, generate 5 search queries that would help gather relevant information to evaluate the market's outcome probability:

Description: ${description}

Generate 5 specific, focused search queries that would help research this market. Each query should target different aspects of the topic to ensure comprehensive research. Format the output as a JSON array of strings.
  `;

  try {
    const response = await callOpenRouter("google/gemini-2.0-flash-001", prompt);
    const parsedResponse = JSON.parse(response);
    
    if (Array.isArray(parsedResponse) && parsedResponse.length > 0) {
      return parsedResponse.slice(0, 5); // Ensure we get max 5 queries
    }
    
    // Fallback in case response format is unexpected
    return [
      `${description} latest news`,
      `${description} expert analysis`,
      `${description} historical data`,
      `${description} predictions`,
      `${description} timeline`
    ];
  } catch (error) {
    console.error("Error generating search queries:", error);
    // Provide fallback queries
    return [
      `${description} latest news`,
      `${description} expert analysis`,
      `${description} historical data`,
      `${description} predictions`,
      `${description} timeline`
    ];
  }
}

async function generateResearchReport(description: string, steps: ResearchStep[]): Promise<ResearchReport> {
  const researchData = steps.map(step => `Query: ${step.query}\nResults: ${step.results}`).join('\n\n');
  
  const prompt = `
As a market research expert, analyze the following information and create a comprehensive research report for this prediction market:

Market Description: ${description}

Research Data:
${researchData}

Create a detailed research report with the following sections:
1. A concise title for the report
2. An executive summary (2-3 sentences summarizing key findings)
3. Key findings (3-5 bullet points)
4. Brief analysis (2-3 paragraphs)
5. Conclusion with implications for market probability (1-2 paragraphs)

Format the response as a JSON object with the following structure:
{
  "title": "Report Title",
  "executiveSummary": "Executive summary text...",
  "keyFindings": ["Finding 1", "Finding 2", "Finding 3"],
  "analysis": "Analysis paragraphs...",
  "conclusion": "Conclusion paragraphs..."
}
  `;

  try {
    const response = await callOpenRouter("google/gemini-2.0-flash-001", prompt);
    const report = JSON.parse(response);
    return report;
  } catch (error) {
    console.error("Error generating research report:", error);
    // Return a fallback report
    return {
      title: `Research Report: ${description.substring(0, 50)}...`,
      executiveSummary: "This automatic research report encountered issues during generation. The results should be considered preliminary.",
      keyFindings: [
        "Insufficient data available for comprehensive analysis",
        "Consider conducting manual research for more accurate results",
        "Automated research system limitations detected"
      ],
      analysis: "The automated research system attempted to analyze this market but encountered technical limitations. The research queries were executed but the analysis engine could not process the results effectively.",
      conclusion: "Due to technical limitations in the research process, no definitive conclusion can be provided at this time. Consider this report as preliminary and seek additional information sources."
    };
  }
}
