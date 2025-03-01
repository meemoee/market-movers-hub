
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  marketId: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { marketId } = await req.json() as RequestBody;
    
    console.log('Processing market query generation for:', marketId);

    // Get market details
    const { data: marketData, error: marketError } = await supabase
      .from('markets')
      .select('question, description')
      .eq('id', marketId)
      .single();

    if (marketError || !marketData) {
      console.error('Error fetching market data:', marketError);
      return new Response(
        JSON.stringify({ error: `Failed to fetch market: ${marketError?.message || 'Unknown error'}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const marketQuestion = marketData.question || '';
    const marketDescription = marketData.description || '';
    
    console.log('Market details for query generation:', { 
      question: marketQuestion,
      hasDescription: Boolean(marketDescription),
      descriptionLength: marketDescription?.length
    });

    // Generate queries based only on market question and description, not the ID
    let queries = [];
    
    // Remove any mention of "Yes" from the title and make it a standalone query
    const cleanedTitle = marketQuestion.replace(/Will|Does|Is|Are|Can|Could|Should|Would|Do|Did|Has|Have|Had|May|Might|Must|Shall|When|Where|Which|Who|Whom|Whose|Why|How/i, '').trim();
    const simplifiedTitle = cleanedTitle.replace(/\?$/, '').trim();
    
    queries.push(simplifiedTitle);
    
    // Add title with "latest news" for recency
    queries.push(`${simplifiedTitle} latest news`);
    
    // Add title with "prediction" or "forecast" for prediction-focused content
    queries.push(`${simplifiedTitle} prediction`);
    
    // Add title with "analysis" for analytical content
    queries.push(`${simplifiedTitle} analysis`);
    
    // If there's a description, extract key elements for additional queries
    if (marketDescription) {
      // Clean the description and extract key phrases
      const keyPhrases = marketDescription
        .split(/[.!?]/)
        .map(phrase => phrase.trim())
        .filter(phrase => phrase.length > 15 && phrase.length < 150);
      
      // Add up to 2 key phrases from the description
      for (let i = 0; i < Math.min(2, keyPhrases.length); i++) {
        queries.push(keyPhrases[i]);
      }
    }
    
    // Remove any empty queries and limit to max 5 queries
    queries = queries
      .filter(q => q.length > 0 && q.length < 150)
      .slice(0, 5);
    
    console.log('Generated queries:', queries);

    return new Response(
      JSON.stringify(queries),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating queries:', error);
    return new Response(
      JSON.stringify({ error: `Server error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
