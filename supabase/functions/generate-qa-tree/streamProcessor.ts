interface ContentState {
  buffer: string;
  currentListNumber: number;
  inList: boolean;
  inSection: boolean;
  markdownTokens: Set<string>;
}

export class StreamProcessor {
  private buffer: string = '';
  private readonly wordBoundaryRegex = /\b/;
  private lastCompleteWord: string = '';

  processChunk(text: string): string {
    // Combine with existing buffer
    const combined = this.buffer + text;
    let output = '';
    let currentPosition = 0;
    let lastWordBoundary = 0;

    // Find word boundaries
    while (currentPosition < combined.length) {
      if (this.isWordBoundary(combined, currentPosition)) {
        // Found a complete word
        const word = combined.slice(lastWordBoundary, currentPosition).trim();
        if (word) {
          // Only output if it's a new complete word
          if (word !== this.lastCompleteWord && this.isCompleteWord(word)) {
            output += (output ? ' ' : '') + word;
            this.lastCompleteWord = word;
          }
        }
        lastWordBoundary = currentPosition;
      }
      currentPosition++;
    }

    // Keep remainder in buffer
    this.buffer = combined.slice(lastWordBoundary);
    
    return output;
  }

  private isWordBoundary(text: string, position: number): boolean {
    // Check for word boundaries including spaces and punctuation
    return (
      position === text.length ||
      /[\s.,!?;:]/.test(text[position]) ||
      (position > 0 && /[A-Za-z]/.test(text[position - 1]) && /[^A-Za-z]/.test(text[position])) ||
      (position > 0 && /[^A-Za-z]/.test(text[position - 1]) && /[A-Za-z]/.test(text[position]))
    );
  }

  private isCompleteWord(word: string): boolean {
    // Verify word is complete and not a partial token
    return (
      word.length > 0 &&
      !this.isPartialMarkdown(word) &&
      !this.isPartialNumber(word) &&
      !this.isPartialUrl(word)
    );
  }

  private isPartialMarkdown(word: string): boolean {
    // Check for incomplete markdown tokens
    const tokens = ['**', '_', '`', '[', ']'];
    return tokens.some(token => {
      const count = (word.match(new RegExp(`\\${token}`, 'g')) || []).length;
      return count % 2 !== 0;
    });
  }

  private isPartialNumber(word: string): boolean {
    // Check for incomplete numbers or list markers
    return /^\d+$/.test(word) || /^\d+\.$/.test(word);
  }

  private isPartialUrl(word: string): boolean {
    // Check for incomplete URLs or links
    return /^https?:\/\/[^\s]*$/.test(word) && !word.endsWith('/');
  }

  clear(): void {
    this.buffer = '';
    this.lastCompleteWord = '';
  }
}
