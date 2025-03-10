import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Enhanced query templates by category
const QUERY_TEMPLATES = {
  factual: [
    "{focus} official statistics {timeframe}",
    "{focus} verified data from {source_type}",
    "{focus} quantitative analysis {timeframe}",
    "{focus} measured impact on {related_entity}",
    "{focus} statistical evidence {timeframe} with {criteria}",
    "{focus} documented cases with {criteria}"
  ],
  analytical: [
    "{focus} expert assessment by {expert_type}",
    "{focus} comparative analysis with {related_event}",
    "{focus} critical factors determining {outcome}",
    "{focus} methodology for evaluating {criteria}",
    "{focus} analytical frameworks applied to {context}",
    "{focus} systematic review of {evidence_type}"
  ],
  temporal: [
    "{focus} developments since {timeframe}",
    "{focus} historical precedents before {timeframe}",
    "{focus} projected timeline for {outcome}",
    "{focus} scheduling factors affecting {outcome}",
    "{focus} temporal patterns in {timeframe}",
    "{focus} rate of change since {timeframe}"
  ],
  contextual: [
    "{focus} in relation to {related_entity}",
    "{focus} geographical constraints affecting {outcome}",
    "{focus} political considerations for {stakeholder}",
    "{focus} economic implications for {sector}",
    "{focus} cultural context affecting {outcome}",
    "{focus} institutional framework for {process}"
  ],
  counterfactual: [
    "{focus} potential obstacles preventing {outcome}",
    "{focus} alternative scenarios if {condition}",
    "{focus} contradictory evidence regarding {assumption}",
    "{focus} skeptical perspective from {stakeholder}",
    "{focus} failure modes documented in {source_type}",
    "{focus} criticism from {expert_type} about {assumption}"
  ],
  source_specific: [
    "{focus} according to {source_type} publications",
    "{focus} research papers from {institution_type}",
    "{focus} analysis in peer-reviewed journals",
    "{focus} reports from {organization_type}",
    "{focus} data published by {authority_type}",
    "{focus} case studies documenting {criteria}"
  ],
  effectiveness_patterns: [
    // These will be dynamically populated based on previous effective queries
  ]
};

// Additional template variables for more specific targeting
const EXPANDED_TEMPLATE_VARS = {
  focus: [], // Will be populated dynamically
  timeframe: [
    "2023-2024", "last 6 months", "recent", "past decade", 
    "next 5 years", "coming quarter", "historical record",
    "pre-2020", "post-pandemic", "during economic recession"
  ],
  source_type: [
    "government reports", "academic studies", "industry analyses", 
    "independent research", "financial disclosures", "regulatory filings",
    "patent applications", "investigative journalism", "technical documentation"
  ],
  related_entity: [
    "global markets", "regulatory bodies", "key stakeholders", 
    "international relations", "supply chains", "competitive landscape",
    "consumer segments", "technological ecosystems", "political institutions"
  ],
  expert_type: [
    "economists", "political analysts", "technical specialists", 
    "industry insiders", "academic researchers", "regulatory experts",
    "market strategists", "scientific authorities", "legal scholars"
  ],
  related_event: [
    "similar historical cases", "parallel market events", "comparable situations",
    "preceding technological innovations", "earlier regulatory changes",
    "successful implementations", "notable failures"
  ],
  outcome: [
    "success", "failure", "implementation", "deadline", "adoption", 
    "market penetration", "regulatory approval", "public acceptance",
    "commercial viability", "technological obsolescence"
  ],
  criteria: [
    "accuracy", "feasibility", "likelihood", "timing", "cost-effectiveness",
    "regulatory compliance", "scalability", "sustainability",
    "social impact", "technical performance"
  ],
  stakeholder: [
    "governments", "corporations", "citizens", "investors", "regulators",
    "industry consortia", "scientific community", "advocacy groups",
    "developing nations", "technology providers"
  ],
  sector: [
    "technology", "finance", "manufacturing", "politics", "healthcare",
    "energy", "transportation", "agriculture", "defense", "education"
  ],
  condition: [
    "delayed", "accelerated", "modified", "cancelled", "partial implementation",
    "regulatory intervention", "market disruption", "technological breakthrough",
    "public opposition", "resource limitations"
  ],
  assumption: [
    "feasibility", "timeline", "motivation", "capability", "market demand",
    "cost projections", "technical capabilities", "regulatory environment",
    "competitive response", "public acceptance"
  ],
  evidence_type: [
    "quantitative data", "qualitative assessments", "expert testimonies",
    "case studies", "statistical analyses", "technical benchmarks",
    "financial projections", "user studies"
  ],
  institution_type: [
    "universities", "research institutes", "government agencies",
    "think tanks", "corporate R&D departments", "industry consortia",
    "regulatory bodies", "international organizations"
  ],
  organization_type: [
    "UN agencies", "industry associations", "oversight committees",
    "central banks", "standards bodies", "NGOs", "advocacy groups",
    "professional societies"
  ],
  authority_type: [
    "regulatory authorities", "central statistical offices", "international bodies",
    "industry watchdogs", "financial regulators", "scientific institutions",
    "market research firms"
  ],
  process: [
    "implementation", "adoption", "compliance", "decision-making",
    "validation", "certification", "market entry", "scaling",
    "regulatory approval"
  ],
  context: [
    "emerging markets", "mature economies", "technological transitions",
    "regulatory landscapes", "competitive environments", "historical precedents",
    "social contexts", "economic conditions"
  ]
};

function generateQueryFromTemplate(template, vars, iteration, adaptations = []) {
  let query = template;
  
  // Apply template adaptations (learned from effective queries)
  if (adaptations.length > 0 && Math.random() > 0.7) {
    // 30% chance to apply an adaptation from successful queries
    const adaptation = adaptations[Math.floor(Math.random() * adaptations.length)];
    // Apply the adaptation (could be adding specific phrases, structures, etc.)
    if (adaptation.prefix) query = adaptation.prefix + " " + query;
    if (adaptation.suffix) query = query + " " + adaptation.suffix;
    if (adaptation.replacement && query.includes(adaptation.target)) {
      query = query.replace(adaptation.target, adaptation.replacement);
    }
  }
  
  // Replace placeholders with selected values
  for (const [key, options] of Object.entries(vars)) {
    const placeholder = `{${key}}`;
    if (query.includes(placeholder)) {
      // Choose a random option from the array, with preference for more specific options
      const option = options[Math.floor(Math.random() * options.length)];
      query = query.replace(placeholder, option);
    }
  }
  
  // Replace any remaining placeholders with generic terms
  query = query.replace(/{[a-z_]+}/g, "");
  
  // Add iteration marker to avoid duplication
  if (iteration > 1) {
    query += ` (iteration ${iteration})`;
  }
  
  return query.trim().replace(/\s+/g, ' ');
}

// Enhanced template selection based on research progress
function selectTemplatesForIteration(iteration, previousQueries, queryEffectiveness) {
  const templates = [];
  const categories = Object.keys(QUERY_TEMPLATES);
  
  // First iteration: balanced mix of categories
  if (iteration === 1) {
    // Select one template from each of the main categories
    categories.forEach(category => {
      if (category !== 'effectiveness_patterns') { // Skip the dynamic category for first iteration
        const categoryTemplates = QUERY_TEMPLATES[category];
        const template = categoryTemplates[Math.floor(Math.random() * categoryTemplates.length)];
        templates.push(template);
      }
    });
  }
  // Later iterations: bias toward effective categories and templates
  else {
    // Identify which categories were most effective in previous iterations
    const categoryEffectiveness = {};
    if (previousQueries && previousQueries.length > 0 && queryEffectiveness) {
      previousQueries.forEach(query => {
        // Try to match the query to its original template category
        for (const category of categories) {
          const categoryTemplates = QUERY_TEMPLATES[category];
          // Simple heuristic: if query contains words typical of the category
          const categoryKeywords = getCategoryKeywords(category);
          const matchesCategory = categoryKeywords.some(keyword => 
            query.toLowerCase().includes(keyword.toLowerCase())
          );
          
          if (matchesCategory) {
            // If we have effectiveness data for this query, use it
            const effectiveness = queryEffectiveness[query] || 5; // Default to medium
            categoryEffectiveness[category] = (categoryEffectiveness[category] || 0) + effectiveness;
          }
        }
      });
    }
    
    // Weight categories by effectiveness
    const weightedCategories = Object.keys(categoryEffectiveness);
    const fallbackCategories = categories.filter(c => c !== 'effectiveness_patterns');
    
    // If we have effectiveness data, prefer better-performing categories
    if (weightedCategories.length > 0) {
      // Sort categories by effectiveness score
      weightedCategories.sort((a, b) => categoryEffectiveness[b] - categoryEffectiveness[a]);
      
      // Select templates biased toward effective categories
      for (let i = 0; i < 5; i++) {
        // Higher chance to pick from top categories, but keep some exploration
        const categoryIndex = Math.floor(Math.pow(Math.random(), 2) * weightedCategories.length);
        const category = weightedCategories[categoryIndex] || fallbackCategories[i % fallbackCategories.length];
        const categoryTemplates = QUERY_TEMPLATES[category];
        const template = categoryTemplates[Math.floor(Math.random() * categoryTemplates.length)];
        templates.push(template);
      }
    } else {
      // No effectiveness data yet, use a balanced approach but different from first iteration
      for (let i = 0; i < 5; i++) {
        const category = fallbackCategories[i % fallbackCategories.length];
        const categoryTemplates = QUERY_TEMPLATES[category];
        const template = categoryTemplates[Math.floor(Math.random() * categoryTemplates.length)];
        templates.push(template);
      }
    }
  }
  
  // Fill remaining slots if needed
  while (templates.length < 5) {
    const category = categories[Math.floor(Math.random() * (categories.length - 1))]; // Exclude effectiveness_patterns
    const categoryTemplates = QUERY_TEMPLATES[category];
    const template = categoryTemplates[Math.floor(Math.random() * categoryTemplates.length)];
    templates.push(template);
  }
  
  return templates;
}

// Get keywords typical of each category for matching
function getCategoryKeywords(category) {
  switch (category) {
    case 'factual':
      return ['statistics', 'data', 'measured', 'verified', 'documented', 'quantitative'];
    case 'analytical':
      return ['analysis', 'assessment', 'evaluation', 'methodology', 'framework', 'comparative'];
    case 'temporal':
      return ['timeline', 'developments', 'since', 'before', 'historical', 'projected'];
    case 'contextual':
      return ['relation', 'context', 'implications', 'considerations', 'framework', 'affecting'];
    case 'counterfactual':
      return ['potential', 'alternative', 'preventing', 'obstacles', 'contradictory', 'skeptical'];
    case 'source_specific':
      return ['according to', 'published by', 'reports from', 'journals', 'papers', 'studies'];
    default:
      return ['research', 'analysis', 'information', 'data', 'study'];
  }
}

// Learn from effective queries to create adaptations
function learnFromEffectiveQueries(previousQueries, queryEffectiveness) {
  const adaptations = [];
  
  if (!previousQueries || !queryEffectiveness) return adaptations;
  
  // Find the most effective queries
  const effectiveQueries = Object.entries(queryEffectiveness)
    .filter(([_, score]) => score > 7) // Only learn from highly effective queries
    .map(([query]) => query);
    
  if (effectiveQueries.length === 0) return adaptations;
  
  // Analyze patterns in effective queries
  effectiveQueries.forEach(query => {
    // Look for prefixes (first 2-3 words)
    const words = query.split(' ');
    if (words.length > 3) {
      const prefix = words.slice(0, 2).join(' ');
      adaptations.push({ prefix });
    }
    
    // Look for specific phrases that might be effective
    const phrases = [
      'according to', 'analysis of', 'research on', 'studies about',
      'evidence for', 'data regarding', 'expert opinion on'
    ];
    
    phrases.forEach(phrase => {
      if (query.includes(phrase)) {
        adaptations.push({ 
          target: '{focus}',
          replacement: `{focus} ${phrase}`
        });
      }
    });
    
    // Look for specific qualifiers at the end
    const endPatterns = [
      'with statistical evidence',
      'from primary sources',
      'with timeline analysis',
      'across multiple domains',
      'supported by research'
    ];
    
    endPatterns.forEach(pattern => {
      if (query.includes(pattern)) {
        adaptations.push({ suffix: pattern });
      }
    });
  });
  
  return adaptations;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { 
      query, 
      marketPrice, 
      marketQuestion, 
      focusText, 
      previousQueries = [],
      previousAnalyses = [],
      previousProbability,
      iteration = 1,
      areasForResearch = [],
      queryEffectiveness = {}
    } = await req.json()

    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured')
    }

    console.log('Generating sub-queries for:', query)
    console.log('Market question:', marketQuestion || 'not provided')
    console.log('Current market price:', marketPrice !== undefined ? marketPrice + '%' : 'not provided')
    console.log('Focus text:', focusText || 'not provided')
    console.log('Iteration:', iteration)
    console.log('Previous queries count:', previousQueries.length)
    console.log('Previous analyses count:', previousAnalyses.length)
    console.log('Areas for research:', areasForResearch)
    console.log('Query effectiveness data available:', Object.keys(queryEffectiveness).length > 0)
    
    // If we have suggested areas for research, use them to inform query generation
    let suggestedQueryContext = '';
    if (areasForResearch && areasForResearch.length > 0) {
      suggestedQueryContext = `
Prioritize these research areas that need further investigation:
${areasForResearch.map((area, i) => `${i+1}. ${area}`).join('\n')}

Generate queries that SPECIFICALLY target these research areas with precision and depth.
`;
    }
    
    // Create context from previous research if available
    let previousResearchContext = '';
    if (previousQueries.length > 0 || previousAnalyses.length > 0) {
      previousResearchContext = `
PREVIOUS RESEARCH CONTEXT:
${previousQueries.length > 0 ? `Previous search queries used:\n${previousQueries.slice(-15).map((q, i) => `${i+1}. ${q}`).join('\n')}` : ''}
${previousAnalyses.length > 0 ? `\nPrevious analysis summary:\n${previousAnalyses.slice(-1)[0].substring(0, 800)}${previousAnalyses.slice(-1)[0].length > 800 ? '...' : ''}` : ''}
${previousProbability ? `\nPrevious probability assessment: ${previousProbability}` : ''}

DO NOT REPEAT OR CLOSELY RESEMBLE any of the previous queries listed above. Generate entirely new search directions SPECIFICALLY focused on "${focusText || query}".`;
    }

    // Try to use enhanced templated queries, especially for later iterations
    const shouldUseTemplatedQueries = iteration > 1 || (areasForResearch && areasForResearch.length > 0);
    
    if (shouldUseTemplatedQueries) {
      try {
        console.log('Using enhanced templated query generation');
        
        const focus = focusText || query;
        
        // Set up template variables with the focus as the primary variable
        const templateVars = { ...EXPANDED_TEMPLATE_VARS };
        templateVars.focus = [focus];
        
        // Augment focus with areas for research
        if (areasForResearch && areasForResearch.length > 0) {
          areasForResearch.forEach(area => {
            templateVars.focus.push(`${focus} ${area}`);
            templateVars.focus.push(area);
          });
        }
        
        // Learn from effective queries
        const adaptations = learnFromEffectiveQueries(previousQueries, queryEffectiveness);
        console.log('Generated adaptations from effective queries:', adaptations.length);
        
        // Select templates appropriate for this iteration
        const templates = selectTemplatesForIteration(iteration, previousQueries, queryEffectiveness);
        
        // Generate queries from templates
        const templatedQueries = templates.map(template => 
          generateQueryFromTemplate(template, templateVars, iteration, adaptations)
        );
        
        // If we have areas for research, incorporate them directly
        if (areasForResearch && areasForResearch.length > 0) {
          // Replace some templated queries with direct research area queries
          const directAreaQueries = areasForResearch.slice(0, Math.min(3, areasForResearch.length)).map(area => 
            `${area} in context of ${focus} detailed analysis (iteration ${iteration})`
          );
          
          // Mix direct queries with templated ones
          const mixedQueries = [];
          for (let i = 0; i < 5; i++) {
            if (i < directAreaQueries.length) {
              mixedQueries.push(directAreaQueries[i]);
            } else {
              mixedQueries.push(templatedQueries[i - directAreaQueries.length]);
            }
          }
          
          return new Response(
            JSON.stringify({ queries: mixedQueries }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        return new Response(
          JSON.stringify({ queries: templatedQueries }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (templateError) {
        console.error('Error generating templated queries:', templateError);
        // Continue with API-based query generation
      }
    }
    
    // Build a more directive prompt for focused research
    const focusedPrompt = focusText ? 
      `You are a specialized research assistant focusing EXCLUSIVELY on: "${focusText}".
Your task is to generate highly specific search queries about ${focusText} that provide targeted information relevant to ${marketQuestion || query}.
IMPORTANT: Do not generate general queries. EVERY query MUST explicitly mention or relate to "${focusText}".
STRICT REQUIREMENT: Each query MUST contain "${focusText}" AND include additional specific qualifiers, angles, or dimensions.` 
      : 
      "You are a helpful assistant that generates search queries.";
    
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Research App',
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [
          {
            role: "system",
            content: focusedPrompt
          },
          {
            role: "user",
            content: `Generate 5 diverse search queries to gather highly specific information about: ${focusText || query}

${marketQuestion ? `Market Question: ${marketQuestion}` : `Topic: ${query}`}
${marketPrice !== undefined ? `Current Market Probability: ${marketPrice}%` : ''}
${focusText ? `YOUR SEARCH FOCUS MUST BE ON: ${focusText}` : ''}
${iteration > 1 ? `Current research iteration: ${iteration}` : ''}
${suggestedQueryContext}
${previousResearchContext}

${marketPrice !== undefined ? `Generate search queries to explore both supporting and contradicting evidence for this probability.` : ''}
${focusText ? `CRITICAL: EVERY query MUST specifically target information about: ${focusText}. Do not generate generic queries that fail to directly address this focus area.` : ''}

Generate 5 search queries that are:
1. Highly specific and detailed about "${focusText || query}"
2. Each query MUST include additional aspects beyond just the focus term itself
3. Diverse in approach and perspective
4. COMPLETELY DIFFERENT from previous research queries
5. Include specific entities, dates, or details to target precise information

EXAMPLE FORMAT for focused queries on "economic impact":
- "economic impact detailed statistical analysis on employment rates 2022-2023"
- "economic impact case studies in developing countries with quantitative measurements"
- "economic impact negative consequences on small businesses documented research"

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings. The format should be {"queries": ["query 1", "query 2", "query 3", "query 4", "query 5"]}`
          }
        ],
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const result = await response.json()
    const content = result.choices[0].message.content.trim()
    
    console.log('Raw LLM response:', content)
    
    try {
      let queriesData
      
      // First try parsing the content directly
      try {
        queriesData = JSON.parse(content)
      } catch (parseError) {
        console.log('Standard JSON parsing failed, attempting alternate parsing methods')
        
        // Try to extract JSON from markdown code blocks
        const jsonMatch = content.match(/```(?:json)?\s*({[\s\S]*?})\s*```/)
        if (jsonMatch && jsonMatch[1]) {
          try {
            queriesData = JSON.parse(jsonMatch[1])
            console.log('Successfully extracted JSON from markdown code block')
          } catch (error) {
            console.error('Error parsing extracted JSON from markdown:', error)
          }
        }
        
        // If still no valid JSON, attempt to construct it from the text
        if (!queriesData) {
          console.log('Attempting to construct JSON from text response')
          
          // Extract lines that look like queries
          const queryLines = content.match(/["']?(.*?)["']?(?:,|\n|$)/g)
          if (queryLines && queryLines.length > 0) {
            const cleanedQueries = queryLines
              .map(line => {
                // Extract the actual query text from the line
                const match = line.match(/["']?(.*?)["']?(?:,|\n|$)/)
                return match ? match[1].trim() : null
              })
              .filter(q => q && q.length > 5 && !q.includes('{') && !q.includes('}'))
              .slice(0, 5)
            
            if (cleanedQueries.length > 0) {
              queriesData = { queries: cleanedQueries }
              console.log('Constructed JSON from extracted query lines:', queriesData)
            }
          }
        }
        
        // Last resort: use fallback queries
        if (!queriesData || !queriesData.queries || !Array.isArray(queriesData.queries) || queriesData.queries.length === 0) {
          console.log('Using fallback queries')
          queriesData = {
            queries: [
              `${focusText || query} latest information`,
              `${focusText || query} analysis and trends`,
              `${focusText || query} expert opinions`,
              `${focusText || query} recent developments`,
              `${focusText || query} statistics and data`
            ]
          }
        }
      }
      
      // Ensure we have exactly 5 queries
      if (!queriesData.queries || !Array.isArray(queriesData.queries)) {
        queriesData.queries = [
          `${focusText || query} information`, 
          `${focusText || query} analysis`, 
          `${focusText || query} latest`, 
          `${focusText || query} data`, 
          `${focusText || query} news`
        ]
      } else if (queriesData.queries.length < 5) {
        // Fill remaining queries with focus-specific ones
        const generics = [
          `${focusText || query} latest developments`, 
          `${focusText || query} recent research`, 
          `${focusText || query} analysis methods`, 
          `${focusText || query} critical factors`, 
          `${focusText || query} expert assessment`
        ]
        
        for (let i = queriesData.queries.length; i < 5; i++) {
          queriesData.queries.push(generics[i % generics.length])
        }
      } else if (queriesData.queries.length > 5) {
        // Trim to 5 queries
        queriesData.queries = queriesData.queries.slice(0, 5)
      }
      
      // Validate each query and ensure they contain the focus area if specified
      queriesData.queries = queriesData.queries.map((q: any, i: number) => {
        if (typeof q !== 'string' || q.trim().length < 5) {
          return `${focusText || query} specific information ${i+1}`
        }
        
        // If we have a focus text, ensure it's included in the query
        if (focusText && !q.toLowerCase().includes(focusText.toLowerCase())) {
          return `${q} specifically regarding ${focusText}`
        }
        
        return q.trim()
      })
      
      // If we have previous queries, make sure we're not duplicating them
      if (previousQueries.length > 0) {
        const prevQuerySet = new Set(previousQueries.map(q => q.toLowerCase().trim()));
        
        // Replace any duplicate queries with alternatives
        queriesData.queries = queriesData.queries.map((q: string, i: number) => {
          if (prevQuerySet.has(q.toLowerCase().trim())) {
            console.log(`Query "${q}" is a duplicate of a previous query, replacing...`);
            
            // Generate alternative query
            const focusPrefix = focusText || query;
            const alternatives = [
              `${focusPrefix} latest developments iteration ${iteration}-${i}`,
              `${focusPrefix} recent analysis ${iteration}-${i}`,
              `${focusPrefix} expert perspective ${iteration}-${i}`,
              `${focusPrefix} market indicators ${iteration}-${i}`,
              `${focusPrefix} future outlook ${iteration}-${i}`
            ];
            
            return alternatives[i % alternatives.length];
          }
          return q;
        });
      }

      // Enhanced focused query generation for research areas
      if (focusText) {
        queriesData.queries = queriesData.queries.map((q: string, i: number) => {
          const lowercaseQ = q.toLowerCase();
          const lowercaseFocus = focusText.toLowerCase();
          
          // If query is too generic or just repeats the focus text
          if (q.length < 30 || q.toLowerCase() === focusText.toLowerCase() || 
              (q.toLowerCase().includes(focusText.toLowerCase()) && 
               q.replace(new RegExp(focusText, 'i'), '').trim().length < 10)) {
            
            // Generate more specific, contextual queries
            const specificAngles = [
              `${focusText} quantitative analysis with statistical trends since 2023`,
              `${focusText} critical expert assessments in peer-reviewed publications`,
              `${focusText} comparative case studies with measurable outcomes`,
              `${focusText} unexpected consequences documented in research papers`,
              `${focusText} methodological approaches for accurate assessment`
            ];
            
            // Choose alternative that doesn't exist in previous queries
            let alternative = specificAngles[i % specificAngles.length];
            if (prevQuerySet && prevQuerySet.has(alternative.toLowerCase().trim())) {
              alternative = `${focusText} specialized research angle ${iteration}-${i}: ${alternative.split(':')[1] || 'detailed analysis'}`;
            }
            
            return alternative;
          }
          
          // If query doesn't contain the focus text
          if (!lowercaseQ.includes(lowercaseFocus)) {
            return `${focusText} in context of: ${q}`;
          }
          
          return q;
        });
        
        // Final check for diversity - ensure queries aren't too similar to each other
        const queryWords = queriesData.queries.map((q: string) => 
          new Set(q.toLowerCase().split(/\s+/).filter(w => w.length > 3 && w !== focusText.toLowerCase()))
        );
        
        for (let i = 0; i < queriesData.queries.length; i++) {
          // Compare each query with others for similarity
          for (let j = i + 1; j < queriesData.queries.length; j++) {
            const similarity = [...queryWords[i]].filter(word => queryWords[j].has(word)).length;
            const uniqueWordsThreshold = Math.max(queryWords[i].size, queryWords[j].size) * 0.5;
            
            // If too similar, replace the second query
            if (similarity > uniqueWordsThreshold) {
              const replacementTemplates = [
                `${focusText} alternative perspectives from ${['economic', 'political', 'social', 'technological', 'environmental'][j % 5]} analysis`,
                `${focusText} contrasting viewpoints based on ${['historical', 'current', 'theoretical', 'practical', 'futuristic'][j % 5]} evidence`,
                `${focusText} ${['challenges', 'opportunities', 'misconceptions', 'breakthroughs', 'failures'][j % 5]} documented in recent studies`
              ];
              
              queriesData.queries[j] = replacementTemplates[j % replacementTemplates.length];
            }
          }
        }
      }
      
      console.log('Generated queries:', queriesData.queries)

      return new Response(
        JSON.stringify({ queries: queriesData.queries }),
        { 
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json'
          } 
        }
      )
    } catch (parseError) {
      console.error('Error handling LLM response:', parseError)
      console.log('Raw content:', content)
      
      // Provide fallback queries instead of failing
      const fallbackQueries = focusText ? [
        `${focusText} latest information related to ${query}`,
        `${focusText} analysis and trends for ${query}`,
        `${focusText} expert opinions about ${query}`,
        `${focusText} recent developments impacting ${query}`,
        `${focusText} statistics and data regarding ${query}`
      ] : [
        `${query} latest information`,
        `${query} analysis and trends`,
        `${query} expert opinions`,
        `${query} recent developments`,
        `${query} statistics and data`
      ];
      
      return new Response(
        JSON.stringify({ queries: fallbackQueries }),
        { 
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json'
          } 
        }
      )
    }

  } catch (error) {
    console.error('Error generating queries:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        queries: [
          "fallback query 1",
          "fallback query 2",
          "fallback query 3", 
          "fallback query 4",
          "fallback query 5"
        ] 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  }
})
