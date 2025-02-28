
// Define the structure for research report
export interface ResearchReport {
  title: string;
  executiveSummary: string;
  keyFindings: string[];
  analysis: string;
  conclusion: string;
}

// Function to handle streaming research updates
export async function runDeepResearch(
  description: string,
  marketId: string,
  onUpdate: (step: number, query: string, results: string, total: number) => Promise<void>
): Promise<{ report: ResearchReport; steps: { query: string; results: string }[] }> {
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY environment variable not set');
  }

  const model = "anthropic/claude-3-haiku-20240307";
  const steps: { query: string; results: string }[] = [];
  
  try {
    // First generate the research queries based on description
    console.log("Generating research queries for:", description);
    const queriesPrompt = `
You are a market research expert generating targeted research queries for the topic below. 
Generate 5 specific, diverse search queries that would help thoroughly research this topic.
Make sure the queries are specific and information-seeking, not just restatements of the topic.

TOPIC: ${description}

Output the queries in plain text format, one per line.
`;

    const queriesResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hunchex.com",
        "X-Title": "HunchEx Research Assistant"
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "user", content: queriesPrompt }
        ]
      })
    });

    if (!queriesResponse.ok) {
      const errorText = await queriesResponse.text();
      console.error('Error response from OpenRouter queries:', errorText);
      throw new Error(`Failed to generate research queries: ${queriesResponse.status} ${queriesResponse.statusText}`);
    }

    const queriesData = await queriesResponse.json();
    const queriesContent = queriesData.choices[0]?.message?.content;
    if (!queriesContent) {
      throw new Error('No content returned for research queries');
    }

    // Extract queries (one per line)
    const researchQueries = queriesContent.split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .map((line: string) => line.replace(/^\d+\.\s*/, ''))  // Remove numbering if present
      .slice(0, 5);  // Take at most 5 queries
    
    console.log(`Generated ${researchQueries.length} research queries`);
    
    // Track all research results
    let allResearchResults = '';
    
    // For each query, simulate a research step
    for (let i = 0; i < researchQueries.length; i++) {
      const query = researchQueries[i];
      console.log(`Executing research query ${i + 1}/${researchQueries.length}: ${query}`);
      
      // Generate research results for this query
      const researchPrompt = `
You are a research assistant responding to the following query related to this market topic:
MARKET TOPIC: ${description}
SEARCH QUERY: ${query}

Provide relevant, factual information about this topic based on general knowledge. 
Focus on information that would be useful for market analysis and prediction.
Be thorough but concise.
`;

      const researchResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://hunchex.com",
          "X-Title": "HunchEx Research Assistant"
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "user", content: researchPrompt }
          ]
        })
      });

      if (!researchResponse.ok) {
        const errorText = await researchResponse.text();
        console.error('Error response from OpenRouter research:', errorText);
        throw new Error(`Failed to execute research query: ${researchResponse.status} ${researchResponse.statusText}`);
      }

      const researchData = await researchResponse.json();
      const researchResults = researchData.choices[0]?.message?.content;
      if (!researchResults) {
        throw new Error('No research results returned');
      }
      
      // Append to all research results
      allResearchResults += `\n\nQUERY: ${query}\nRESULTS: ${researchResults}`;
      
      // Add to steps array and send update
      steps.push({ query, results: researchResults });
      await onUpdate(i + 1, query, researchResults, researchQueries.length);
    }
    
    // Now, generate a comprehensive research report based on all findings
    console.log("Generating final research report");
    const reportPrompt = `
You are a market analysis expert preparing a formal research report based on the following research findings.
The research relates to this market topic: "${description}"

Here are the research findings from multiple queries:
${allResearchResults}

Create a comprehensive and structured research report with the following sections:
1. A title for the research report
2. Executive Summary
3. Key Findings (as bullet points)
4. Analysis
5. Conclusion

Focus on insights relevant to making predictions about this market.
Format your output as a structured JSON object with the following schema:
{
  "title": "title of the report",
  "executiveSummary": "concise summary of the report",
  "keyFindings": ["finding 1", "finding 2", "finding 3", ...],
  "analysis": "detailed analysis text",
  "conclusion": "conclusion text"
}
`;

    const reportResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hunchex.com",
        "X-Title": "HunchEx Research Assistant"
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "user", content: reportPrompt }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!reportResponse.ok) {
      const errorText = await reportResponse.text();
      console.error('Error response from OpenRouter report:', errorText);
      throw new Error(`Failed to generate research report: ${reportResponse.status} ${reportResponse.statusText}`);
    }

    const reportData = await reportResponse.json();
    const reportContent = reportData.choices[0]?.message?.content;
    
    if (!reportContent) {
      throw new Error('No content returned for research report');
    }
    
    // Parse the JSON string into an object
    const report = JSON.parse(reportContent) as ResearchReport;
    
    // Return both the report and steps
    return { report, steps };
  } catch (error) {
    console.error('Error in runDeepResearch:', error);
    throw error;
  }
}
