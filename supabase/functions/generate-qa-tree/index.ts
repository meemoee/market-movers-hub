
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { processStream } from "./streamProcessor.ts";

// Add CORS headers to all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    // Get API Key from environment
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable not set');
    }

    // Parse request
    const requestData = await req.json();
    console.log('Request received for market:', requestData.marketId);
    
    const {
      marketId,
      question,
      parentContent,
      isFollowUp = false,
      historyContext = '',
      marketQuestion = '',
      model = "google/gemini-2.0-flash-lite-001",
      useOpenRouter = true,
      researchContext = null,
    } = requestData;

    if (!question) {
      throw new Error('Question is required');
    }

    let systemPrompt = '';
    let userPrompt = '';

    if (isFollowUp) {
      // Follow-up questions generation
      systemPrompt = `You are an AI assistant specialized in exploring market prediction questions deeply. Your task is to generate 2-3 follow-up questions that will help explore different angles of a prediction market question. 
      Each follow-up question should dive deeper into a specific aspect, explore different scenarios, or examine related factors that could influence the outcome.`;

      userPrompt = `Based on the following market question and initial analysis, suggest 2-3 focused follow-up questions that would help explore different aspects of this prediction.
      
      Original Market Question: ${marketQuestion || question}
      
      Initial Analysis: ${parentContent}
      
      ${historyContext ? `Additional Context: ${historyContext}` : ''}
      
      ${researchContext ? `Research Context: ${researchContext.analysis}` : ''}
      
      Return ONLY a JSON array of objects with a single "question" field for each follow-up question. Example format:
      [{"question":"First follow-up question?"},{"question":"Second follow-up question?"}]`;
    } else {
      // Initial analysis generation
      systemPrompt = `You are an expert analyst for prediction markets. Your role is to provide detailed, balanced, and insightful analysis for questions about future events.`;

      userPrompt = `Provide a comprehensive analysis of this prediction market question:
      
      "${question}"
      
      ${marketQuestion && marketQuestion !== question ? `This is related to the broader question: "${marketQuestion}"` : ''}
      
      ${historyContext ? `Context from previous analysis: ${historyContext}` : ''}
      
      ${researchContext ? `Research Context: ${researchContext.analysis}
      Probability estimate from research: ${researchContext.probability}
      Key areas identified in research: ${researchContext.areasForResearch.join(', ')}` : ''}
      
      Your analysis should:
      1. Break down the key factors
      2. Consider different perspectives
      3. Identify critical uncertainties
      4. Explain relevant historical precedents if applicable
      5. Evaluate potential scenarios and their likelihoods
      
      Be thorough yet concise. Provide nuanced analysis that would help someone make an informed prediction.`;
    }

    // Prepare the API request
    const apiEndpoint = useOpenRouter 
      ? "https://openrouter.ai/api/v1/chat/completions" 
      : "https://api.openai.com/v1/chat/completions";

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (useOpenRouter) {
      headers['Authorization'] = `Bearer ${openRouterApiKey}`;
      headers['HTTP-Referer'] = 'https://hunchex.app';
      headers['X-Title'] = 'HunchEx';
    } else {
      const openAiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openAiKey) {
        throw new Error('OPENAI_API_KEY environment variable not set');
      }
      headers['Authorization'] = `Bearer ${openAiKey}`;
    }

    console.log(`Sending request to model: ${model} via ${useOpenRouter ? 'OpenRouter' : 'OpenAI'}`);

    const requestBody = {
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      stream: !isFollowUp, // Only stream for initial analysis
      temperature: isFollowUp ? 0.9 : 0.7,
      max_tokens: isFollowUp ? 500 : 2000,
    };

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error (${response.status}):`, errorText);
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    // If we're generating follow-up questions, return the complete response
    if (isFollowUp) {
      const data = await response.json();
      const content = data.choices[0].message.content;
      
      try {
        // Parse the JSON array of questions
        let questions = JSON.parse(content);
        
        // Handle if the response is not formatted as expected
        if (!Array.isArray(questions)) {
          // Try to extract a JSON array from the content
          const match = content.match(/\[\s*\{.*\}\s*\]/s);
          if (match) {
            questions = JSON.parse(match[0]);
          } else {
            throw new Error('Response is not a valid array');
          }
        }
        
        console.log(`Generated ${questions.length} follow-up questions`);
        return new Response(JSON.stringify(questions), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('Error parsing follow-up questions:', error, 'Content:', content);
        // Fallback by creating a simple structure
        return new Response(JSON.stringify([
          { question: "What are the most significant factors that could influence this outcome?" },
          { question: "How might recent developments affect the probability of this event?" }
        ]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } 
    
    // For initial analysis, stream the response
    if (!response.body) {
      throw new Error('Response has no body');
    }

    const reader = response.body.getReader();
    const stream = await processStream(reader);
    
    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error('Error in generate-qa-tree function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
