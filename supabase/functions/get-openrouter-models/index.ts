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
  async getModels() {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key is required");
    }
    
    try {
      console.log('Fetching models from OpenRouter...')
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://hunchex.app'
        }
      });
      
      console.log('OpenRouter response status:', response.status)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('OpenRouter API error:', response.status, errorData)
        throw new Error(`OpenRouter API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }
      
      const modelData = await response.json();
      console.log('Received models count:', modelData.data?.length || 0)
      
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
    
    // Get ALL models from OpenRouter
    console.log('Calling OpenRouter.getModels()...')
    const models = await openRouter.getModels()
    
    console.log('Raw models received:', models.data?.length || 0)
    
    // Only filter for models that likely support streaming (most modern models do)
    // and are suitable for chat completions
    const chatModels = models.data
      .filter(model => {
        // Only exclude models that are clearly not for chat (embedding models, etc.)
        const isEmbedding = model.id.includes('embedding') || model.name.toLowerCase().includes('embedding')
        const isWhisper = model.id.includes('whisper') || model.name.toLowerCase().includes('whisper')
        const isDalle = model.id.includes('dall-e') || model.name.toLowerCase().includes('dall-e')
        
        return !isEmbedding && !isWhisper && !isDalle
      })
      .sort((a, b) => {
        // Prioritize popular models at the top
        const priorityModels = [
          'gpt-4o-mini',
          'gpt-4o',
          'claude-3-haiku',
          'claude-3-sonnet', 
          'sonar',
          'llama-3.1-8b-instruct',
          'gemini-pro',
          'mistral-large'
        ]
        
        const aMatches = priorityModels.some(p => a.id.includes(p))
        const bMatches = priorityModels.some(p => b.id.includes(p))
        
        if (aMatches && bMatches) {
          const aIndex = priorityModels.findIndex(p => a.id.includes(p))
          const bIndex = priorityModels.findIndex(p => b.id.includes(p))
          return aIndex - bIndex
        }
        if (aMatches) return -1
        if (bMatches) return 1
        
        // Secondary sort by name for non-priority models
        return a.name.localeCompare(b.name)
      })
      
    console.log('Filtered chat models:', chatModels.length)

    return new Response(
      JSON.stringify({
        models: chatModels.map(model => ({
          id: model.id,
          name: model.name,
          description: model.description,
          context_length: model.context_length,
          pricing: model.pricing,
          supports_response_format: Array.isArray(model.supported_parameters)
            ? model.supported_parameters.includes('response_format')
            : false
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