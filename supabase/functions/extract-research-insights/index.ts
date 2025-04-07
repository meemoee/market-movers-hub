
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0' // Add Supabase client
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface RelatedMarket {
  market_id: string;
  question: string;
  probability: number;
  price_change?: number;
}

// interface InsightsRequest { // Keep for reference if needed, but not used directly
//   webContent: string;
//   analysis: string;
//   marketId?: string;
//   marketQuestion?: string;
//   previousAnalyses?: string[];
//   iterations?: any[];
//   queries?: string[];
//   areasForResearch?: string[];
//   focusText?: string;
//   marketPrice?: number;
//   relatedMarkets?: RelatedMarket[];
// }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- START MODIFICATION: Expect jobId and context, not analysis/webContent ---
    const {
      jobId, // Expect jobId
      marketId,
      marketQuestion,
      focusText, // Keep optional context fields passed from caller
      marketPrice,
      relatedMarkets
      // Removed webContent, analysis, previousAnalyses, iterations, queries, areasForResearch
    } = await req.json(); // Removed InsightsRequest type assertion

    if (!jobId) {
      return new Response(JSON.stringify({ error: 'jobId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch the required data from the database using jobId
    const { data: jobData, error: fetchError } = await supabaseClient
      .from('research_jobs')
      .select('final_analysis_stream, query, iterations, focus_text') // Fetch stream and other needed fields
      .eq('id', jobId)
      .single();

    if (fetchError || !jobData) {
      throw new Error(`Failed to fetch job data for ${jobId}: ${fetchError?.message || 'Not found'}`);
    }
    if (!jobData.final_analysis_stream) {
       throw new Error(`Final analysis stream is empty for job ${jobId}`);
    }

    const finalAnalysisText = jobData.final_analysis_stream;
    const jobQuery = marketQuestion || jobData.query; // Use passed marketQuestion or fallback
    const jobIterations = jobData.iterations || [];
    const jobFocusText = focusText || jobData.focus_text; // Use passed focusText or fallback

    // Extract previous analyses and areas for research from iterations if needed for prompt context
    const previousAnalyses = jobIterations
        .filter(iter => iter.analysis)
        .map(iter => iter.analysis);

    const areasForResearch: string[] = []; // Explicitly type as string array
     try {
       for (const iteration of jobIterations) {
         if (iteration.analysis) {
           const analysisText = iteration.analysis.toLowerCase();
           if (analysisText.includes("areas for further research") || analysisText.includes("further research needed") || analysisText.includes("additional research")) {
             const lines = iteration.analysis.split('\n');
             let inAreaSection = false;
             for (const line of lines) {
               if (!inAreaSection) {
                 if (line.toLowerCase().includes("areas for") || line.toLowerCase().includes("further research") || line.toLowerCase().includes("additional research")) {
                   inAreaSection = true;
                 }
               } else if (line.trim().length === 0 || line.startsWith('#')) {
                 inAreaSection = false;
               } else if (line.startsWith('-') || line.startsWith('*') || (line.match(/^\d+\.\s/) !== null)) {
                 const area = line.replace(/^[-*\d.]\s+/, '').trim();
                 if (area && !areasForResearch.includes(area)) {
                   areasForResearch.push(area);
                 }
               }
             }
           }
         }
       }
     } catch (areasError) {
       console.error(`Error extracting areas for research from iterations:`, areasError);
     }

    console.log(`Extract insights request for job ID ${jobId}:`, {
      analysisLength: finalAnalysisText?.length || 0,
      marketQuestion: jobQuery?.substring(0, 100) || 'Not provided',
      previousAnalysesCount: previousAnalyses?.length || 0, // Now derived
      iterationsCount: jobIterations?.length || 0, // Now derived
      // queriesCount: queries?.length || 0, // Removed, derive if needed
      areasForResearchCount: areasForResearch?.length || 0, // Now derived
      focusText: jobFocusText ? `${jobFocusText.substring(0, 100)}...` : 'None specified', // Use derived/combined focus
      marketPrice: marketPrice || 'Not provided', // Keep passed marketPrice
      relatedMarketsCount: relatedMarkets?.length || 0 // Keep passed relatedMarkets
    });
    // --- END MODIFICATION ---

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    
    if (!openRouterKey) {
      throw new Error('No API key configured for OpenRouter');
    }

    // Get current date in a readable format
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // --- START MODIFICATION: Use fetched analysis, derive context ---
    const analysisLimit = 70000; // Adjust as needed for token limits
    const truncatedAnalysis = finalAnalysisText.length > analysisLimit
      ? finalAnalysisText.substring(0, analysisLimit) + "... [analysis truncated]"
      : finalAnalysisText;

    // Derive context from fetched/passed data
    const previousAnalysesContext = previousAnalyses && previousAnalyses.length > 0
      ? `Previous iteration analyses (for context, synthesized in main analysis):
${previousAnalyses.map((a, i) => `Iteration ${i+1}: ${a.substring(0, 500)}${a.length > 500 ? '...[truncated]' : ''}`).join('\n')}` // Shorter context
      : '';

    // const queriesContext = ... derive from jobIterations if needed ...

    const previousResearchAreas = areasForResearch && areasForResearch.length > 0
      ? `Previously identified research areas (for context, synthesized in main analysis): ${areasForResearch.join(', ')}`
      : '';

    const isMarketResolved = marketPrice === 0 || marketPrice === 100;
    
    let marketPriceContext = '';
    if (marketPrice !== undefined) {
      if (isMarketResolved) {
        marketPriceContext = `\nIMPORTANT: The current market price for this event is ${marketPrice}%. This indicates the market considers this event as ${marketPrice === 100 ? 'already happened/resolved YES' : 'definitely not happening/resolved NO'}. Focus your analysis on explaining why this event ${marketPrice === 100 ? 'occurred' : 'did not occur'} rather than predicting probability.`;
      } else {
        marketPriceContext = `\nIMPORTANT: The current market price for this event is ${marketPrice}%. In prediction markets, this price reflects the market's current assessment of the probability that this event will occur. Consider how your evidence-based analysis compares to this market price.`;
      }
    }

    let relatedMarketsContext = '';
    if (relatedMarkets && relatedMarkets.length > 0) {
      relatedMarketsContext = "\nRelated markets and their current probabilities:\n";
      relatedMarkets.forEach(market => {
        const priceChangeInfo = market.price_change !== undefined ? 
          ` (${market.price_change > 0 ? '+' : ''}${(market.price_change * 100).toFixed(1)}pp change)` : '';
        relatedMarketsContext += `- "${market.question}": ${(market.probability * 100).toFixed(1)}%${priceChangeInfo}\n`;
      });
      relatedMarketsContext += "\nConsider how these related markets may affect your probability assessment. Are there dependencies or correlations between these markets and the main market?\n";
    }

    const marketContext = marketId && marketQuestion
      ? `\nYou are analyzing market ID: ${marketId} with the question: "${jobQuery}"\n` // Use jobQuery
      : '';

    const focusContext = jobFocusText // Use jobFocusText
      ? `\nCRITICAL: This analysis is specifically focused on: "${jobFocusText}"\nYou MUST ensure ALL evidence points directly address this specific focus area.\n`
      : '';

    const dateContext = `\nTODAY'S DATE: ${currentDate}\nWhen generating probability estimates, consider the temporal relevance of information relative to today's date. Be explicit about how the recency or timeliness of information impacts your assessment.\n`;

    const systemPrompt = `You are an expert market research analyst and probabilistic forecaster.${marketContext}${focusContext}${dateContext}
Your task is to analyze the provided final research analysis and generate precise probability estimates based on concrete evidence. // Modified task description

CRITICAL GUIDELINES FOR PROBABILITY ASSESSMENT:
1. Historical Precedents: Always cite specific historical events, statistics, or past occurrences that inform your estimate
2. Key Conditions: Identify and analyze the specific conditions that must be met for the event to occur
3. Impact Factors: List the major factors that could positively or negatively impact the probability
4. Evidence Quality: Assess the reliability and relevance of your sources
5. Uncertainty: Acknowledge key areas of uncertainty and how they affect your estimate
6. Competitive Analysis: When relevant, analyze competitor positions and market dynamics
7. Timeline Considerations: Account for time-dependent factors and how they affect probability
8. Temporal Relevance: Consider how the recency of information (relative to today, ${currentDate}) affects your probability assessment
9. LATEST DATA: PRIORITIZE recent figures, numbers and statistics from official sources over older data
10. OFFICIAL SOURCES: Give greater weight to authoritative sources, government data, regulatory documents, especially those mentioned in the market description
11. DEADLINE ANALYSIS: Explicitly assess the likelihood of changes occurring before the market resolution deadline
12. CHANGE MOMENTUM: Evaluate the rate and direction of recent developments and whether there is sufficient time for significant changes before the deadline
${jobFocusText ? `13. FOCUS AREA: Every evidence point MUST explicitly connect to the focus area: "${jobFocusText}". Prioritize evidence that directly addresses this specific aspect.\n` : ''} // Use jobFocusText

Format your analysis as a JSON object with:
{
  "probability": "X%" (numerical percentage with % sign),
  "areasForResearch": ["area 1", "area 2", "area 3", ...] (specific research areas as an array of strings),
  "reasoning": {
    "evidenceFor": [
      "Detailed point 1 supporting the event happening, with specific examples, statistics, or historical precedents${jobFocusText ? ` that directly addresses the focus area: "${jobFocusText}"` : ''}", // Use jobFocusText
      "Detailed point 2 supporting the event happening"
      // Add multiple points as needed
    ],
    "evidenceAgainst": [
      "Detailed point 1 against the event happening, with specific examples, statistics, or historical precedents${jobFocusText ? ` that directly addresses the focus area: "${jobFocusText}"` : ''}", // Use jobFocusText
      "Detailed point 2 against the event happening"
      // Add multiple points as needed
    ]
  }
}

IMPORTANT:
- In the "evidenceFor" and "evidenceAgainst" arrays, include detailed points with specific examples, historical precedents, statistics, and source citations where available.
- For resolved markets (0% or 100%), focus on explaining why the event did or didn't happen rather than probability assessment.
- Consider all dimensions of the question including economic, political, social, and technological factors.
- Each evidence point should be a complete, well-reasoned argument, not just a simple statement.
- Evaluate the temporal relevance of all evidence - clearly indicate when information may be outdated relative to today (${currentDate}).
- CRITICAL: Emphasize the MOST RECENT figures, percentages, and statistics available in your analysis.
- OFFICIAL SOURCES: Clearly identify and prioritize information from official sources, especially when mentioned in the market description.
- DEADLINE ASSESSMENT: For each evidence point, consider how likely it is to change before the market resolution deadline.
- TIME HORIZON: Explicitly assess whether there is sufficient time for significant changes to occur before the deadline.${jobFocusText ? `\n- EVERY evidence point MUST explicitly address the focus area: "${jobFocusText}". If evidence doesn't directly relate to this focus, it should be excluded or clearly connected to the focus.` : ''}`; // Use jobFocusText
    // --- END MODIFICATION ---

    // --- START MODIFICATION: Update prompt to use fetched analysis ---
    const prompt = `Here is the final analysis based on the research:
---
${truncatedAnalysis}
---

${previousAnalysesContext} ${previousResearchAreas} ${marketPriceContext} ${relatedMarketsContext}

TODAY'S DATE: ${currentDate}

Based on this final analysis, please provide:
1. A specific probability estimate for the market question: "${jobQuery}"
2. The key areas where more research is needed (consider gaps identified in the final analysis)
3. A detailed reasoning section with:
   - Evidence FOR the event happening (with specific historical precedents, examples, statistics, LATEST FIGURES from OFFICIAL SOURCES mentioned in the analysis)
   - Evidence AGAINST the event happening (with specific historical precedents, examples, statistics, LATEST FIGURES from OFFICIAL SOURCES mentioned in the analysis)
4. Consider the temporal relevance of all evidence relative to today's date (${currentDate})
5. CRITICAL: Prioritize the MOST RECENT data, figures and statistics available in the analysis, especially from official sources mentioned in the description
6. CRITICAL: Assess the likelihood of significant changes occurring before the market resolution deadline based on the analysis
7. CRITICAL: Evaluate whether there is sufficient time for the outcome to change before the deadline based on the analysis
${jobFocusText ? `\nCRITICAL: Your analysis MUST focus specifically on: "${jobFocusText}"\nEnsure ALL evidence points directly address this specific focus area.\n` : ''}

Remember to format your response as a valid JSON object with probability, areasForResearch, and reasoning fields.`;
    // --- END MODIFICATION ---

    // Helper function to validate JSON response
    const isValidInsightsResponse = (data: any): boolean => {
      if (!data) return false;
      
      try {
        // Check if we have the minimum required fields
        if (typeof data.probability !== 'string') return false;
        if (!Array.isArray(data.areasForResearch)) return false;
        
        // Check if reasoning exists and has the correct structure
        if (!data.reasoning) return false;
        if (!Array.isArray(data.reasoning.evidenceFor) && !Array.isArray(data.reasoning.evidenceAgainst)) {
          // If neither evidenceFor nor evidenceAgainst is an array, check if reasoning is a string
          return typeof data.reasoning === 'string';
        }
        
        return true;
      } catch (e) {
        console.error('Error validating response format:', e);
        return false;
      }
    };

    // Function to extract insights with retry logic
    const getInsightsWithRetry = async (maxRetries = 3): Promise<any> => {
      let retryCount = 0;
      let responseData;
      let validResponse = false;
      
      while (retryCount < maxRetries && !validResponse) {
        try {
          console.log(`Attempt #${retryCount + 1} to get insights from OpenRouter`);
          
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openRouterKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://hunchex.com',
              'X-Title': 'Hunchex Analysis'
            },
            body: JSON.stringify({
              model: "google/gemini-2.0-flash-lite-001",
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
              ],
              stream: false,
              temperature: 0.2,
              response_format: { type: "json_object" }
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`API error: ${response.status} ${errorText}`);
            throw new Error(`API error: ${response.status} ${errorText}`);
          }

          // Log the full raw response for debugging
          const rawResponseText = await response.text();
          console.log(`OpenRouter raw response (attempt #${retryCount + 1}):`, rawResponseText);
          
          try {
            // Parse the raw response text
            responseData = JSON.parse(rawResponseText);
            console.log(`OpenRouter parsed response structure (attempt #${retryCount + 1}):`, 
              JSON.stringify(Object.keys(responseData)));
            
            // Extract the actual model output
            const modelContent = responseData?.choices?.[0]?.message?.content;
            console.log(`Model content (attempt #${retryCount + 1}):`, 
              typeof modelContent === 'string' ? modelContent.substring(0, 500) + '...' : modelContent);
            
            let insightsData;
            
            // Try to parse the content if it's a string
            if (typeof modelContent === 'string') {
              try {
                insightsData = JSON.parse(modelContent);
                console.log(`Parsed insights data structure (attempt #${retryCount + 1}):`, 
                  JSON.stringify(Object.keys(insightsData)));
              } catch (parseError) {
                console.error(`Error parsing model content as JSON (attempt #${retryCount + 1}):`, parseError);
                throw new Error(`Invalid JSON in model response: ${parseError.message}`);
              }
            } else {
              insightsData = modelContent;
            }
            
            // Validate the response
            if (isValidInsightsResponse(insightsData)) {
              console.log(`Valid insights response received (attempt #${retryCount + 1})`);
              validResponse = true;
              return {
                ...responseData,
                insights: insightsData
              };
            } else {
              console.error(`Invalid insights format (attempt #${retryCount + 1}):`, insightsData);
              throw new Error('Response did not contain valid insights data');
            }
          } catch (parseError) {
            console.error(`Error processing OpenRouter response (attempt #${retryCount + 1}):`, parseError);
            throw parseError;
          }
        } catch (error) {
          console.error(`Error in attempt #${retryCount + 1}:`, error);
          retryCount++;
          
          if (retryCount >= maxRetries) {
            console.error(`Max retries (${maxRetries}) reached. Giving up.`);
            throw error;
          }
          
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
      
      throw new Error('Failed to get valid insights after maximum retries');
    };

    // Call the function with retry logic
    const results = await getInsightsWithRetry();
    
    // Extract the insights from the response
    const insightsData = results.insights;
    
    return new Response(JSON.stringify({
      ...results,
      choices: [{
        ...results.choices?.[0],
        message: {
          ...results.choices?.[0]?.message,
          content: insightsData
        }
      }]
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      }
    });
  } catch (error) {
    console.error('Error in extract-research-insights:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error',
        probability: "Error: Could not analyze",
        areasForResearch: [],
        reasoning: {
          evidenceFor: [],
          evidenceAgainst: []
        }
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});
