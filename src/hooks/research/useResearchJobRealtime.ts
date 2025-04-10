import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ResearchJob } from '@/types/research';
import { RealtimeChannel, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';

/**
 * Props for the useResearchJobRealtime hook.
 */
interface UseResearchJobRealtimeProps {
  jobId: string | null; // The ID of the job to subscribe to, or null to unsubscribe
  onUpdate: (updatedJob: ResearchJob) => void; // Callback function when an update is received
  onError?: (error: any) => void; // Optional callback for subscription errors
  onStatusChange?: (status: string, error?: Error) => void; // Optional callback for status changes
}

/**
 * Manages a Supabase Realtime subscription for updates to a specific research job.
 * @param jobId - The ID of the research job to subscribe to. Pass null to disable subscription.
 * @param onUpdate - Callback function triggered with the updated job data when a change occurs.
 * @param onError - Optional callback for handling subscription errors.
 * @param onStatusChange - Optional callback for handling subscription status changes.
 */
export function useResearchJobRealtime({
  jobId,
  onUpdate,
  onError,
  onStatusChange
}: UseResearchJobRealtimeProps) {
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const onUpdateRef = useRef(onUpdate); // Use ref to keep callback up-to-date without triggering effect

  // Update the ref whenever the onUpdate callback changes
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    // If no jobId is provided, ensure any existing channel is removed and do nothing else.
    if (!jobId) {
      if (realtimeChannelRef.current) {
        console.log(`[useResearchJobRealtime] No jobId provided, removing existing channel: ${realtimeChannelRef.current.topic}`);
        supabase.removeChannel(realtimeChannelRef.current)
          .then(() => console.log(`[useResearchJobRealtime] Successfully removed channel: ${realtimeChannelRef.current?.topic}`))
          .catch(err => console.error(`[useResearchJobRealtime] Error removing channel: ${realtimeChannelRef.current?.topic}`, err))
          .finally(() => {
            realtimeChannelRef.current = null;
          });
      }
      return;
    }

    // If a channel for a different job exists, remove it first.
    if (realtimeChannelRef.current && realtimeChannelRef.current.topic !== `job-updates-${jobId}`) {
       console.log(`[useResearchJobRealtime] JobId changed, removing previous channel: ${realtimeChannelRef.current.topic}`);
       supabase.removeChannel(realtimeChannelRef.current)
         .then(() => console.log(`[useResearchJobRealtime] Successfully removed previous channel: ${realtimeChannelRef.current?.topic}`))
         .catch(err => console.error(`[useResearchJobRealtime] Error removing previous channel: ${realtimeChannelRef.current?.topic}`, err))
         .finally(() => {
           realtimeChannelRef.current = null;
           // Proceed to create new channel below
         });
    }

    // If a channel for the current jobId already exists, do nothing.
    if (realtimeChannelRef.current && realtimeChannelRef.current.topic === `job-updates-${jobId}`) {
      console.log(`[useResearchJobRealtime] Subscription already active for job: ${jobId}`);
      return;
    }

    // Create and subscribe to the new channel.
    console.log(`[useResearchJobRealtime] Setting up realtime subscription for job id: ${jobId}`);
    const channel = supabase
      .channel(`job-updates-${jobId}`)
      .on<ResearchJob>( // Specify the payload type using the generic
        'postgres_changes',
        {
          event: 'UPDATE', // Only listen for updates
          schema: 'public',
          table: 'research_jobs',
          filter: `id=eq.${jobId}`
        },
        (payload) => {
          console.log('[useResearchJobRealtime] Received realtime update:', payload);
          // Use the ref to call the latest onUpdate callback
          if (payload.new) {
             // Explicitly cast payload.new, assuming it matches ResearchJob structure
             onUpdateRef.current(payload.new as unknown as ResearchJob);
          } else {
             console.warn('[useResearchJobRealtime] Received update payload without new data:', payload);
          }
        }
      )
      .subscribe((status, err) => {
        console.log(`[useResearchJobRealtime] Realtime subscription status: ${status} for job: ${jobId}`, err || '');
        if (onStatusChange) {
          onStatusChange(status, err);
        }
        // Use the enum member for comparison - trying CLOSED as error state
        if (status === REALTIME_SUBSCRIBE_STATES.CLOSED && onError && err) {
          console.error(`[useResearchJobRealtime] Subscription closed potentially due to error for job ${jobId}:`, err);
          onError(err); // Report the error if the channel closed unexpectedly with an error object
        } else if (status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT && onError) {
          // Also handle timeout specifically if needed
          const timeoutError = new Error('Subscription timed out');
          console.error(`[useResearchJobRealtime] Subscription timed out for job ${jobId}`);
          onError(timeoutError);
        }
        // Optional: Handle channel closure or other statuses if needed
      });

    realtimeChannelRef.current = channel;

    // Cleanup function: remove the channel when the component unmounts or jobId changes.
    return () => {
      if (realtimeChannelRef.current) {
        console.log(`[useResearchJobRealtime] Cleaning up channel: ${realtimeChannelRef.current.topic}`);
        supabase.removeChannel(realtimeChannelRef.current)
          .then(() => console.log(`[useResearchJobRealtime] Successfully removed channel on cleanup: ${realtimeChannelRef.current?.topic}`))
          .catch(err => console.error(`[useResearchJobRealtime] Error removing channel on cleanup: ${realtimeChannelRef.current?.topic}`, err))
          .finally(() => {
            realtimeChannelRef.current = null;
          });
      }
    };
  }, [jobId, onError, onStatusChange]); // Re-run effect if jobId changes

  // No return value needed as this hook manages a side effect (subscription)
}
