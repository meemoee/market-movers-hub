import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

interface GenerateQueriesRequest {
  query: string;
  title?: string;
  previousResults?: string;
  iteration?: number;
  marketId?: string;
  marketDescription?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: GenerateQueriesRequest = await req.json();
    const { query, title, previousResults, iteration = 0, marketDescription } = requestData;

    if (!query && !marketDescription) {
      return new Response(
        JSON.stringify({ error: "Query parameter is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Generate queries request:", { 
      query: query?.substring(0, 100), 
      title,
      iteration,
      marketDescription: marketDescription?.substring(0, 100)
    });

    // Prioritize using the question or description
    const searchContext = query || marketDescription || "";
    let searchTitle = title || "";
    
    // Extract key terms from the market description, avoiding the resolution conditions
    const cleanDescription = searchContext
      .replace(/This market will resolve (to|"Yes"|"No").*?\.(\s|$)/gi, '')
      .replace(/Otherwise, this market will resolve.*?\.(\s|$)/gi, '')
      .replace(/If the event is canceled or postponed.*?\.(\s|$)/gi, '')
      .replace(/The resolution source will be.*?\.(\s|$)/gi, '')
      .trim();
    
    console.log("Cleaned description:", cleanDescription);
    
    // Extract key phrases and terms
    const extractMainSubject = (text: string): string => {
      // Try to find the main subject by looking for what comes after "if" or similar phrases
      const ifPattern = /\s+if\s+([^,.;]+)/i;
      const match = text.match(ifPattern);
      if (match && match[1]) {
        return match[1].trim();
      }
      
      // Otherwise extract key nouns (usually proper nouns/names that are capitalized)
      const properNouns = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
      if (properNouns.length > 0) {
        return properNouns.slice(0, 3).join(' ');
      }
      
      // If all else fails, use the first 5-7 words
      return text.split(/\s+/).slice(0, 7).join(' ');
    };
    
    const mainSubject = extractMainSubject(cleanDescription);
    console.log("Main subject:", mainSubject);
    
    // Get key terms from the description
    const extractKeyTerms = (text: string): string[] => {
      const terms = text
        .split(/[.,;\s]+/)
        .filter(word => word.length > 3)
        .filter(word => !['market', 'will', 'resolve', 'this', 'that', 'with', 'from', 'have', 'been', 'would', 'could', 'should'].includes(word.toLowerCase()));
      
      return [...new Set(terms)].slice(0, 8);
    };
    
    const keyTerms = extractKeyTerms(cleanDescription);
    console.log("Key terms:", keyTerms);
    
    // Create the base query string for search
    let baseQuery = '';
    
    if (searchTitle && searchTitle.length > 3) {
      baseQuery = searchTitle;
    } else if (mainSubject) {
      baseQuery = mainSubject;
    } else if (keyTerms.length >= 3) {
      baseQuery = keyTerms.slice(0, 5).join(' ');
    } else {
      // Safe fallback if we couldn't extract meaningful terms
      baseQuery = cleanDescription.split('.')[0];
    }
    
    // Limit base query to a reasonable length
    if (baseQuery.length > 80) {
      baseQuery = baseQuery.substring(0, 80);
    }
    
    console.log("Base query:", baseQuery);
    
    // Generating search queries based on the extracted information and iteration
    let queries: string[] = [];
    
    if (iteration === 0) {
      // Initial focused queries
      queries = [
        `${baseQuery} latest information`,
        `${baseQuery} recent updates`,
        `${baseQuery} news`
      ];
      
      // If we have a specific event or date, add a more specific query
      if (cleanDescription.match(/\b(202\d|launch|event|test|attempt)\b/i)) {
        const currentYear = new Date().getFullYear();
        queries.push(`${baseQuery} ${currentYear} schedule`);
      }
    } else if (previousResults) {
      // Extract important terms from previous results for refinement
      const additionalTerms = previousResults
        .split(/\s+/)
        .filter(word => word.length > 5)
        .filter(word => !['information', 'analysis', 'however', 'therefore', 'indicates', 'suggests'].includes(word.toLowerCase()))
        .slice(0, 8);
      
      const uniqueAdditionalTerms = [...new Set(additionalTerms)].slice(0, 3).join(' ');
      
      // Generate more specific queries based on previous results
      queries = [
        `${baseQuery} ${uniqueAdditionalTerms} recent developments`,
        `${baseQuery} update ${new Date().getFullYear()}`,
        `${baseQuery} confirmed details`
      ];
    }

    // If we still have less than 3 queries, add some generic ones
    if (queries.length < 3) {
      if (!queries.find(q => q.includes('latest'))) {
        queries.push(`${baseQuery} latest information`);
      }
      if (!queries.find(q => q.includes('update'))) {
        queries.push(`${baseQuery} updates`);
      }
      if (!queries.find(q => q.includes('news'))) {
        queries.push(`${baseQuery} recent news`);
      }
    }

    // Trim and clean all queries
    queries = queries.map(q => q.trim().replace(/\s+/g, ' '));
    
    // Filter out any empty or duplicate queries
    queries = [...new Set(queries.filter(q => q.length > 5))];
    
    // Ensure we have at least 3 queries
    while (queries.length < 3) {
      const backupQueries = [
        `${baseQuery} information`,
        `${baseQuery} details`,
        `${baseQuery} facts`
      ];
      
      for (const bq of backupQueries) {
        if (!queries.includes(bq)) {
          queries.push(bq);
          if (queries.length >= 3) break;
        }
      }
    }
    
    console.log("Generated queries:", queries);

    return new Response(
      JSON.stringify({ queries: queries.slice(0, 3) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Generate queries error:", error);
    
    return new Response(
      JSON.stringify({ error: `Generate queries error: ${error.message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
