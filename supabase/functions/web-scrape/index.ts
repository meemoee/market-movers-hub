
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { JSDOM } from "https://esm.sh/jsdom@21.1.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Readability } from "https://esm.sh/@mozilla/readability@0.4.3";
import { ScrapedContent } from "./types.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  url: string;
  marketQuestion?: string;
  marketDescription?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  // Get and validate request data
  const { url, marketQuestion, marketDescription } = await req.json() as RequestBody;
  
  if (!url) {
    return new Response(
      JSON.stringify({ error: 'URL is required' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }

  console.log(`Scraping URL: ${url}`, { 
    hasMarketQuestion: Boolean(marketQuestion),
    hasMarketDescription: Boolean(marketDescription)
  });

  try {
    // Set up abort controller with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    // Fetch the webpage with a custom user agent
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      signal: controller.signal
    }).catch(err => {
      if (err.name === 'AbortError') {
        throw new Error(`Request timeout after 15 seconds: ${url}`);
      }
      throw err;
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch URL (${response.status}): ${url}`);
    }

    // Get content type to verify if it's HTML
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new Error(`URL does not contain HTML content: ${url}`);
    }

    // Get the HTML content
    const html = await response.text();
    
    // Parse the HTML with JSDOM
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;
    
    // Extract the main content with Readability
    const reader = new Readability(document);
    const article = reader.parse();
    
    if (!article) {
      throw new Error(`Failed to extract article from URL: ${url}`);
    }

    // Use title from the article or fallback to document title
    const title = article.title || document.title || '';

    // Process and clean the content
    let content = article.textContent || '';
    content = content
      .replace(/\s+/g, ' ')        // Replace multiple spaces with a single space
      .replace(/\n+/g, '\n')       // Replace multiple newlines with a single newline
      .trim();                      // Remove leading/trailing whitespace

    // Create an object to return
    const result: ScrapedContent = {
      url,
      title,
      content: content.slice(0, 10000), // Limit content length
      snippet: content.slice(0, 200),   // Create a short snippet
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    return new Response(
      JSON.stringify({ error: `Scraping error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
