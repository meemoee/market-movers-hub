
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'https://esm.sh/openai';

const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'],
});

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? '';

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
});

supabaseAdmin.functions

Bun.serve({
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    try {
      const { query, focusText, parentFocusText, previousQueries = [], previousAnalyses = [] } = await req.json();

      if (!query) {
        return new Response(JSON.stringify({ error: 'Missing query parameter' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Create context from previous research if available
      let previousResearchContext = '';

      // Only use limited history if there's a specific focus text to avoid contamination
      if (focusText) {
        // For focused research, avoid contamination from previous context

        // If we have a parent focus text, provide it as minimal context
        if (parentFocusText) {
          previousResearchContext = `
PARENT FOCUS CONTEXT:
The current focus "${focusText}" is derived from a previous research focus on "${parentFocusText}".

CRITICAL INSTRUCTION: Your queries MUST be EXCLUSIVELY about "${focusText}" in its own right. DO NOT mix in queries about "${parentFocusText}" unless they directly relate to "${focusText}".`;
        } else {
          // For first-level focus with no parent, use minimal previous context
          previousResearchContext = `
PREVIOUS RESEARCH CONTEXT (ABBREVIATED):
${previousAnalyses.length > 0 ? `\nPrevious analysis summary (USE ONLY AS BACKGROUND):\n${previousAnalyses.slice(-1)[0].substring(0, 500)}${previousAnalyses.slice(-1)[0].length > 500 ? '...' : ''}` : ''}

CRITICAL INSTRUCTION: Your queries MUST be EXCLUSIVELY about "${focusText}" regardless of any previous context. DO NOT let previous queries influence your new queries about "${focusText}".`;
        }
      } else if (previousQueries.length > 0 || previousAnalyses.length > 0) {
        // For regular non-focused research, use more previous context
        previousResearchContext = `
PREVIOUS RESEARCH CONTEXT:
${previousQueries.length > 0 ? `Previous search queries used:\n${previousQueries.slice(-15).map((q, i) => `${i + 1}. ${q}`).join('\n')}` : ''}
${previousAnalyses.length > 0 ? `\nPrevious analysis summary:\n${previousAnalyses.slice(-3).join('\n\n')}` : ''}`;
      }

      // Update the query generation prompt to emphasize focus text:
      const systemPrompt = `You are a research assistant generating search queries to investigate a topic.

TOPIC: ${query}
${focusText ? `SPECIFIC FOCUS: ${focusText}` : ''}
${previousResearchContext}

${focusText ? `CRITICAL: EVERY query MUST specifically target information about: ${focusText}. Do not generate generic queries that fail to directly address this focus area.` : ''}

Generate 5 search queries that are:
1. Highly specific and detailed about "${focusText || query}"
2. Each query MUST include additional aspects beyond just the focus term itself
3. Diverse in approach and perspective
4. COMPLETELY DIFFERENT from previous research queries
5. Designed to find NEW information not covered in previous research

Format as JSON array of strings. ONLY return the JSON array.`;

      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
        ],
        model: 'gpt-4',
        // model: 'gpt-3.5-turbo-1106',
        response_format: 'json_object',
      });

      const content = completion.choices[0]?.message?.content;

      if (!content) {
        console.error('No content returned from OpenAI:', completion);
        return new Response(JSON.stringify({ error: 'No queries returned from OpenAI' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      try {
        const queries = JSON.parse(content);

        if (!Array.isArray(queries)) {
          console.error('Invalid JSON format: Must be an array of strings.');
          return new Response(JSON.stringify({ error: 'Invalid JSON format: Must be an array of strings' }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        return new Response(JSON.stringify(queries), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (parseError) {
        console.error('Error parsing JSON:', parseError);
        console.error('Content received from OpenAI:', content);
        return new Response(JSON.stringify({ error: 'Error parsing JSON response from OpenAI' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch (error) {
      console.error('Function execution error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
  port: 3000,
});
