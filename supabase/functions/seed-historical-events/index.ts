
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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
    // Create a Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Sample historical events
    const historicalEvents = [
      {
        title: 'Tech Bubble (2000)',
        date: 'March 2000',
        image_url: 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81',
      },
      {
        title: 'Financial Crisis (2008)',
        date: 'September 2008',
        image_url: 'https://images.unsplash.com/photo-1487058792275-0ad4aaf24ca7',
      },
      {
        title: 'COVID-19 Market Crash (2020)',
        date: 'March 2020',
        image_url: 'https://images.unsplash.com/photo-1584483766114-2cea6facdf57',
      }
    ]

    // Insert historical events
    const { data: insertedEvents, error: eventError } = await supabaseClient
      .from('historical_events')
      .upsert(
        historicalEvents,
        { onConflict: 'title', ignoreDuplicates: false }
      )
      .select()

    if (eventError) {
      throw new Error(`Error inserting historical events: ${eventError.message}`)
    }

    // Get the first few markets to create comparisons for
    const { data: markets, error: marketError } = await supabaseClient
      .from('markets')
      .select('id')
      .limit(5)

    if (marketError) {
      throw new Error(`Error fetching markets: ${marketError.message}`)
    }

    // Create comparisons between markets and historical events
    const comparisons = []
    
    for (const market of markets) {
      for (const event of insertedEvents) {
        comparisons.push({
          market_id: market.id,
          historical_event_id: event.id,
          similarities: [
            'Similar market volatility patterns',
            'Comparable investor sentiment trends',
            'Related economic indicators',
            'Parallel policy responses',
            'Analogous media coverage'
          ],
          differences: [
            'Different global economic context',
            'Varied technological landscape',
            'Distinct regulatory environment',
            'Different market participants',
            'Unique geopolitical factors'
          ]
        })
      }
    }

    // Insert comparisons
    const { error: comparisonError } = await supabaseClient
      .from('market_historical_comparisons')
      .upsert(
        comparisons,
        { onConflict: 'market_id,historical_event_id', ignoreDuplicates: false }
      )

    if (comparisonError) {
      throw new Error(`Error inserting comparisons: ${comparisonError.message}`)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Historical events and comparisons seeded successfully',
        events_created: insertedEvents.length,
        comparisons_created: comparisons.length 
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        },
        status: 200 
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        },
        status: 400 
      }
    )
  }
})
