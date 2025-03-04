
export class StreamProcessor {
  processChunk(text: string): string {
    const lines = text.split('\n');
    let content = '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(jsonStr);
          const chunk = parsed.choices?.[0]?.delta?.content || 
                        parsed.choices?.[0]?.message?.content || '';
          if (chunk) {
            content += chunk;
          }
        } catch (e) {
          // Silently ignore parsing errors during streaming
        }
      }
    }
    
    return content;
  }

  flush(): string {
    return '';
  }

  clear(): void {
    // No buffer to clear in this simplified implementation
  }
}
