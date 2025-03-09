
import { createClient } from 'https://esm.sh/@supabase/supabase-js'
import { OpenAI } from 'https://esm.sh/openai'

const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], // This is also the default, can be omitted
});

const supabaseAdmin = createClient(
  // Supabase URL
  process.env.SUPABASE_URL ?? '',
  // Supabase service role key
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  {
    auth: {
      persistSession: false,
    },
  }
)

async function analyzeSite(url: string, query: string, focusText: string | null = null, previousAnalyses: string[] = []): Promise<string> {
  try {
    console.log("Attempting to fetch:", url);
    const response = await fetch(url, {
      //credentials: "include",
      //mode: "no-cors"
    });

    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}`);
      return `Failed to fetch content from ${url}. Status: ${response.status}`;
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("text/html")) {
      console.error(`Content type not HTML: ${contentType}`);
      return `Content type not HTML from ${url}. Type: ${contentType}`;
    }

    const html = await response.text();
    if (!html) {
      console.warn(`Empty HTML received from ${url}`);
      return `Empty HTML received from ${url}`;
    }

    //console.log("Fetched HTML:", html.substring(0, 200) + "...");

    const prompt = `You are an expert research assistant tasked with analyzing content from a webpage to answer a specific question.

  Your task is to extract and synthesize information from the provided HTML content to directly answer the user's question. Focus on providing a clear, concise, and factual answer. Cite specific parts of the content to back up your claims.

  If the content does not contain information relevant to the question, state that the webpage does not contain relevant information.

  HTML content:
  ${html}

  QUESTION: ${query}
  ${focusText ? `SPECIFIC FOCUS: ${focusText}` : ''}
  ${previousAnalyses.length > 0 ? `PREVIOUS ANALYSIS SUMMARY:\n${previousAnalyses.join('\n\n')}` : ''}

  INSTRUCTIONS:
  1. Focus on answering the question using ONLY the provided HTML content.
  2. Be concise and clear.
  3. Cite specific portions of the HTML content to support your answer.
  4. If the HTML content is irrelevant or does not contain an answer, clearly state that the webpage does not contain relevant information.
  5. Do not make assumptions or use external knowledge.
  6. Do not include any introductory or concluding remarks.

  RESPONSE:`;

    console.log("Sending prompt to OpenAI:", prompt.substring(0, 500) + "...");

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      messages: [{ role: "system", content: prompt }],
      max_tokens: 1000,
    });

    const analysis = completion.choices[0].message?.content;

    if (!analysis) {
      console.warn(`No analysis generated for ${url}`);
      return `No analysis generated from ${url}`;
    }

    console.log("Analysis generated:", analysis.substring(0, 200) + "...");
    return analysis;

  } catch (error) {
    console.error(`Error during analysis of ${url}:`, error);
    return `Error analyzing ${url}: ${error}`;
  }
}

Bun.serve({
  async fetch(req) {
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
      const { marketId, query, focusText, parentFocusText, previousQueries, previousAnalyses } = await req.json();

      if (!marketId || !query) {
        return new Response(JSON.stringify({ error: 'Missing marketId or query' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      console.log(`Received request for marketId: ${marketId}, query: ${query}, focusText: ${focusText}, parentFocusText: ${parentFocusText}`);

      // 1. Generate search queries
      const { data: queriesData, error: queriesError } = await supabaseAdmin.functions.invoke('generate-queries', {
        body: {
          query,
          focusText,
          parentFocusText, // Add this line
          previousQueries: previousQueries || [],
          previousAnalyses: previousAnalyses || []
        }
      });

      if (queriesError) {
        console.error('Error generating queries:', queriesError);
        return new Response(JSON.stringify({ error: 'Failed to generate search queries', details: queriesError }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      const searchQueries = queriesData;
      console.log('Generated search queries:', searchQueries);

      // 2. Execute search queries and scrape websites
      //const searchResults = await Promise.all(searchQueries.map(runSearch));
      //console.log('Search results:', searchResults);

      // Mock search results for testing
      const searchResults = searchQueries.map(q => ({
        query: q,
        url: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
      }));

      // 3. Analyze each website
      const analyses = await Promise.all(searchResults.map(async (result) => {
        const analysis = await analyzeSite(result.url, query, focusText, previousAnalyses);
        return {
          query: result.query,
          url: result.url,
          analysis: analysis,
        };
      }));

      console.log('Website analyses:', analyses);

      // 4. Summarize findings
      // const { data: summaryData, error: summaryError } = await supabaseAdmin.functions.invoke('summarize-research', {
      //   body: {
      //     query,
      //     analyses,
      //     previousAnalyses: previousAnalyses || []
      //   }
      // });

      // if (summaryError) {
      //   console.error('Error summarizing research:', summaryError);
      //   return new Response(JSON.stringify({ error: 'Failed to summarize research', details: summaryError }), {
      //     status: 500,
      //     headers: {
      //       'Content-Type': 'application/json',
      //       'Access-Control-Allow-Origin': '*',
      //     },
      //   });
      // }

      // const summary = summaryData;
      // console.log('Research summary:', summary);

      // 5. Store results in Supabase
      const { data: insertData, error: insertError } = await supabaseAdmin
        .from('web_research')
        .insert([
          {
            market_id: marketId,
            query: query,
            analysis: JSON.stringify(analyses), //summary,
            queries: searchQueries,
            sources: searchResults.map(r => r.url),
          },
        ])
        .select();

      if (insertError) {
        console.error('Error inserting data:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to insert data into Supabase', details: insertError }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      console.log('Data inserted into Supabase:', insertData);

      return new Response(JSON.stringify({ data: analyses }), {  //summary
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });

    } catch (error) {
      console.error('Function execution error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error', details: error }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
  port: parseInt(process.env.PORT || '8000'),
  development: process.env.NODE_ENV !== 'production',
});

console.log(`🦊 Supabase Edge Function "web-research" running on port ${process.env.PORT || '8000'}`)
