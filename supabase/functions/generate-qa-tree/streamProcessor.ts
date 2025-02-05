interface ContentState {
  buffer: string;
  currentListNumber: number;
  inList: boolean;
  inSection: boolean;
  markdownTokens: Set<string>;
}

export class StreamProcessor {
  private state: ContentState;
  private readonly markdownPairs = new Map([
    ['**', '**'],
    ['*', '*'],
    ['_', '_'],
    ['`', '`'],
  ]);

  constructor() {
    this.state = {
      buffer: '',
      currentListNumber: 0,
      inList: false,
      inSection: false,
      markdownTokens: new Set()
    };
  }

  processChunk(text: string): string {
    this.state.buffer += text;
    return this.processBuffer();
  }

  private processBuffer(): string {
    let output = '';
    let currentPosition = 0;
    let segmentStart = 0;
    let lastProcessedPosition = 0;

    const buffer = this.state.buffer;

    while (currentPosition < buffer.length) {
      // Check for content boundaries
      if (this.isContentBoundary(buffer, currentPosition)) {
        // Process the content up to this point
        if (currentPosition > segmentStart) {
          const segment = buffer.slice(segmentStart, currentPosition);
          output += this.formatSegment(segment);
          lastProcessedPosition = currentPosition;
        }

        // Add appropriate spacing based on context
        if (this.shouldAddDoubleLineBreak(buffer, currentPosition)) {
          output += '\n\n';
        } else if (this.shouldAddSingleLineBreak(buffer, currentPosition)) {
          output += '\n';
        }

        segmentStart = currentPosition;
      }

      currentPosition++;
    }

    // Process any remaining content
    if (segmentStart < buffer.length) {
      const remainingContent = buffer.slice(segmentStart);
      // Only keep unprocessed content that might be incomplete
      if (this.mightBeIncomplete(remainingContent)) {
        this.state.buffer = remainingContent;
      } else {
        output += this.formatSegment(remainingContent);
        this.state.buffer = '';
      }
    } else {
      this.state.buffer = '';
    }

    return output;
  }

  private isContentBoundary(text: string, position: number): boolean {
    // Check for list items
    if (this.isListItem(text, position)) return true;

    // Check for section headers
    if (this.isSectionHeader(text, position)) return true;

    // Check for colon introductions
    if (this.isColonIntroduction(text, position)) return true;

    // Check for sentence boundaries before new content
    if (this.isSentenceBoundary(text, position)) return true;

    return false;
  }

  private isListItem(text: string, position: number): boolean {
    if (position > 0 && text[position - 1] !== '\n') return false;

    const match = text.slice(position).match(/^(\d+)\.\s/);
    if (match) {
      const number = parseInt(match[1]);
      if (number === this.state.currentListNumber + 1) {
        this.state.currentListNumber = number;
        this.state.inList = true;
        return true;
      }
    }
    return false;
  }

  private isSectionHeader(text: string, position: number): boolean {
    if (position > 0 && text[position - 1] !== '\n') return false;

    const headerPattern = /^[A-Z][a-z]+(?:\s+(?:and|or|of|in|to|for|by|the|a)\s+[A-Z][a-z]+)*:/;
    const match = text.slice(position).match(headerPattern);
    return !!match;
  }

  private isColonIntroduction(text: string, position: number): boolean {
    if (text[position] !== ':') return false;
    
    // Check if colon is followed by content that should start on new line
    const nextChar = text[position + 1];
    return nextChar === '\n' || this.isListItem(text, position + 1);
  }

  private isSentenceBoundary(text: string, position: number): boolean {
    if (position === 0) return false;

    const currentChar = text[position];
    const prevChar = text[position - 1];
    const nextChar = text[position + 1];

    // Check for sentence ending punctuation
    if (['.', '!', '?'].includes(prevChar)) {
      // Ensure it's not part of an abbreviation or number
      if (!/[A-Z0-9]/.test(currentChar)) {
        return true;
      }
    }

    return false;
  }

  private shouldAddDoubleLineBreak(text: string, position: number): boolean {
    // Add double line break before new sections or lists
    return this.isListItem(text, position) || this.isSectionHeader(text, position);
  }

  private shouldAddSingleLineBreak(text: string, position: number): boolean {
    // Add single line break after colons or between list items
    return this.isColonIntroduction(text, position) || 
           (this.state.inList && this.isSentenceBoundary(text, position));
  }

  private formatSegment(text: string): string {
    let formatted = text;

    // Process markdown tokens
    formatted = this.processMarkdown(formatted);

    // Clean up extra whitespace
    formatted = formatted.replace(/\s+/g, ' ').trim();

    return formatted;
  }

  private processMarkdown(text: string): string {
    let result = text;

    for (const [startToken, endToken] of this.markdownPairs) {
      const regex = new RegExp(`\\${startToken}(.*?)\\${endToken}`, 'g');
      result = result.replace(regex, '$1');
    }

    return result;
  }

  private mightBeIncomplete(text: string): boolean {
    // Check if text might be part of an incomplete sentence or list item
    if (text.trim().length === 0) return false;

    // Check for incomplete markdown
    for (const [startToken] of this.markdownPairs) {
      if (text.includes(startToken) && 
          text.indexOf(startToken) === text.lastIndexOf(startToken)) {
        return true;
      }
    }

    // Check for incomplete sentences
    const lastChar = text.trim().slice(-1);
    if (!['.', '!', '?'].includes(lastChar)) {
      return true;
    }

    return false;
  }

  clear(): void {
    this.state = {
      buffer: '',
      currentListNumber: 0,
      inList: false,
      inSection: false,
      markdownTokens: new Set()
    };
  }
}
