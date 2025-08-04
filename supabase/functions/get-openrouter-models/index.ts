import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

/**
 * OpenRouter API client for Deno
 */
class OpenRouter {
  private apiKey: string;
  private baseUrl = "https://openrouter.ai/api/v1";
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  /**
   * Get available models from OpenRouter
   * @param filterSupportedParams Optional array of parameters to filter models by support
   * @returns List of available models
   */
  async getModels(filterSupportedParams: string[] = []) {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key is required");
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://hunchex.app'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }
      
      const modelData = await response.json();
      
      // If we have filter parameters, only return models that support all specified parameters
      if (filterSupportedParams.length > 0) {
        modelData.data = modelData.data.filter(model => {
          if (!model.supported_parameters) return false;
          
          return filterSupportedParams.every(param => 
            model.supported_parameters.includes(param)
          );
        });
      }
      
      return modelData;
    } catch (error) {
      console.error(`OpenRouter API models request failed: ${error.message}`);
      throw error;
    }
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { userId } = await req.json()

    // Determine which API key to use
    let apiKey = Deno.env.get('OPENROUTER_API_KEY');

    // If userId is provided, try to get their personal API key
    if (userId) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } }
      )

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('openrouter_api_key')
        .eq('id', userId)
        .single()

      if (!error && data?.openrouter_api_key) {
        apiKey = data.openrouter_api_key
      }
    }

    if (!apiKey) {
      throw new Error('No OpenRouter API key available')
    }

    const openRouter = new OpenRouter(apiKey)
    
    // Get models that support streaming for chat completions
    const models = await openRouter.getModels(['stream'])
    
    // Filter for chat completion models and sort by popularity/capability
    const chatModels = models.data
      .filter(model => 
        model.id.includes('chat') || 
        model.id.includes('gpt') || 
        model.id.includes('claude') || 
        model.id.includes('sonar') ||
        model.id.includes('llama') ||
        model.architecture?.output_modalities?.includes('text')
      )
      .sort((a, b) => {
        // Prioritize popular models
        const priorityModels = [
          'openai/gpt-4o-mini',
          'openai/gpt-4o', 
          'anthropic/claude-3-haiku',
          'anthropic/claude-3-sonnet',
          'perplexity/sonar',
          'meta-llama/llama-3.1-8b-instruct'
        ]
        
        const aIndex = priorityModels.findIndex(p => a.id.includes(p))
        const bIndex = priorityModels.findIndex(p => b.id.includes(p))
        
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
        if (aIndex !== -1) return -1
        if (bIndex !== -1) return 1
        
        return a.name.localeCompare(b.name)
      })

    return new Response(
      JSON.stringify({ 
        models: chatModels.map(model => ({
          id: model.id,
          name: model.name,
          description: model.description,
          context_length: model.context_length,
          pricing: model.pricing
        }))
      }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )

  } catch (error) {
    console.error('Error fetching OpenRouter models:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
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