
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TimelineEvent {
  title: string;
  description?: string;
  timestamp: string;
  event_type: string;
  icon: string;
}

interface EventsResponse {
  events: TimelineEvent[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { analysis, content, marketId } = await req.json();
    
    if (!analysis || !marketId) {
      throw new Error('Missing required parameters: analysis, marketId');
    }

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterKey) {
      throw new Error('OPENROUTER_API_KEY environment variable not set');
    }

    console.log(`Extracting timeline events for market ${marketId}`);
    
    // Generate the prompt with analysis and content
    const fullContent = `${analysis}\n\n${content || ''}`;
    const truncatedContent = fullContent.length > 10000 
      ? fullContent.substring(0, 10000) + "... [content truncated]" 
      : fullContent;

    // Log the content for debugging
    console.log("--- Start of Content Preview (first 500 chars) ---");
    console.log(truncatedContent.substring(0, 500) + (truncatedContent.length > 500 ? "..." : ""));
    console.log("--- End of Content Preview ---");
    
    // Log the content length
    console.log(`Total content length: ${fullContent.length}, Truncated to: ${truncatedContent.length}`);

    // Check for date patterns in the content
    const datePatterns = [
      /\b\d{4}-\d{2}-\d{2}\b/g, // ISO date: 2023-01-15
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/g, // Jan 15, 2023
      /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}\b/g // 15 Jan 2023
    ];
    
    const datesFound = datePatterns.flatMap(pattern => 
      truncatedContent.match(pattern) || []
    );
    
    console.log(`Found ${datesFound.length} date patterns in content: ${datesFound.slice(0, 10).join(", ")}${datesFound.length > 10 ? "..." : ""}`);

    const prompt = `From this market analysis and research content, identify up to 5 key events with exact dates.
Only include events with SPECIFIC dates that are mentioned in the content.
For each event, extract:
1. A brief title describing the event
2. A short description with details
3. The exact date (in ISO-8601 format if possible, e.g. YYYY-MM-DD)
4. An event type (use "info" for neutral information, "alert" for critical updates, "success" for positive outcomes)
5. An appropriate icon name (use one of: info, alert, calendar-check, flag, star, bookmark)

Return ONLY a JSON object with this exact structure:
{
  "events": [
    {
      "title": "Brief event title",
      "description": "Optional details about the event",
      "timestamp": "YYYY-MM-DD", 
      "event_type": "info|alert|success",
      "icon": "info|alert|calendar-check|flag|star|bookmark"
    }
  ]
}

If no events with specific dates are found, return an empty events array.
Do not include events without clear dates.`;

    console.log("Sending request to OpenRouter for timeline extraction");
    
    // Make request to OpenRouter API
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "http://localhost",
        "X-Title": "Market Research App",
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5", // Using a fast model since we need structured output
        messages: [
          {
            role: "system",
            content: "You are a specialized system that extracts timeline events with specific dates from market research content. You only output valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      })
    });

    // Log the response status and headers
    console.log(`OpenRouter response status: ${response.status}`);
    console.log(`OpenRouter response headers: ${JSON.stringify(Object.fromEntries(response.headers))}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenRouter API error response: ${errorText}`);
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    // Log the raw response data
    const rawResponseText = await response.text();
    console.log("--- OpenRouter Raw Response ---");
    console.log(rawResponseText);
    
    // Parse the response after logging the raw text
    let data;
    try {
      data = JSON.parse(rawResponseText);
      console.log("--- OpenRouter Parsed Response Structure ---");
      console.log(`Response has choices: ${!!data.choices}`);
      console.log(`Number of choices: ${data.choices?.length || 0}`);
      console.log(`First choice has message: ${!!data.choices?.[0]?.message}`);
      console.log(`Model used: ${data.model || 'unknown'}`);
      console.log(`Usage info: ${JSON.stringify(data.usage || {})}`);
    } catch (parseError) {
      console.error(`Failed to parse OpenRouter response as JSON: ${parseError.message}`);
      throw new Error(`Invalid JSON response from OpenRouter: ${parseError.message}`);
    }
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error(`Invalid response structure from OpenRouter: ${JSON.stringify(data)}`);
      throw new Error(`Invalid response structure from OpenRouter API: ${JSON.stringify(data)}`);
    }

    // Log the actual model output content
    console.log("--- OpenRouter Model Output Content ---");
    console.log(data.choices[0].message.content);

    let eventsData: EventsResponse;
    try {
      // Try to parse the content as JSON - might already be an object
      const content = data.choices[0].message.content;
      const contentToParse = typeof content === 'string' ? content : JSON.stringify(content);
      console.log(`Content type: ${typeof content}`);
      
      try {
        eventsData = typeof content === 'string' ? JSON.parse(content) : content;
        console.log("Successfully parsed content as JSON directly");
      } catch (directParseError) {
        console.error(`Failed direct JSON parse: ${directParseError.message}`);
        
        // Try to extract JSON if wrapped in markdown or other text
        const jsonMatch = contentToParse.match(/({[\s\S]*})/);
        if (jsonMatch) {
          try {
            eventsData = JSON.parse(jsonMatch[0]);
            console.log("Successfully parsed content by extracting JSON from text");
          } catch (extractParseError) {
            console.error(`Failed to parse extracted JSON: ${extractParseError.message}`);
            throw extractParseError;
          }
        } else {
          console.error("No JSON-like structure found in the response");
          throw directParseError;
        }
      }
      
      console.log(`Extracted ${eventsData.events?.length || 0} timeline events`);
      
      // Validate the response format
      if (!eventsData.events || !Array.isArray(eventsData.events)) {
        console.error("Events property missing or not an array");
        eventsData = { events: [] };
        console.log("No valid events found in the response, using empty array");
      }

      // Log the extracted events for debugging
      if (eventsData.events.length > 0) {
        console.log("--- Extracted Events ---");
        eventsData.events.forEach((event, i) => {
          console.log(`Event ${i+1}: ${event.title} - ${event.timestamp}`);
        });
      } else {
        console.log("No events were extracted from the content");
      }
      
      // Store events in the database
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      // Log the events we're about to insert
      console.log(`Attempting to insert ${eventsData.events.length} events for market ${marketId}`);
      
      for (const event of eventsData.events) {
        // Convert date string to timestamp if needed
        let timestamp = event.timestamp;
        
        // Add time if only date is provided
        if (timestamp && timestamp.length === 10 && timestamp.includes('-')) {
          timestamp = `${timestamp}T12:00:00Z`;
        }
        
        console.log(`Inserting event: "${event.title}" with timestamp ${timestamp}`);
        
        // Insert the event
        const { data, error } = await supabaseClient
          .from('market_events')
          .insert({
            market_id: marketId,
            event_type: event.event_type || 'info',
            title: event.title,
            description: event.description,
            timestamp: timestamp,
            icon: event.icon || 'info'
          })
          .select();
          
        if (error) {
          console.error(`Error inserting event: ${error.message}`, error);
        } else {
          console.log(`Successfully inserted event with ID: ${data?.[0]?.id}`);
        }
      }
      
      console.log(`Timeline events extraction completed for market ${marketId}`);
    } catch (parseError) {
      console.error(`Error parsing events data: ${parseError.message}`);
      console.error(`Stack trace: ${parseError.stack}`);
      eventsData = { events: [] };
    }

    return new Response(
      JSON.stringify(eventsData),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
    
  } catch (error) {
    console.error('Error in extract-timeline-events function:', error);
    console.error(`Stack trace: ${error.stack}`);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error', events: [] }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
