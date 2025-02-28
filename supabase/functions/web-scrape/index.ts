
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const DEFAULT_MODEL = "google/gemini-2.0-flash-001";

async function formInitialQuery(intent: string, model: string): Promise<string> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.app'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { 
            role: 'system', 
            content: `You are an expert search query formulator. Create the most effective initial search query that will:
1. Target the most essential information about the topic
2. Be specific enough to find relevant results
3. Use 5-10 words maximum with precise terminology

Return ONLY the query text with no explanations or formatting.`
          },
          { 
            role: 'user', 
            content: `Create the best initial search query for: "${intent}"` 
          }
        ],
        max_tokens: 60,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const initialQuery = data.choices[0].message.content.trim()
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/\.$/, ''); // Remove trailing period
    
    return initialQuery;
  } catch (error) {
    console.error(`Failed to formulate initial query: ${error.message}`);
    return intent; // Fall back to original intent
  }
}

async function generateNextQuery(
  intent: string, 
  previousQueries: string[], 
  keyFindings: string[], 
  model: string
): Promise<string> {
  const recentFindings = keyFindings
    .slice(-3)
    .map((f, i) => `${i+1}. ${f}`)
    .join('\n');
    
  const previousQueriesText = previousQueries
    .slice(-3)
    .map((q, i) => `${i+1}. "${q}"`)
    .join('\n');
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.app'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { 
            role: 'system', 
            content: `You generate strategic follow-up search queries for research. 
RESPOND WITH ONLY THE QUERY TEXT - NO EXPLANATIONS OR QUOTES.` 
          },
          { 
            role: 'user', 
            content: `RESEARCH QUESTION: "${intent}"

PREVIOUS QUERIES:
${previousQueriesText}

RECENT FINDINGS:
${recentFindings}

Based on what we've learned, create the MOST EFFECTIVE follow-up search query that will:

1. Focus on the most important remaining unknown aspect
2. Be different enough from previous queries
3. Use precise language that would appear in relevant sources
4. Contain 5-10 words maximum
5. Help directly answer the original research question

Return only the query text with no explanations.` 
          }
        ],
        max_tokens: 60,
        temperature: 0.4
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const nextQuery = data.choices[0].message.content.trim()
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/\.$/, ''); // Remove trailing period
    
    return nextQuery;
  } catch (error) {
    console.error(`Query generation failed: ${error.message}`);
    // Simple fallback strategy
    return `${intent.split(' ').slice(0, 3).join(' ')} additional information`;
  }
}

interface ResearchResult {
  url: string;
  content: string;
  title?: string;
}

interface ResearchState {
  intent: string;
  model: string;
  iteration: number;
  totalIterations: number;
  findings: any[];
  previousQueries: string[];
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

function extractSourcesFromContent(content: string): { url: string, title?: string }[] {
  const sources: { url: string, title?: string }[] = [];
  const sourceRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let sourceMatch;
  
  while ((sourceMatch = sourceRegex.exec(content)) !== null) {
    const [_, label, url] = sourceMatch;
    
    if (url && isValidUrl(url)) {
      sources.push({
        url,
        title: label || undefined
      });
    }
  }
  
  return sources;
}

async function performResearch(
  query: string, 
  researchState: ResearchState
): Promise<{ content: string, results: ResearchResult[] }> {
  console.log(`Searching: "${query}" (Iteration ${researchState.iteration}/${researchState.totalIterations})`);
  
  // Create a brief research context from previous findings
  let researchContext = '';
  if (researchState.findings.length > 0) {
    const previousFindings = researchState.findings
      .slice(-1)[0]
      .keyFindings
      .slice(0, 3)
      .map((f: string, i: number) => `${i+1}. ${f}`)
      .join('\n');
      
    if (previousFindings) {
      researchContext = `\nPREVIOUS FINDINGS:\n${previousFindings}`;
    }
  }
  
  // System prompt
  const systemPrompt = `You are a precise research assistant investigating: "${researchState.intent}"

Current iteration: ${researchState.iteration} of ${researchState.totalIterations}
Current query: "${query}"
${researchContext}

Your task is to:
1. Search for and analyze information relevant to the query
2. Identify NEW facts and information about the topic
3. Focus on directly answering the original research question
4. Provide specific, detailed, factual information
5. CITE SOURCES using markdown links [title](url) whenever possible

RESPOND IN THIS FORMAT:
1. First, provide a DETAILED ANALYSIS of the search results (1-2 paragraphs)
2. Then, list KEY FINDINGS as numbered points (precise, specific facts)
3. ${researchState.iteration < researchState.totalIterations ? 'Finally, state the most important unanswered question based on these findings' : 'Finally, provide a comprehensive SUMMARY of all findings related to the original question'}

IMPORTANT:
- Focus on NEW information in each iteration
- Be objective and factual
- Cite sources wherever possible 
- Make each key finding specific and self-contained`;

  try {
    // Make API request
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.app'
      },
      body: JSON.stringify({
        model: `${researchState.model}:online`, // Web search enabled
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Search for information on: "${query}"` }
        ],
        max_tokens: 1200,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Extract sources from the content
    const sources = extractSourcesFromContent(content);
    
    // Create result objects with content from sources
    const results: ResearchResult[] = sources.map(source => ({
      url: source.url,
      title: source.title,
      content: `Information from ${source.title || 'web search'}: ${content.substring(0, 100)}...` // Simplified for demo
    }));
    
    return {
      content,
      results
    };
  } catch (error) {
    console.error(`Research failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY not provided");
    }

    const { queries } = await req.json();
    if (!queries || !Array.isArray(queries)) {
      throw new Error("Invalid request: queries array is required");
    }

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Initial setup
          const model = DEFAULT_MODEL;
          const intent = queries[0]; // Use first query as main intent
          const totalIterations = Math.min(queries.length, 3); // Limit to 3 iterations
          
          const researchState: ResearchState = {
            intent,
            model,
            iteration: 1,
            totalIterations,
            findings: [],
            previousQueries: []
          };
          
          // Message about starting research
          const startMessage = JSON.stringify({
            type: "message",
            message: "Starting web research..."
          });
          controller.enqueue(new TextEncoder().encode(`data: ${startMessage}\n\n`));
          
          // Formulate initial query
          let currentQuery = await formInitialQuery(intent, model);
          researchState.previousQueries.push(currentQuery);
          
          // Process each query
          while (researchState.iteration <= totalIterations) {
            const queryMessage = JSON.stringify({
              type: "message",
              message: `Processing query ${researchState.iteration}/${totalIterations}: ${currentQuery}`
            });
            controller.enqueue(new TextEncoder().encode(`data: ${queryMessage}\n\n`));
            
            // Perform research
            const { content, results } = await performResearch(currentQuery, researchState);
            
            // Extract key findings from content
            const findings = {
              query: currentQuery,
              content,
              keyFindings: content.split("KEY FINDINGS")[1]?.split(/\d+\.\s+/).filter(Boolean).map(f => f.trim()) || []
            };
            researchState.findings.push(findings);

            if (results.length > 0) {
              const resultsMessage = JSON.stringify({
                type: "results",
                data: results
              });
              controller.enqueue(new TextEncoder().encode(`data: ${resultsMessage}\n\n`));
            }

            // Move to next iteration
            if (researchState.iteration >= totalIterations) {
              break;
            }
            
            // Generate next query
            if (queries[researchState.iteration]) {
              // Use predefined query if available
              currentQuery = queries[researchState.iteration];
            } else {
              // Generate follow-up query
              currentQuery = await generateNextQuery(
                intent,
                researchState.previousQueries,
                findings.keyFindings,
                model
              );
            }
            
            researchState.previousQueries.push(currentQuery);
            researchState.iteration++;
          }
          
          // Final message
          const completionMessage = JSON.stringify({
            type: "message",
            message: "Web research completed"
          });
          controller.enqueue(new TextEncoder().encode(`data: ${completionMessage}\n\n`));
        } catch (error) {
          const errorMessage = JSON.stringify({
            type: "error",
            message: `Error: ${error instanceof Error ? error.message : String(error)}`
          });
          controller.enqueue(new TextEncoder().encode(`data: ${errorMessage}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(readableStream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
