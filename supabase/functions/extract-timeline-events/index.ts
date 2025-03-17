
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

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error(`Invalid response from OpenRouter API: ${JSON.stringify(data)}`);
    }

    let eventsData: EventsResponse;
    try {
      // Try to parse the content as JSON - might already be an object
      const content = data.choices[0].message.content;
      eventsData = typeof content === 'string' ? JSON.parse(content) : content;
      
      console.log(`Extracted ${eventsData.events?.length || 0} timeline events`);
      
      // Validate the response format
      if (!eventsData.events || !Array.isArray(eventsData.events)) {
        eventsData = { events: [] };
        console.log("No valid events found in the response, using empty array");
      }
      
      // Store events in the database
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      for (const event of eventsData.events) {
        // Convert date string to timestamp if needed
        let timestamp = event.timestamp;
        
        // Add time if only date is provided
        if (timestamp && timestamp.length === 10 && timestamp.includes('-')) {
          timestamp = `${timestamp}T12:00:00Z`;
        }
        
        // Insert the event
        const { error } = await supabaseClient
          .from('market_events')
          .insert({
            market_id: marketId,
            event_type: event.event_type || 'info',
            title: event.title,
            description: event.description,
            timestamp: timestamp,
            icon: event.icon || 'info'
          });
          
        if (error) {
          console.error(`Error inserting event: ${error.message}`);
        }
      }
    } catch (parseError) {
      console.error(`Error parsing events data: ${parseError.message}`);
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
    
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
