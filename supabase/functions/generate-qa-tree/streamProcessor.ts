// streamProcessor.ts
interface ContentState {
  buffer: string;
  listItemNumber: number | null;
  markdownStack: string[];
  sentenceComplete: boolean;
  lastProcessedListItem: number;
}

export class StreamProcessor {
  private state: ContentState;
  private readonly sentenceEndMarkers = new Set(['.', '!', '?']);
  private readonly markdownPairs = new Map([
    ['**', '**'],
    ['*', '*'],
    ['_', '_'],
    ['`', '`'],
  ]);

  constructor() {
    this.state = {
      buffer: '',
      listItemNumber: null,
      markdownStack: [],
      sentenceComplete: true,
      lastProcessedListItem: 0
    };
  }

  processChunk(text: string): string {
    // Add new text to buffer
    this.state.buffer += text;
    
    // Process the buffer
    const result = this.processBuffer();
    return result;
  }

  private processBuffer(): string {
    let output = '';
    let currentPosition = 0;
    let segmentStart = 0;

    while (currentPosition < this.state.buffer.length) {
      // Check for list items
      if (this.state.buffer[currentPosition] === '\n' && 
          currentPosition + 1 < this.state.buffer.length) {
        const listMatch = this.state.buffer.slice(currentPosition + 1)
          .match(/^(\d+)\.\s/);
        
        if (listMatch) {
          const number = parseInt(listMatch[1]);
          if (number === this.state.lastProcessedListItem + 1) {
            // Process previous content
            output += this.state.buffer.slice(segmentStart, currentPosition);
            
            // Move past list marker
            currentPosition += listMatch[0].length + 1;
            segmentStart = currentPosition;
            this.state.lastProcessedListItem = number;
            continue;
          }
        }
      }

      // Check for sentence boundaries
      if (this.sentenceEndMarkers.has(this.state.buffer[currentPosition])) {
        let isEndOfSentence = false;
        
        // Look ahead for space or newline
        if (currentPosition + 1 < this.state.buffer.length) {
          const nextChar = this.state.buffer[currentPosition + 1];
          if (nextChar === ' ' || nextChar === '\n') {
            isEndOfSentence = true;
          }
        }

        if (isEndOfSentence) {
          // Process content up to sentence end
          const sentenceContent = this.state.buffer.slice(segmentStart, 
            currentPosition + 1);
          
          // Handle markdown in the sentence
          output += this.processMarkdown(sentenceContent);
          
          currentPosition += 1;
          segmentStart = currentPosition;
          this.state.sentenceComplete = true;
          continue;
        }
      }

      currentPosition++;
    }

    // Keep unprocessed content in buffer
    if (segmentStart < this.state.buffer.length) {
      const remainingContent = this.state.buffer.slice(segmentStart);
      
      // Only keep if it's not just whitespace
      if (remainingContent.trim().length > 0) {
        this.state.buffer = remainingContent;
      } else {
        this.state.buffer = '';
      }
    } else {
      this.state.buffer = '';
    }

    return output;
  }

  private processMarkdown(text: string): string {
    let result = text;
    let hasUnclosedTokens = false;

    // Process markdown tokens
    for (const [startToken, endToken] of this.markdownPairs) {
      // Find all occurrences of the token
      let startIndex = 0;
      while ((startIndex = result.indexOf(startToken, startIndex)) !== -1) {
        // Look for matching end token
        const endIndex = result.indexOf(endToken, startIndex + startToken.length);
        
        if (endIndex === -1) {
          hasUnclosedTokens = true;
          break;
        }

        // Replace the tokens with their content
        const content = result.slice(startIndex + startToken.length, endIndex);
        result = result.slice(0, startIndex) + content + 
          result.slice(endIndex + endToken.length);
      }

      if (hasUnclosedTokens) {
        break;
      }
    }

    return hasUnclosedTokens ? text : result;
  }

  clear(): void {
    this.state = {
      buffer: '',
      listItemNumber: null,
      markdownStack: [],
      sentenceComplete: true,
      lastProcessedListItem: 0
    };
  }

  private isListContinuation(text: string): boolean {
    return /^\d+\.\s/.test(text);
  }

  private findNextSentenceBoundary(text: string, startPos: number): number {
    for (let i = startPos; i < text.length - 1; i++) {
      if (this.sentenceEndMarkers.has(text[i])) {
        const nextChar = text[i + 1];
        if (nextChar === ' ' || nextChar === '\n') {
          return i;
        }
      }
    }
    return -1;
  }

  private getCompleteContent(): string {
    const content = this.state.buffer;
    this.state.buffer = '';
    return content;
  }
}
