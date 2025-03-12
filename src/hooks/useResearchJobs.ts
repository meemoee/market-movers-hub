
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from "@/integrations/supabase/client"

interface ResearchJob {
  id: string
  user_id: string
  market_id: string | null
  query: string
  focus_text: string | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  max_iterations: number
  current_iteration: number
  iterations: any[]
  results: any[]
  analysis: string | null
  probability: string | null
  areas_for_research: string[]
  parent_job_id: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
  progress_log: string[]
}

export function useResearchJobs(marketId?: string) {
  const queryClient = useQueryClient()

  const getResearchJobs = async (): Promise<ResearchJob[]> => {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) throw new Error('Not authenticated')

    let query = supabase
      .from('research_jobs')
      .select('*')
      .eq('user_id', user.user.id)
      .order('created_at', { ascending: false })

    if (marketId) {
      query = query.eq('market_id', marketId)
    }

    const { data, error } = await query
    if (error) throw error
    return data as ResearchJob[]
  }

  const getResearchJob = async (jobId: string): Promise<ResearchJob> => {
    const { data, error } = await supabase
      .from('research_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (error) throw error
    return data as ResearchJob
  }

  const createResearchJob = async ({
    query,
    marketId,
    focusText,
    maxIterations = 3,
    parentJobId = null
  }: {
    query: string
    marketId?: string
    focusText?: string
    maxIterations?: number
    parentJobId?: string | null
  }): Promise<ResearchJob> => {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('research_jobs')
      .insert({
        user_id: user.user.id,
        market_id: marketId,
        query,
        focus_text: focusText,
        max_iterations: maxIterations,
        parent_job_id: parentJobId
      })
      .select()
      .single()

    if (error) throw error

    const { error: processError } = await supabase.functions.invoke('process-research-job', {
      body: { jobId: data.id }
    })

    if (processError) {
      throw new Error(`Failed to start research job: ${processError.message}`)
    }

    return data as ResearchJob
  }

  const cancelResearchJob = async (jobId: string): Promise<void> => {
    const { error } = await supabase
      .from('research_jobs')
      .update({
        status: 'failed',
        error_message: 'Cancelled by user',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)

    if (error) throw error
  }

  const { data: jobs, isLoading: isLoadingJobs, error: jobsError, refetch: refetchJobs } = useQuery({
    queryKey: ['research-jobs', marketId],
    queryFn: getResearchJobs,
    refetchInterval: 5000
  })

  const { mutateAsync: createJob, isPending: isCreatingJob } = useMutation({
    mutationFn: createResearchJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-jobs'] })
    }
  })

  const { mutateAsync: cancelJob, isPending: isCancellingJob } = useMutation({
    mutationFn: cancelResearchJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-jobs'] })
    }
  })

  return {
    jobs,
    isLoadingJobs,
    jobsError,
    refetchJobs,
    createJob,
    isCreatingJob,
    cancelJob,
    isCancellingJob,
    getResearchJob
  }
}

export function useResearchJob(jobId: string | undefined) {
  const queryClient = useQueryClient()

  const { data: job, isLoading, error, refetch } = useQuery({
    queryKey: ['research-job', jobId],
    queryFn: async () => {
      if (!jobId) throw new Error('Job ID is required')
      const { data, error } = await supabase
        .from('research_jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      if (error) throw error
      return data as ResearchJob
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      // Get the data from the query
      const data = query.state.data as ResearchJob | undefined
      if (!data) return 5000
      return ['completed', 'failed'].includes(data.status) ? false : 3000
    }
  })

  const { mutateAsync: cancelJob, isPending: isCancelling } = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('research_jobs')
        .update({
          status: 'failed',
          error_message: 'Cancelled by user',
          completed_at: new Date().toISOString()
        })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-job', jobId] })
    }
  })

  return {
    job,
    isLoading,
    error,
    refetch,
    cancelJob,
    isCancelling
  }
}
