
/**
 * OpenRouter client for research functions
 */
export class OpenRouter {
  private apiKey: string;
  private baseUrl: string = "https://openrouter.ai/api/v1/chat/completions";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Complete a prompt using OpenRouter API
   */
  async complete(
    model: string,
    messages: { role: string; content: string }[],
    maxTokens: number = 1000,
    temperature: number = 0.7
  ): Promise<string> {
    try {
      console.log(`Making OpenRouter request to model: ${model}`);
      console.log(`Messages count: ${messages.length}`);
      
      const body = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        response_format: { type: "text" },
      };

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://market-research-app.vercel.app/",
          "X-Title": "Market Research App"
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenRouter API error (${response.status}): ${errorText}`);
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error("OpenRouter completion error:", error);
      throw error;
    }
  }

  /**
   * Generate embeddings using OpenRouter API
   */
  async generateEmbedding(
    text: string,
    model: string = "openai/text-embedding-3-small"
  ): Promise<number[]> {
    try {
      console.log(`Generating embedding for text (${text.length} chars)`);
      
      const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://market-research-app.vercel.app/",
          "X-Title": "Market Research App"
        },
        body: JSON.stringify({
          model,
          input: text
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenRouter embedding error (${response.status}): ${errorText}`);
        throw new Error(`OpenRouter embedding error: ${response.status}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error("OpenRouter embedding error:", error);
      throw error;
    }
  }
}
