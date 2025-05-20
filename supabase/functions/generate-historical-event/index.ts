// @deno-types="https://deno.land/x/servest/types/react/index.d.ts"
import { corsHeaders } from '../_shared/cors.ts';
import { OpenRouter } from './openRouter.ts';

// Default model to use if none specified
const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    // Parse request body
    const { 
      marketQuestion, 
      model = DEFAULT_MODEL, 
      enableWebSearch = true, 
      maxSearchResults = 3,
      apiKey
    } = await req.json();
    
    // Validate required parameters
    if (!marketQuestion) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing market question' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing OpenRouter API key' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log(`Generating historical event for market question: "${marketQuestion}"`);
    
    // Initialize OpenRouter client
    const openRouter = new OpenRouter(apiKey);
    
    // Create the prompt for historical event generation
    const promptText = `Generate a historical event comparison for the market question: "${marketQuestion}".
      
Format your response as strict JSON with the following structure:
{
  "title": "Name of the historical event",
  "date": "Date or time period (e.g., 'March 2008' or '1929-1932')",
  "image_url": "A relevant image URL",
  "similarities": ["Similarity 1", "Similarity 2", "Similarity 3", "Similarity 4", "Similarity 5"],
  "differences": ["Difference 1", "Difference 2", "Difference 3", "Difference 4", "Difference 5"]
}

Make sure the JSON is valid and contains exactly these fields. For the image_url, use a real, accessible URL to a relevant image.`;

    // Generate the historical event
    const content = await openRouter.complete(
      model,
      [
        { role: "system", content: "You are a helpful assistant that generates historical event comparisons for market analysis." },
        { role: "user", content: promptText }
      ],
      1000, // Max tokens
      0.7,  // Temperature
      enableWebSearch ? { enabled: true, maxResults: maxSearchResults } : undefined
    );
    
    // Extract JSON from the response
    let extractedJson = content;
    
    // Check if the response contains a code block
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      extractedJson = jsonMatch[1];
    }
    
    // Parse the JSON response
    const eventData = JSON.parse(extractedJson);
    
    // Return the generated event
    return new Response(
      JSON.stringify({
        success: true,
        event: eventData
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
    
  } catch (error) {
    console.error(`Error in generate-historical-event function: ${error.message}`);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Internal server error: ${error.message}` 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
