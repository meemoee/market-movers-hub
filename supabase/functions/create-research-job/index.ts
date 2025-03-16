
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0"
import { v4 as uuidv4 } from "https://esm.sh/uuid@9.0.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Creates a new research job record
async function createResearchJob(supabase, jobData) {
  try {
    const { data, error } = await supabase
      .from('research_jobs')
      .insert({
        id: jobData.id,
        market_id: jobData.marketId,
        query: jobData.query,
        status: 'queued',
        max_iterations: jobData.maxIterations || 3,
        current_iteration: 0,
        progress_log: [],
        iterations: [],
        focus_text: jobData.focusText,
        notification_email: jobData.notificationEmail
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating research job:', error);
      throw error;
    }
    
    console.log('Created research job:', data);
    return data;
  } catch (error) {
    console.error('Error in createResearchJob:', error);
    throw error;
  }
}

// Start background research job processing
async function performWebResearch(supabase, jobId) {
  try {
    console.log(`Starting web research for job: ${jobId}`);

    // First update the status to processing
    const { error: updateError } = await supabase.rpc('update_research_job_status', {
      job_id: jobId,
      new_status: 'processing'
    });

    if (updateError) {
      console.error('Error updating job status:', updateError);
      throw updateError;
    }

    // Append initial progress message
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: 'Starting research process...'
    });

    // Fetch job details to get the query
    const { data: jobData, error: jobError } = await supabase
      .from('research_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError) {
      console.error('Error fetching job details:', jobError);
      await supabase.rpc('update_research_job_status', {
        job_id: jobId,
        new_status: 'failed',
        error_msg: `Failed to fetch job details: ${jobError.message}`
      });
      return;
    }

    // Now process multiple iterations in sequence
    try {
      // Get market data for context
      const { data: marketData, error: marketError } = await supabase
        .from('markets')
        .select('question, description')
        .eq('id', jobData.market_id)
        .single();

      if (marketError) {
        console.error('Error fetching market data:', marketError);
        // Continue anyway - we'll use the job query
      }

      // Append progress
      await supabase.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: 'Planning research iterations...'
      });

      const marketContext = marketData 
        ? `Market Question: ${marketData.question}\nMarket Description: ${marketData.description || 'No description available'}`
        : '';
        
      const focusText = jobData.focus_text 
        ? `Research Focus: ${jobData.focus_text}` 
        : '';

      // Start multi-iteration research
      const maxIterations = jobData.max_iterations || 3;
      const baseQuery = jobData.query;
      let allResults = [];
      let analysisText = "";
      let structuredInsights = null;

      for (let i = 1; i <= maxIterations; i++) {
        // Update current iteration in DB
        await supabase
          .from('research_jobs')
          .update({ current_iteration: i })
          .eq('id', jobId);

        // Build iteration context
        let iterationContext = '';
        if (i > 1 && allResults.length > 0) {
          iterationContext = `Previous research found:\n${allResults.map(r => r.title || r.url).join('\n')}`;
        }

        // Start iteration
        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: `Starting iteration ${i} of ${maxIterations}...`
        });

        // Generate search queries - FIXING THIS PART TO MATCH THE EXPECTED INTERFACE
        console.log('Preparing to generate search queries for iteration', i);
        
        const previousQueries = jobData.iterations
          ? jobData.iterations
              .filter(it => it.query)
              .map(it => it.query)
          : [];
          
        const generateQueriesPayload = {
          query: baseQuery,
          marketId: jobData.market_id,
          iteration: i,
          previousQueries: previousQueries,
          focusText: jobData.focus_text || ''
        };
        
        console.log('Sending payload to generate-queries:', JSON.stringify(generateQueriesPayload));

        const { data: queryResponse, error: queryError } = await supabase.functions.invoke('generate-queries', {
          body: generateQueriesPayload
        });

        if (queryError) {
          console.error('Error invoking generate-queries function:', queryError);
          await supabase.rpc('append_research_progress', {
            job_id: jobId,
            progress_entry: `Error generating search queries: ${queryError.message}`
          });
          throw new Error(`Query generation failed: ${queryError.message}`);
        }
        
        if (!queryResponse || !queryResponse.queries || !Array.isArray(queryResponse.queries)) {
          console.error('Invalid response from generate-queries:', queryResponse);
          await supabase.rpc('append_research_progress', {
            job_id: jobId,
            progress_entry: `Invalid response from query generator`
          });
          throw new Error(`Query generation returned invalid format: ${JSON.stringify(queryResponse)}`);
        }

        const selectedQuery = queryResponse.queries[0] || baseQuery;
        console.log('Generated query:', selectedQuery);

        // Record iteration start
        const iterationData = {
          iteration: i,
          query: selectedQuery,
          focus: jobData.focus_text || '',
          reasoning: queryResponse.reasoning || 'Generated to search for relevant information',
          results: [],
          analysis: '',
          started_at: new Date().toISOString()
        };

        await supabase.rpc('append_research_iteration', {
          job_id: jobId,
          iteration_data: iterationData
        });

        // Perform search
        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: `Searching for: ${selectedQuery}`
        });

        // Updated to use web-scrape instead of web-research
        const { data: searchResults, error: searchError } = await supabase.functions.invoke('web-scrape', {
          body: { query: selectedQuery }
        });

        if (searchError) {
          console.error('Error in web search:', searchError);
          await supabase.rpc('append_research_progress', {
            job_id: jobId,
            progress_entry: `Error in web search: ${searchError.message}`
          });
          throw new Error(`Search failed: ${searchError.message}`);
        }

        const validResults = searchResults.filter(r => r.content && r.content.trim() !== '');

        // Update iteration with results
        const iterationWithResults = {
          ...iterationData,
          results: validResults.map(r => ({ 
            url: r.url, 
            title: r.title || r.url 
          }))
        };

        await supabase
          .from('research_jobs')
          .update({
            iterations: supabase.sql`array_append(iterations, ${iterationWithResults}::jsonb)`
          })
          .eq('id', jobId);

        // Analyze results
        if (validResults.length === 0) {
          await supabase.rpc('append_research_progress', {
            job_id: jobId,
            progress_entry: `No valid results found for iteration ${i}`
          });

          // Update iteration with empty analysis
          const completedIteration = {
            ...iterationWithResults,
            analysis: "No valid content was found for analysis.",
            completed_at: new Date().toISOString()
          };

          // Update iterations array - first get current iterations
          const { data: currentJob } = await supabase
            .from('research_jobs')
            .select('iterations')
            .eq('id', jobId)
            .single();

          if (currentJob) {
            const currentIterations = currentJob.iterations || [];
            const updatedIterations = [
              ...currentIterations.slice(0, i-1),
              completedIteration,
              ...currentIterations.slice(i)
            ];

            await supabase
              .from('research_jobs')
              .update({ iterations: updatedIterations })
              .eq('id', jobId);
          }
          
          continue;
        }

        // Content analysis
        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: `Analyzing ${validResults.length} web sources...`
        });

        // Analyze in batches if there are many results
        const batchSize = 3;
        const batches = [];
        for (let j = 0; j < validResults.length; j += batchSize) {
          batches.push(validResults.slice(j, j + batchSize));
        }

        let iterationAnalysis = '';
        for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
          const batch = batches[batchIdx];
          await supabase.rpc('append_research_progress', {
            job_id: jobId,
            progress_entry: `Analyzing batch ${batchIdx + 1} of ${batches.length}...`
          });

          try {
            const { data: analysisResponse, error: analysisError } = await supabase.functions.invoke('analyze-web-content', {
              body: {
                sources: batch,
                marketQuestion: marketData?.question || baseQuery,
                focusText: jobData.focus_text || '',
                previousFindings: allResults.map(r => r.title || r.url).join('\n'),
                iteration: i,
                maxIterations
              }
            });

            if (analysisError) {
              console.error('Analysis error:', analysisError);
              await supabase.rpc('append_research_progress', {
                job_id: jobId,
                progress_entry: `Error in batch ${batchIdx + 1} analysis: ${analysisError.message}`
              });
              continue;
            }

            iterationAnalysis += analysisResponse.analysis + '\n\n';
          } catch (error) {
            console.error('Error in batch analysis:', error);
            await supabase.rpc('append_research_progress', {
              job_id: jobId,
              progress_entry: `Error analyzing batch ${batchIdx + 1}: ${error.message}`
            });
          }
        }

        // Update iteration with analysis
        const completedIteration = {
          ...iterationWithResults,
          analysis: iterationAnalysis,
          completed_at: new Date().toISOString()
        };

        // Update iterations array - first get current iterations
        const { data: currentJob } = await supabase
          .from('research_jobs')
          .select('iterations')
          .eq('id', jobId)
          .single();

        if (currentJob) {
          const currentIterations = currentJob.iterations || [];
          const updatedIterations = [
            ...currentIterations.slice(0, i-1),
            completedIteration,
            ...currentIterations.slice(i)
          ];

          await supabase
            .from('research_jobs')
            .update({ iterations: updatedIterations })
            .eq('id', jobId);
        }

        // Add to all results
        allResults = [...allResults, ...validResults];

        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: `Completed iteration ${i} of ${maxIterations}`
        });
      }

      // Final analysis
      if (allResults.length > 0) {
        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: 'Preparing final analysis...'
        });

        try {
          // Extract final insights
          const { data: insightsResponse, error: insightsError } = await supabase.functions.invoke('extract-research-insights', {
            body: {
              marketQuestion: marketData?.question || baseQuery,
              marketDescription: marketData?.description || '',
              focusText: jobData.focus_text || '',
              iterations: jobData.iterations || []
            }
          });

          if (insightsError) {
            console.error('Final insights error:', insightsError);
            await supabase.rpc('append_research_progress', {
              job_id: jobId,
              progress_entry: `Error extracting final insights: ${insightsError.message}`
            });
          } else {
            structuredInsights = insightsResponse;
            analysisText = insightsResponse.analysis || '';
            
            await supabase.rpc('append_research_progress', {
              job_id: jobId,
              progress_entry: 'Final insights extracted successfully'
            });
          }
        } catch (error) {
          console.error('Error in final insights:', error);
          await supabase.rpc('append_research_progress', {
            job_id: jobId,
            progress_entry: `Error analyzing results: ${error.message}`
          });
        }
      }

      // Complete the job
      const finalResults = {
        data: allResults.map(r => ({
          url: r.url,
          title: r.title || r.url,
          content: r.content
        })),
        analysis: analysisText,
        structuredInsights: structuredInsights
      };

      await supabase.rpc('update_research_results', {
        job_id: jobId,
        result_data: finalResults
      });

      await supabase.rpc('update_research_job_status', {
        job_id: jobId,
        new_status: 'completed'
      });

      await supabase.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: 'Research job completed successfully!'
      });
      
      // Check if notification email is set and send notification
      const { data: updatedJob } = await supabase
        .from('research_jobs')
        .select('notification_email')
        .eq('id', jobId)
        .single();
        
      if (updatedJob?.notification_email) {
        try {
          console.log(`Sending notification to ${updatedJob.notification_email}`);
          await supabase.functions.invoke('send-research-notification', {
            body: JSON.stringify({
              jobId,
              email: updatedJob.notification_email
            })
          });
        } catch (notifyError) {
          console.error('Failed to send notification:', notifyError);
        }
      }

    } catch (error) {
      console.error('Error in research process:', error);
      await supabase.rpc('update_research_job_status', {
        job_id: jobId,
        new_status: 'failed',
        error_msg: error.message
      });
      
      // Try to send failure notification if email is set
      try {
        const { data: failedJob } = await supabase
          .from('research_jobs')
          .select('notification_email')
          .eq('id', jobId)
          .single();
          
        if (failedJob?.notification_email) {
          console.log(`Sending failure notification to ${failedJob.notification_email}`);
          await supabase.functions.invoke('send-research-notification', {
            body: JSON.stringify({
              jobId,
              email: failedJob.notification_email
            })
          });
        }
      } catch (notifyError) {
        console.error('Failed to send failure notification:', notifyError);
      }
    }
  } catch (error) {
    console.error('Error in performWebResearch:', error);
    try {
      await supabase.rpc('update_research_job_status', {
        job_id: jobId,
        new_status: 'failed',
        error_msg: error.message
      });
    } catch (updateError) {
      console.error('Failed to update job status after error:', updateError);
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { marketId, query, maxIterations = 3, focusText, notificationEmail } = await req.json();

    if (!marketId || !query) {
      return new Response(
        JSON.stringify({ error: 'Market ID and query are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Create a new job record
    const jobId = uuidv4();
    const jobData = {
      id: jobId,
      marketId,
      query,
      maxIterations: maxIterations,
      focusText,
      notificationEmail
    };

    await createResearchJob(supabaseClient, jobData);

    // Start background processing
    EdgeRuntime.waitUntil(performWebResearch(supabaseClient, jobId));

    // Return response immediately
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Research job created and processing started',
        jobId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error handling request:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
