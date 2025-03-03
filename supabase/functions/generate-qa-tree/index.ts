
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { StreamProcessor } from "./streamProcessor.ts"

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { 
      marketId, 
      question, 
      parentContent = '',
      historyContext = '',
      isFollowUp = false,
      marketQuestion = '',
      researchContext = null,
      model = "gpt-4o-mini",
      useOpenRouter = false
    } = await req.json()

    console.log(`Processing request for market: ${marketId}, Question: ${question.substring(0, 100)}...`)
    console.log(`Using model: ${model} via ${useOpenRouter ? 'OpenRouter' : 'OpenAI'}`)
    
    let systemPrompt = ''
    let userPrompt = ''
    
    if (isFollowUp) {
      // Request to generate follow-up questions
      console.log("Generating follow-up questions based on analysis")
      
      systemPrompt = `You are an expert financial market analyzer's assistant. You help by generating logical follow-up questions to dig deeper into market analysis. 
Generate 2-3 specific follow-up questions based on the provided market question and analysis. Your questions should:
1. Explore different angles not yet covered in the analysis
2. Focus on the most important factors for understanding market probability
3. Be clearly worded and specific, not vague
4. Not repeat information already covered in the analysis
5. Target information gaps or areas of uncertainty
`

      userPrompt = `Market Question: ${marketQuestion || question}

${historyContext ? `Previous analysis context:\n${historyContext}\n\n` : ''}

Analysis: ${parentContent}

${researchContext ? `Additional market research:\n${researchContext.analysis || ''}\n\n` : ''}

Generate 2-3 specific follow-up questions to investigate important aspects of this market question that need further analysis. Format your response as a JSON array with each question as an object with a "question" field.`

    } else {
      // Request to analyze a question
      console.log("Analyzing market question")
      
      systemPrompt = `You are an expert financial market analyst specializing in probability assessment and forecasting. 
Your task is to thoroughly analyze a question about a financial market and provide a comprehensive assessment.

Your analysis should:
1. Break down all key factors that affect the probability
2. Consider evidence from multiple perspectives
3. Evaluate the timeframe and specific conditions
4. Analyze historical precedents if relevant
5. Provide a measured, evidence-based assessment
6. Clearly explain your reasoning process
7. Consider both potential outcomes and explain what would lead to each

Be thorough but concise. Present information in a clear, structured way. Avoid vague statements without supporting evidence.`

      userPrompt = `Market Question: ${question}

${historyContext ? `Previous analysis context:\n${historyContext}\n\n` : ''}

${researchContext ? `Additional market research:\n${researchContext.analysis || ''}\n\n` : ''}

${researchContext?.areasForResearch?.length > 0 ? `Areas needing further research:\n${researchContext.areasForResearch.join('\n')}\n\n` : ''}

Probability estimate from research: ${researchContext?.probability || 'Not available'}

Please provide a comprehensive analysis of this market question. Assess key factors, evaluate evidence, and explain your reasoning clearly.`
    }

    // Choose API endpoint and format request based on whether we're using OpenRouter or OpenAI
    let apiUrl = "https://api.openai.com/v1/chat/completions"
    let headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    }
    
    if (useOpenRouter) {
      apiUrl = "https://openrouter.ai/api/v1/chat/completions"
      headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://hunchex.com",
        "X-Title": "Hunchex Market Analysis"
      }
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        stream: true
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`API error (${response.status}): ${error}`)
      throw new Error(`API request failed with status ${response.status}: ${error}`)
    }

    console.log("Stream response started, beginning stream processing")
    
    // Create a function to process the stream
    const processStream = async (readableStream: ReadableStream, marketId: string, isFollowUp: boolean) => {
      const streamProcessor = new StreamProcessor();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      
      // Create a response stream
      const stream = new TransformStream();
      const writer = stream.writable.getWriter();
      
      // Process the stream
      try {
        const reader = readableStream.getReader();
        let completeResponse = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content || '';
                if (content) {
                  completeResponse += content;
                  
                  if (!isFollowUp) {
                    // For analysis, stream directly to client
                    await writer.write(encoder.encode(content));
                  }
                }
              } catch (e) {
                console.error('Error parsing JSON:', e);
              }
            }
          }
        }
        
        if (isFollowUp) {
          // For follow-up questions, we need to parse the JSON
          try {
            // Add brackets if they're missing (handling partial JSON)
            if (!completeResponse.trim().startsWith('[')) {
              completeResponse = '[' + completeResponse;
            }
            if (!completeResponse.trim().endsWith(']')) {
              completeResponse = completeResponse + ']';
            }
            
            // Parse and validate the JSON
            const questions = JSON.parse(completeResponse);
            const validQuestions = Array.isArray(questions) ? 
              questions.filter(q => q && typeof q.question === 'string') : [];
            
            // Write the full response at once
            await writer.write(encoder.encode(JSON.stringify(validQuestions)));
          } catch (e) {
            console.error('Error processing follow-up questions:', e);
            await writer.write(encoder.encode(JSON.stringify([
              { question: "What additional factors might influence this market?" },
              { question: "How might recent developments affect the outcome?" }
            ])));
          }
        }
      } catch (error) {
        console.error('Stream processing error:', error);
        await writer.write(encoder.encode(`Error: ${error.message}`));
      } finally {
        await writer.close();
      }
      
      return new Response(stream.readable, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    };
    
    if (isFollowUp) {
      // For follow-up questions, we need to accumulate the entire response to parse the JSON
      return processStream(response.body, marketId, true);
    } else {
      // For analysis, we stream directly to the client
      return processStream(response.body, marketId, false);
    }
  } catch (error) {
    console.error("Function error:", error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    )
  }
})
