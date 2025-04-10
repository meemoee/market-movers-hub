import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from "@/components/ui/use-toast"; // Using shadcn toast

/**
 * Props for the useResearchJobForm hook.
 */
interface UseResearchJobFormProps {
  marketId: string;
  description: string; // Used as the initial query
  onJobCreated: (jobId: string) => void; // Callback when a job is successfully created
}

/**
 * Manages the state and submission logic for the research job creation form.
 * @param marketId - The ID of the market for the research.
 * @param description - The market description, used as the base query.
 * @param onJobCreated - Callback function triggered with the new job ID upon successful creation.
 * @returns An object containing form state, state setters, and the submission handler.
 */
export function useResearchJobForm({ marketId, description, onJobCreated }: UseResearchJobFormProps) {
  const [focusText, setFocusText] = useState<string>('');
  const [maxIterations, setMaxIterations] = useState<string>("3"); // Default to 3 iterations
  const [notifyByEmail, setNotifyByEmail] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const submitResearchJob = async (optionalFocusText?: string) => {
    setIsLoading(true);
    setError(null);

    const useFocusText = optionalFocusText || focusText;
    const numIterations = parseInt(maxIterations, 10);

    // Basic validation
    if (notifyByEmail && !notificationEmail.trim()) {
      const errorMsg = "Please enter an email address for notifications.";
      setError(errorMsg);
      toast({
        title: "Error Starting Research",
        description: errorMsg,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      console.log(`[useResearchJobForm] Starting research job creation for market: ${marketId}`);
      const payload = {
        marketId,
        query: description, // Use market description as the base query
        maxIterations: numIterations,
        focusText: useFocusText.trim() || undefined, // Send undefined if empty
        notificationEmail: notifyByEmail && notificationEmail.trim() ? notificationEmail.trim() : undefined,
      };

      console.log('[useResearchJobForm] Creating research job with payload:', payload);

      const startTime = performance.now();
      const response = await supabase.functions.invoke('create-research-job', {
        body: JSON.stringify(payload),
      });
      const duration = performance.now() - startTime;
      console.log(`[useResearchJobForm] Job creation response received in ${duration.toFixed(0)}ms`);

      if (response.error) {
        console.error("[useResearchJobForm] Error creating research job:", response.error);
        throw new Error(`Error creating research job: ${response.error.message}`);
      }

      if (!response.data || !response.data.jobId) {
        console.error("[useResearchJobForm] Invalid response from server - no job ID returned", response.data);
        throw new Error("Invalid response from server - no job ID returned");
      }

      const newJobId = response.data.jobId;
      console.log(`[useResearchJobForm] Research job created successfully with ID: ${newJobId}`);

      const toastMessage = notifyByEmail && notificationEmail.trim()
        ? `Job ID: ${newJobId}. Email notification will be sent to ${notificationEmail} when complete.`
        : `Job ID: ${newJobId}. You can close this window and check back later.`;

      toast({
        title: "Background Research Started",
        description: toastMessage,
      });

      // Trigger the callback with the new job ID
      onJobCreated(newJobId);

      // Optionally reset form fields after successful submission
      // setFocusText('');
      // setNotifyByEmail(false);
      // setNotificationEmail('');
      // setMaxIterations("3");

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[useResearchJobForm] Error submitting research job:', err);
      setError(`Error occurred: ${errorMsg}`);
      toast({
        title: "Error Starting Research",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    focusText,
    setFocusText,
    maxIterations,
    setMaxIterations,
    notifyByEmail,
    setNotifyByEmail,
    notificationEmail,
    setNotificationEmail,
    isLoading,
    error,
    submitResearchJob, // The function to call when the form is submitted
  };
}
