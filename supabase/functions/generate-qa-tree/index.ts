import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarketInfo {
  id: string;
  event_id: string;
  question: string;
  description: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  event_title: string;
}

interface QANode {
  question: string;
  answer: string;
  children?: QANode[];
}

interface QAPair {
  question: string;
  answer: string;
}

const OPENROUTER_SYSTEM_PROMPT = `YOU ARE A PRECISE EXTRACTION MACHINE:

ABSOLUTE REQUIREMENTS:
1. EVERY RESPONSE MUST USE EXACT ORIGINAL TEXT
2. FORMAT: 
   QUESTION: [VERBATIM QUESTION FROM SOURCE CONTEXT]
   ANSWER: [VERBATIM EXPLANATION/CONTEXT FROM SOURCE]
3. DO NOT REPHRASE OR SUMMARIZE
4. CAPTURE ORIGINAL MEANING WITH ZERO DEVIATION
5. QUESTIONS MUST BE DISCOVERABLE IN ORIGINAL TEXT
6. PRESERVE ALL ORIGINAL FORMATTING, CITATIONS, NUANCES

OUTPUT MUST BE RAW, UNMODIFIED EXTRACTION`;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { marketId } = await req.json();
    if (!marketId) {
      throw new Error('Market ID is required');
    }

    // Get auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get market info
    const { data: marketData, error: marketError } = await supabase
      .from('markets')
      .select(`
        id,
        event_id,
        question,
        description,
        active,
        closed,
        archived,
        events!inner (
          title
        )
      `)
      .eq('id', marketId)
      .single();

    if (marketError || !marketData) {
      throw new Error('Market not found');
    }

    const marketInfo: MarketInfo = {
      ...marketData,
      event_title: marketData.events.title
    };

    // Call OpenRouter API to generate analysis
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/lovable-chat/market-movers-hub",
      },
      body: JSON.stringify({
        model: "google/gemini-pro",
        messages: [
          { role: "system", content: OPENROUTER_SYSTEM_PROMPT },
          { 
            role: "user", 
            content: `Analyze this market question: ${marketInfo.question}\n\nContext: ${marketInfo.description}` 
          }
        ],
        temperature: 0.1,
      })
    });

    if (!response.ok) {
      throw new Error('Failed to generate analysis');
    }

    const result = await response.json();
    const analysisText = result.choices[0]?.message?.content;

    // Save to qa_trees table
    const { data: savedTree, error: saveError } = await supabase
      .from('qa_trees')
      .insert([
        {
          user_id: user.id,
          market_id: marketId,
          title: `Analysis Tree for ${marketInfo.question}`,
          tree_data: { root: analysisText }
        }
      ])
      .select()
      .single();

    if (saveError) {
      throw saveError;
    }

    return new Response(
      JSON.stringify(savedTree),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});