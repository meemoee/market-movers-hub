
  const loadJobData = (job: ResearchJob) => {
    setJobId(job.id);
    setJobStatus(job.status);
    
    if (job.max_iterations && job.current_iteration !== undefined) {
      const percent = Math.round((job.current_iteration / job.max_iterations) * 100);
      setProgressPercent(percent);
      
      if (job.status === 'completed') {
        setProgressPercent(100);
      }
    }
    
    if (job.progress_log && Array.isArray(job.progress_log)) {
      setProgress(job.progress_log);
    }
    
    if (job.status === 'queued' || job.status === 'processing') {
      subscribeToJobUpdates(job.id);
    }
    
    if (job.iterations && Array.isArray(job.iterations)) {
      setIterations(job.iterations);
      
      if (job.iterations.length > 0) {
        setExpandedIterations([job.iterations.length]);
      }
    }
    
    if (job.status === 'completed' && job.results) {
      try {
        // Handle both string and object results
        let parsedResults;
        if (typeof job.results === 'string') {
          try {
            parsedResults = JSON.parse(job.results);
          } catch (parseError) {
            console.error('Error parsing job.results string in loadJobData:', parseError);
            throw new Error('Invalid results format (string parsing failed)');
          }
        } else if (typeof job.results === 'object') {
          parsedResults = job.results;
        } else {
          throw new Error(`Unexpected results type: ${typeof job.results}`);
        }
        
        if (parsedResults.data && Array.isArray(parsedResults.data)) {
          setResults(parsedResults.data);
        }
        if (parsedResults.analysis) {
          setAnalysis(parsedResults.analysis);
        }
        if (parsedResults.structuredInsights) {
          console.log('Found structuredInsights in loadJobData:', parsedResults.structuredInsights);
          
          const goodBuyOpportunities = parsedResults.structuredInsights.probability ? 
            calculateGoodBuyOpportunities(parsedResults.structuredInsights.probability) : 
            null;
          
          // Update: No longer wrap in streaming state structure
          setStructuredInsights({
            ...parsedResults.structuredInsights,
            goodBuyOpportunities
          });
        }
      } catch (e) {
        console.error('Error processing loaded job results:', e);
      }
    }
    
    if (job.status === 'failed') {
      setError(`Job failed: ${job.error_message || 'Unknown error'}`);
    }

    if (job.focus_text) {
      setFocusText(job.focus_text);
    }
  }
