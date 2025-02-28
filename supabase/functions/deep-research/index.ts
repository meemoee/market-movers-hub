import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { openAI } from "./openRouter.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive'
};

interface RequestParams {
  description: string;
  marketId: string;
  stream?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description, marketId, stream = false } = await req.json() as RequestParams;

    if (!description) {
      return new Response(
        JSON.stringify({ success: false, error: "Market description is required" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Setup streaming response if requested
    if (stream) {
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        async start(controller) {
          try {
            // Send initial progress update
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'progress',
              iteration: 0,
              totalIterations: 5,
              query: 'Initializing research...'
            })}\n\n`));

            // Perform the deep research with streaming updates
            const report = await performStreamingResearch(description, marketId, (progress) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
            });

            // Send final report
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'report',
              report
            })}\n\n`));

            // Signal end of stream
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          } catch (error) {
            console.error('Streaming error:', error);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              message: error.message || 'An error occurred during research'
            })}\n\n`));
            controller.close();
          }
        }
      });

      return new Response(body, { headers: corsHeaders });
    } else {
      // Non-streaming response (keeping backward compatibility)
      const { report, steps } = await performResearch(description, marketId);
      return new Response(
        JSON.stringify({ success: true, report, steps }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error in deep-research function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || "An error occurred during research"
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function performStreamingResearch(description: string, marketId: string, progressCallback: (progress: any) => void) {
  const researchTopics = await generateInitialTopics(description);
  const totalIterations = researchTopics.length;
  
  // Update with initial topics
  progressCallback({
    type: 'progress',
    iteration: 0,
    totalIterations,
    query: `Generating ${totalIterations} research topics...`
  });

  let allResearchResults = [];

  // Perform iterative research
  for (let i = 0; i < researchTopics.length; i++) {
    const topic = researchTopics[i];
    
    // Update progress before starting this topic
    progressCallback({
      type: 'progress',
      iteration: i + 1,
      totalIterations,
      query: `Researching: ${topic.substring(0, 60)}${topic.length > 60 ? '...' : ''}`
    });

    // Deep dive into this topic
    const researchResult = await performSingleResearch(topic, description);
    allResearchResults.push(researchResult);

    await new Promise(resolve => setTimeout(resolve, 300)); // Small delay to ensure UI updates
  }

  // Final progress update
  progressCallback({
    type: 'progress',
    iteration: totalIterations,
    totalIterations,
    query: "Synthesizing research findings into final report..."
  });

  // Generate the final research report
  const report = await generateFinalReport(allResearchResults, description);
  
  // Store the research results in Supabase (optional)
  try {
    await storeResearchResults(marketId, description, report);
  } catch (err) {
    console.error("Error storing research results:", err);
    // Don't fail the whole process if storage fails
  }

  return report;
}

// Original non-streaming function (preserved for backward compatibility)
async function performResearch(description: string, marketId: string) {
  const researchTopics = await generateInitialTopics(description);
  const totalIterations = researchTopics.length;
  
  let allResearchResults = [];
  let steps = [];

  // Perform iterative research
  for (let i = 0; i < researchTopics.length; i++) {
    const topic = researchTopics[i];
    steps.push({
      query: `Researching: ${topic.substring(0, 60)}${topic.length > 60 ? '...' : ''}`,
      results: ''
    });

    // Deep dive into this topic
    const researchResult = await performSingleResearch(topic, description);
    allResearchResults.push(researchResult);
  }

  steps.push({
    query: "Synthesizing research findings into final report...",
    results: ''
  });

  // Generate the final research report
  const report = await generateFinalReport(allResearchResults, description);
  
  // Store the research results
  try {
    await storeResearchResults(marketId, description, report);
  } catch (err) {
    console.error("Error storing research results:", err);
  }

  return { report, steps };
}

async function generateInitialTopics(description: string) {
  console.log("Generating initial research topics for:", description);
  
  const response = await openAI({
    model: "gpt-4-turbo",
    messages: [
      {
        role: "system",
        content: "You are a research assistant that helps create focused research questions based on a market description. Generate 5 specific research questions or topics that would be valuable to investigate deeply."
      },
      {
        role: "user",
        content: `I'm researching this market: "${description}". Generate 5 specific research topics that would provide valuable insights for making predictions about this market. Each topic should focus on a different aspect (e.g., historical precedent, technical aspects, key players, regulatory environment, relevant statistics).`
      }
    ],
    temperature: 0.7,
    max_tokens: 600
  });

  try {
    const topicsText = response.choices[0].message.content.trim();
    // Extract numbered list items
    const topicsMatch = topicsText.match(/\d+\.\s+(.+?)(?=\d+\.|$)/gs);
    if (topicsMatch) {
      return topicsMatch.map(t => t.replace(/^\d+\.\s+/, '').trim());
    }
    
    // Fallback: split by newlines and filter
    const topics = topicsText.split('\n')
      .map(line => line.replace(/^\d+\.\s+/, '').trim())
      .filter(line => line.length > 15);
    
    return topics.slice(0, 5); // Ensure we have max 5 topics
  } catch (error) {
    console.error("Error parsing research topics:", error);
    // Fallback to basic topics if parsing fails
    return [
      "Historical precedents for this type of market",
      "Technical analysis of market factors",
      "Key stakeholders and their potential impact",
      "Regulatory environment affecting outcomes",
      "Statistical analysis of similar past events"
    ];
  }
}

async function performSingleResearch(topic: string, context: string) {
  console.log("Performing deep research on topic:", topic);
  
  const response = await openAI({
    model: "gpt-4-turbo",
    messages: [
      {
        role: "system",
        content: "You are a research assistant conducting a deep analysis of a specific topic. Provide detailed, factual information and insights based on the topic, considering the broader context provided."
      },
      {
        role: "user",
        content: `Research Topic: "${topic}"\n\nContext: "${context}"\n\nProvide a comprehensive analysis of this topic, focusing on facts, data, and insights that would be valuable for making predictions about the market described in the context. Include potential implications and how this information might affect forecasting.`
      }
    ],
    temperature: 0.5,
    max_tokens: 1000
  });

  return {
    topic,
    content: response.choices[0].message.content.trim()
  };
}

async function generateFinalReport(researchResults: any[], marketDescription: string) {
  console.log("Generating final research report");
  
  const combinedResearch = researchResults.map(r => 
    `Topic: ${r.topic}\n\n${r.content}`
  ).join("\n\n---\n\n");
  
  const response = await openAI({
    model: "gpt-4-turbo",
    messages: [
      {
        role: "system",
        content: "You are a research analyst synthesizing findings into a structured report. Your report should include a title, executive summary, key findings (as bullet points), analysis, and conclusion. Focus on insights that would help with forecasting and prediction."
      },
      {
        role: "user",
        content: `Based on the following research on this market: "${marketDescription}", synthesize a comprehensive report.\n\nResearch Findings:\n${combinedResearch}\n\nStructure your report with: 1) A descriptive title, 2) Executive summary (1-2 paragraphs), 3) Key findings (3-5 bullet points), 4) Brief analysis of implications, and 5) Conclusion that addresses how this research impacts probability forecasting.`
      }
    ],
    temperature: 0.4,
    max_tokens: 1500
  });

  const reportText = response.choices[0].message.content.trim();
  
  // Parse the report into structured sections
  try {
    const titleMatch = reportText.match(/^#\s+(.*?)$|^(.*?)(?=\n|$)/m);
    const title = titleMatch ? (titleMatch[1] || titleMatch[2]) : "Market Research Report";
    
    const executiveSummaryMatch = reportText.match(/Executive Summary[:\s]+([\s\S]*?)(?=##?\s+Key Findings|$)/i);
    const executiveSummary = executiveSummaryMatch ? executiveSummaryMatch[1].trim() : "";
    
    const keyFindingsMatch = reportText.match(/Key Findings[:\s]+([\s\S]*?)(?=##?\s+Analysis|##?\s+Implications|$)/i);
    let keyFindings: string[] = [];
    if (keyFindingsMatch) {
      keyFindings = keyFindingsMatch[1].split(/\n-|\n\*|\n\d+\./)
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }
    
    const analysisMatch = reportText.match(/(?:Analysis|Implications)[:\s]+([\s\S]*?)(?=##?\s+Conclusion|$)/i);
    const analysis = analysisMatch ? analysisMatch[1].trim() : "";
    
    const conclusionMatch = reportText.match(/Conclusion[:\s]+([\s\S]*?)$/i);
    const conclusion = conclusionMatch ? conclusionMatch[1].trim() : "";
    
    return {
      title,
      executiveSummary,
      keyFindings,
      analysis,
      conclusion
    };
  } catch (error) {
    console.error("Error parsing research report:", error);
    // Fallback to returning the raw text
    return {
      title: "Market Research Report",
      executiveSummary: "An error occurred while formatting the report.",
      keyFindings: ["The report was generated but could not be properly formatted."],
      analysis: "Please see the raw research data for details.",
      conclusion: reportText.substring(0, 200) + "..."
    };
  }
}

async function storeResearchResults(marketId: string, description: string, report: any) {
  console.log("Storing research results for market:", marketId);
  
  try {
    // Create a Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get the current user's ID from the request (if authenticated)
    // Since we're using the service role, we'll need to extract the user ID another way
    // This is just a placeholder - you might need to pass the user ID in the request
    const { data: user } = await supabase.auth.getUser();
    const userId = user?.user?.id;
    
    if (!userId) {
      console.warn("No user ID available, skipping research storage");
      return;
    }
    
    // Store the research in the database
    const { data, error } = await supabase
      .from('market_research')
      .insert({
        market_id: marketId,
        user_id: userId,
        query: description,
        report: report,
        created_at: new Date().toISOString()
      });
    
    if (error) throw error;
    console.log("Research stored successfully");
    
    return data;
  } catch (error) {
    console.error("Error storing research:", error);
    throw error;
  }
}
