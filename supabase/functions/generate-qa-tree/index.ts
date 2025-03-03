
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Handle stream from text generation models
export function handleModelStream(req, openRouterApiKey, model, messages, callback) {
  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openRouterApiKey}`,
      'HTTP-Referer': 'https://lovable.ai',
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      stream: true,
    }),
  };

  return fetch('https://openrouter.ai/api/v1/chat/completions', requestOptions);
}

export async function streamProcessor(response, readable, writable) {
  const reader = response.body?.getReader();
  const writer = writable.getWriter();

  if (!reader) {
    await writer.close();
    return;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.trim() === '') continue;
        
        if (line.trim() === 'data: [DONE]') {
          await writer.write(new TextEncoder().encode('data: [DONE]\n\n'));
          continue;
        }
        
        if (line.startsWith('data: ')) {
          await writer.write(new TextEncoder().encode(line + '\n\n'));
        }
      }
      
      // Flush after each chunk
      await writer.ready;
    }
  } catch (e) {
    console.error("Stream processing error:", e);
  } finally {
    await writer.close();
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  try {
    // Get the API key from environment variables
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenRouter API key not configured' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const requestData = await req.json();
    
    // Extract parameters
    const { 
      marketId, 
      question, 
      parentContent, 
      historyContext,
      isFollowUp, 
      marketQuestion,
      model = "google/gemini-2.0-flash-lite-001", // Default to Gemini model
      useOpenRouter = true,
      researchContext 
    } = requestData;

    console.log(`Processing question: "${question}" for market ${marketId}`);
    console.log(`Using model: ${model} via OpenRouter: ${useOpenRouter}`);
    
    // Create base system message
    let systemPrompt = `You are an expert analyst specializing in prediction markets. You provide clear, concise analyses that help users understand complex topics. Your goal is to provide insightful analysis to help predict the outcome of the market question.`;
    
    if (researchContext) {
      systemPrompt += `\n\nHere is some relevant research that has been gathered on this topic:\n${researchContext.analysis}`;
      if (researchContext.areasForResearch && researchContext.areasForResearch.length > 0) {
        systemPrompt += `\n\nAreas that need more research: ${researchContext.areasForResearch.join(', ')}`;
      }
    }

    // Create message array
    let messages = [];
    
    // Add system message
    messages.push({ 
      role: "system", 
      content: systemPrompt
    });
    
    if (historyContext) {
      messages.push({
        role: "user",
        content: `Previous conversation history: ${historyContext}`
      });
    }
    
    // Determine what kind of request this is and construct appropriate messages
    if (isFollowUp) {
      // This is a request for follow-up questions
      messages.push({ 
        role: "user", 
        content: `I've been analyzing the market question: "${marketQuestion}". I already have this analysis of the question "${question}": "${parentContent}". 
        
        Based on this analysis, generate 3 specific and focused follow-up questions that would help get more clarity on the market outcome. Each follow-up should explore a different aspect of the question.
        
        Format your response as a JSON array of objects with a single "question" property for each object. For example:
        [{"question":"First follow-up question?"},{"question":"Second follow-up question?"},{"question":"Third follow-up question?"}]`
      });
      
      console.log("Processing follow-up questions request");
      
      // For follow-up questions, we'll process the entire response at once
      const { readable, writable } = new TransformStream();
      
      // Make request to OpenRouter
      const response = await handleModelStream(req, openRouterApiKey, model, messages);
      
      // Process the response
      streamProcessor(response, readable, writable);
      
      // Process all the chunks and collect the complete JSON
      const reader = readable.getReader();
      let fullResponse = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = new TextDecoder().decode(value);
        fullResponse += chunk;
      }
      
      // Extract JSON from the response
      let jsonResponse = [];
      try {
        const lines = fullResponse.split('\n');
        let jsonString = '';
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
            const content = JSON.parse(line.substring(6)).choices[0]?.delta?.content || '';
            jsonString += content;
          }
        }
        
        // Clean up json string and parse it
        jsonString = jsonString.replace(/^```json/, '').replace(/```$/, '').trim();
        jsonResponse = JSON.parse(jsonString);
        
        // If it's not an array, wrap it in an array
        if (!Array.isArray(jsonResponse)) {
          jsonResponse = [jsonResponse];
        }
        
        // Ensure each item has a "question" property
        jsonResponse = jsonResponse.map(item => {
          if (typeof item === 'string') {
            return { question: item };
          }
          return item;
        });
      } catch (e) {
        console.error("Error parsing JSON response:", e);
        console.log("Raw response:", fullResponse);
        jsonResponse = [
          { question: "What are the key factors that could influence this market's outcome?" },
          { question: "What historical precedents exist for similar situations?" },
          { question: "What expert opinions exist on this topic and how credible are they?" }
        ];
      }
      
      return new Response(
        JSON.stringify(jsonResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // This is a request for analysis of a question
      messages.push({ 
        role: "user", 
        content: `Provide a detailed analysis of the following question related to the prediction market: "${question}". 
        
        Related to market: "${marketQuestion}"
        
        Provide a comprehensive analysis that covers:
        1. Interpretation of the question and key factors
        2. Relevant data points and evidence
        3. Different perspectives on the issue
        4. Historical precedents (if applicable)
        5. Potential outcomes and their likelihoods
        
        Format your response using Markdown for better readability. Use headings, bullet points, and emphasis where appropriate.`
      });
      
      console.log("Processing question analysis request");
      
      // For analysis, we'll stream the response
      const { readable, writable } = new TransformStream();
      
      // Make request to OpenRouter
      const response = await handleModelStream(req, openRouterApiKey, model, messages);
      
      // Process and stream the response
      streamProcessor(response, readable, writable);
      
      return new Response(readable, { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        } 
      });
    }
  } catch (error) {
    console.error("Error in generate-qa-tree function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
