
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Access the OpenRouter API key from environment variables
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');

// Define CORS headers for the function
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  try {
    const { description, marketId } = await req.json();
    console.log('Starting research for:', { description, marketId });

    if (!description) {
      throw new Error('No description provided for research');
    }

    // Start the research process
    const researchSteps: ResearchStep[] = [];

    // Step 1: Generate initial research queries
    console.log('Generating initial research queries');
    const initialQueries = await generateResearchQueries(description);
    
    // Step 2: Perform research for each query
    let allResearchResults = '';
    for (const query of initialQueries) {
      console.log('Researching query:', query);
      const searchResults = await performSearch(query);
      researchSteps.push({ query, results: searchResults });
      allResearchResults += `\nQuery: ${query}\nResults: ${searchResults}\n`;
    }

    // Step 3: Generate follow-up queries based on initial findings
    console.log('Generating follow-up queries');
    const followUpQueries = await generateFollowUpQueries(description, allResearchResults);
    
    // Step 4: Perform research for follow-up queries
    for (const query of followUpQueries) {
      console.log('Researching follow-up query:', query);
      const searchResults = await performSearch(query);
      researchSteps.push({ query, results: searchResults });
      allResearchResults += `\nFollow-up Query: ${query}\nResults: ${searchResults}\n`;
    }

    // Step 5: Generate the final report
    console.log('Generating final research report');
    const finalReport = await generateFinalReport(description, allResearchResults);

    // Return the complete research results
    return new Response(JSON.stringify({ 
      success: true, 
      report: finalReport,
      steps: researchSteps
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in deep-research function:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Unknown error occurred'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to generate initial research queries
async function generateResearchQueries(description: string): Promise<string[]> {
  const prompt = `
  You are a skilled research assistant tasked with exploring the following topic:
  
  "${description}"
  
  Generate 3 specific and focused search queries that would help investigate different aspects of this topic. 
  These queries should be diverse, covering different dimensions of the subject.
  
  Format your response as an array of strings, nothing else. For example:
  ["query 1", "query 2", "query 3"]
  `;

  const response = await fetchFromOpenRouter(prompt);
  try {
    return JSON.parse(response);
  } catch (e) {
    console.error('Error parsing query response:', e);
    // If parsing fails, try to extract queries using regex
    const matches = response.match(/"([^"]+)"/g);
    if (matches && matches.length > 0) {
      return matches.map(m => m.replace(/"/g, ''));
    }
    // Fallback to a single query if everything fails
    return [description];
  }
}

// Helper function to generate follow-up queries
async function generateFollowUpQueries(description: string, initialResults: string): Promise<string[]> {
  const prompt = `
  You are a skilled research assistant continuing your investigation on:
  
  "${description}"
  
  Based on these initial findings:
  
  ${initialResults}
  
  Generate 2 focused follow-up search queries that would help investigate gaps or important aspects not covered in the initial research.
  These should dig deeper into areas that need more investigation.
  
  Format your response as an array of strings, nothing else. For example:
  ["query 1", "query 2"]
  `;

  const response = await fetchFromOpenRouter(prompt);
  try {
    return JSON.parse(response);
  } catch (e) {
    console.error('Error parsing follow-up query response:', e);
    // If parsing fails, try to extract queries using regex
    const matches = response.match(/"([^"]+)"/g);
    if (matches && matches.length > 0) {
      return matches.map(m => m.replace(/"/g, ''));
    }
    // Fallback to a single query if everything fails
    return [`additional information about ${description}`];
  }
}

// Helper function to perform a search using AI
async function performSearch(query: string): Promise<string> {
  const prompt = `
  You are a sophisticated research tool. Your task is to provide factual, accurate 
  information about the following query:
  
  "${query}"
  
  Please respond with comprehensive information addressing this query. Include specific
  facts, relevant data, and important context. Focus on providing objective information
  that would be most useful for someone researching this topic.
  
  Limit your response to approximately 250 words.
  `;

  return await fetchFromOpenRouter(prompt);
}

// Helper function to generate the final report
async function generateFinalReport(description: string, allResults: string): Promise<ResearchReport> {
  const prompt = `
  You are an expert research analyst creating a comprehensive research report on:
  
  "${description}"
  
  Based on all the following research findings:
  
  ${allResults}
  
  Format your response as a JSON object with the following structure:
  {
    "title": "A clear, descriptive title for the research",
    "executiveSummary": "A concise summary of the key findings (100-150 words)",
    "keyFindings": ["Finding 1", "Finding 2", "Finding 3", etc.],
    "analysis": "A detailed analysis synthesizing all research (200-300 words)",
    "conclusion": "A conclusion addressing the original research question (100 words)"
  }
  
  Ensure your analysis is data-driven, objective, and well-structured. Include only factual information supported by the research.
  `;

  const response = await fetchFromOpenRouter(prompt);
  try {
    return JSON.parse(response);
  } catch (e) {
    console.error('Error parsing final report response:', e);
    // Provide a fallback report structure
    return {
      title: `Research: ${description}`,
      executiveSummary: "Error formatting research results. Please see analysis section for research findings.",
      keyFindings: ["Error extracting structured findings from research results"],
      analysis: response, // Use the raw response as the analysis
      conclusion: "Unable to generate proper conclusion due to formatting error."
    };
  }
}

// Helper function to make requests to OpenRouter API
async function fetchFromOpenRouter(prompt: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key is not configured');
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://yourapp.com', // Replace with your actual domain
        'X-Title': 'Deep Research Tool'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku', // Using Claude for research tasks
        messages: [
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        temperature: 0.3, // Lower temperature for more focused responses
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenRouter API error:', errorData);
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error fetching from OpenRouter:', error);
    throw error;
  }
}
