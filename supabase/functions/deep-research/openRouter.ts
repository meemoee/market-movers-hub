
/**
 * OpenRouter API client for Deno
 */
export class OpenRouter {
  private apiKey: string;
  private baseUrl = "https://openrouter.ai/api/v1";
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  /**
   * Create a completion using OpenRouter API
   * @param model Model to use
   * @param messages Messages for the model
   * @param maxTokens Maximum tokens to generate
   * @param temperature Temperature parameter
   * @param requestReasoning Whether to request reasoning
   * @returns The response content or { content, reasoning } object
   */
  async complete(
    model: string, 
    messages: Array<{role: string, content: string}>,
    maxTokens: number = 500,
    temperature: number = 0.7,
    requestReasoning: boolean = false
  ): Promise<string | { content: string, reasoning: string }> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key is required");
    }
    
    try {
      const body: any = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature
      };
      
      // Add reasoning configuration for DeepSeek R1
      if (requestReasoning && model === "deepseek/deepseek-r1") {
        body.extra = {
          reasoning: {
            enabled: true,
            effort: 0.8
          }
        };
      }
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://hunchex.app'
        },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }
      
      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error(`Invalid response from OpenRouter API: ${JSON.stringify(data)}`);
      }
      
      // Check if reasoning is present in the response
      if (requestReasoning && 
          data.choices[0].message.reasoning && 
          typeof data.choices[0].message.reasoning === 'string') {
        return {
          content: data.choices[0].message.content,
          reasoning: data.choices[0].message.reasoning
        };
      }
      
      return data.choices[0].message.content;
    } catch (error) {
      console.error(`OpenRouter API request failed: ${error.message}`);
      throw error;
    }
  }
}
