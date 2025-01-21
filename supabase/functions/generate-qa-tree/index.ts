import { createClient } from '@supabase/supabase-js';
import { Database } from '../_shared/database.types';

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getMarketInfo(supabase: any, marketId: string): Promise<MarketInfo | null> {
  const { data, error } = await supabase
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

  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    event_title: data.events.title
  };
}

async function parseWithLLM(content: string): Promise<QAPair[] | null> {
  if (!content) return null;

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
        { role: "user", content }
      ],
      temperature: 0.1,
    })
  });

  if (!response.ok) return null;
  const result = await response.json();
  const text = result.choices[0]?.message?.content;
  
  try {
    // Parse the response into QA pairs
    const lines = text.split('\n');
    const qaPairs: QAPair[] = [];
    let currentQuestion = '';
    let currentAnswer = '';

    for (const line of lines) {
      if (line.startsWith('QUESTION:')) {
        if (currentQuestion && currentAnswer) {
          qaPairs.push({ question: currentQuestion, answer: currentAnswer });
        }
        currentQuestion = line.replace('QUESTION:', '').trim();
        currentAnswer = '';
      } else if (line.startsWith('ANSWER:')) {
        currentAnswer = line.replace('ANSWER:', '').trim();
      }
    }

    if (currentQuestion && currentAnswer) {
      qaPairs.push({ question: currentQuestion, answer: currentAnswer });
    }

    return qaPairs;
  } catch (error) {
    console.error('Error parsing LLM response:', error);
    return null;
  }
}

async function generateQATree(marketInfo: MarketInfo, maxDepth = 2, nodesPerLayer = 3): Promise<QANode | null> {
  // Generate root question
  const rootPrompt = `
    MARKET CONTEXT:
    Title: ${marketInfo.question}
    Description: ${marketInfo.description}
    Event: ${marketInfo.event_title}

    INSTRUCTION: 
    GENERATE A PRECISE, VERBATIM QUESTION CAPTURING THE FUNDAMENTAL MARKET UNCERTAINTY
  `;

  const rootQA = await parseWithLLM(rootPrompt);
  if (!rootQA || rootQA.length === 0) return null;

  const root: QANode = {
    question: rootQA[0].question,
    answer: rootQA[0].answer,
    children: []
  };

  async function generateChildren(node: QANode, depth: number) {
    if (depth >= maxDepth) return;

    const childPrompt = `
      PARENT QUESTION CONTEXT:
      QUESTION: ${node.question}
      ANSWER: ${node.answer}

      MARKET DETAILS:
      Title: ${marketInfo.question}
      Description: ${marketInfo.description}

      INSTRUCTION:
      EXTRACT ${nodesPerLayer} PRECISE SUB-QUESTIONS THAT:
      - EXAMINE NEW, NOVEL ASPECTS
      - DO NOT OVERLAP WITH PARENT CONTENT
      - REMAIN RELEVANT TO PARENT ANSWER
      - CAPTURE DISTINCT ANALYTICAL PERSPECTIVES
    `;

    const children = await parseWithLLM(childPrompt);
    if (children) {
      node.children = children.map(child => ({
        question: child.question,
        answer: child.answer
      }));

      for (const child of node.children) {
        await generateChildren(child, depth + 1);
      }
    }
  }

  await generateChildren(root, 0);
  return root;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient<Database>(
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
    const marketInfo = await getMarketInfo(supabase, marketId);
    if (!marketInfo) {
      throw new Error('Market not found');
    }

    // Generate QA tree
    const treeData = await generateQATree(marketInfo);
    if (!treeData) {
      throw new Error('Failed to generate QA tree');
    }

    // Save to database
    const { data: savedTree, error: saveError } = await supabase
      .from('qa_trees')
      .insert([
        {
          user_id: user.id,
          market_id: marketId,
          title: `Analysis Tree for ${marketInfo.question}`,
          tree_data: treeData
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