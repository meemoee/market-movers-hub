import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// StreamProcessor handles buffering and processing of streaming content
// to ensure complete thoughts and proper markdown formatting
export class StreamProcessor {
  private buffer: string = '';
  private pendingTokens: Map<string, number> = new Map();
  private readonly tokenPairs = {
    '**': '**',  // bold
    '_': '_',    // italic
    '`': '`',    // code
    '[': ']',    // links
  };

  processChunk(text: string): string {
    this.buffer += text;
    return this.processBuffer();
  }

  private processBuffer(): string {
    let processedText = '';
    let currentPos = 0;

    while (currentPos < this.buffer.length) {
      const nextToken = this.findNextToken(currentPos);
      
      if (!nextToken) {
        // No more tokens found, keep last 2 chars in case they're start of a token
        if (this.buffer.length - currentPos > 2) {
          processedText += this.buffer.slice(currentPos, this.buffer.length - 2);
          this.buffer = this.buffer.slice(this.buffer.length - 2);
        }
        break;
      }

      const { token, position } = nextToken;
      
      if (this.pendingTokens.has(token)) {
        // Found matching end token
        const startPos = this.pendingTokens.get(token)!;
        // Include the complete token pair and its content
        processedText += this.buffer.slice(startPos, position + token.length);
        this.pendingTokens.delete(token);
        currentPos = position + token.length;
      } else {
        // Start of new token pair
        this.pendingTokens.set(token, position);
        currentPos = position + token.length;
      }
    }

    // Reset buffer if no pending tokens
    if (this.pendingTokens.size === 0) {
      processedText += this.buffer;
      this.buffer = '';
    }

    return processedText;
  }

  private findNextToken(startPos: number): { token: string, position: number } | null {
    let earliestToken = null;
    let earliestPos = this.buffer.length;

    // Find the earliest occurring token
    for (const [startToken, endToken] of Object.entries(this.tokenPairs)) {
      const pos = this.buffer.indexOf(this.pendingTokens.has(startToken) ? endToken : startToken, startPos);
      if (pos !== -1 && pos < earliestPos) {
        earliestPos = pos;
        earliestToken = startToken;
      }
    }

    return earliestToken ? { token: earliestToken, position: earliestPos } : null;
  }

  clear() {
    this.buffer = '';
    this.pendingTokens.clear();
  }
}
