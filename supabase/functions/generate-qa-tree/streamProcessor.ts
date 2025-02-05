interface ContentState {
  buffer: string;
  currentListNumber: number;
  inList: boolean;
  inSection: boolean;
  markdownTokens: Set<string>;
}

export class StreamProcessor {
  private state: ContentState;
  private static readonly SENTENCE_ENDINGS = ['.', '!', '?'];
  private static readonly LIST_MARKER_REGEX = /^(\d+)\.(?!\d)/;
  private static readonly SECTION_HEADER_REGEX = /^[A-Z][a-z]+(?:\s+(?:and|or|of|in|to|for|by|the|a)\s+[A-Z][a-z]+)*:/;

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
    // First, normalize the text
    let processedText = this.normalizeText(this.state.buffer);
    
    // Split into segments
    const segments = this.splitIntoSegments(processedText);
    
    // Process each segment
    let output = '';
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const nextSegment = segments[i + 1];
      
      // Format the segment
      output += this.formatSegment(segment, nextSegment);
    }

    // Keep only incomplete content in buffer
    const lastSegment = segments[segments.length - 1];
    this.state.buffer = this.isIncompleteSegment(lastSegment) ? lastSegment : '';

    return output;
  }

  private normalizeText(text: string): string {
    return text
      // Fix spacing after sentence endings
      .replace(/([.!?])([A-Z])/g, '$1 $2')
      // Fix spacing in lists
      .replace(/(\d+)\.\s*([A-Z])/g, '$1. $2')
      // Fix spacing after colons
      .replace(/:\s*(\d+)/g, ':\n\n$1')
      // Remove multiple spaces
      .replace(/\s+/g, ' ');
  }

  private splitIntoSegments(text: string): string[] {
    const segments: string[] = [];
    let currentSegment = '';

    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (this.isListItem(sentence)) {
        if (currentSegment) {
          segments.push(currentSegment.trim());
          currentSegment = '';
        }
        segments.push(sentence.trim());
      } else if (this.isSectionHeader(sentence)) {
        if (currentSegment) {
          segments.push(currentSegment.trim());
          currentSegment = '';
        }
        segments.push(sentence.trim());
      } else {
        currentSegment += sentence + ' ';
      }
    }

    if (currentSegment) {
      segments.push(currentSegment.trim());
    }

    return segments.filter(s => s);
  }

  private formatSegment(segment: string, nextSegment: string | undefined): string {
    let formatted = segment;

    // Handle list items
    if (this.isListItem(formatted)) {
      formatted = this.formatListItem(formatted);
    }

    // Handle section headers
    if (this.isSectionHeader(formatted)) {
      formatted = this.formatSectionHeader(formatted);
    }

    // Add appropriate spacing
    if (nextSegment) {
      if (this.isListItem(nextSegment) || this.isSectionHeader(nextSegment)) {
        formatted += '\n\n';
      } else if (this.shouldAddNewline(formatted, nextSegment)) {
        formatted += '\n';
      } else {
        formatted += ' ';
      }
    }

    return formatted;
  }

  private isListItem(text: string): boolean {
    return StreamProcessor.LIST_MARKER_REGEX.test(text.trim());
  }

  private isSectionHeader(text: string): boolean {
    return StreamProcessor.SECTION_HEADER_REGEX.test(text.trim());
  }

  private formatListItem(text: string): string {
    const match = text.match(StreamProcessor.LIST_MARKER_REGEX);
    if (!match) return text;

    const number = parseInt(match[1]);
    this.state.currentListNumber = number;
    this.state.inList = true;

    // Ensure proper spacing in list items
    return text.replace(/(\d+)\.\s*/, '$1. ');
  }

  private formatSectionHeader(text: string): string {
    // Ensure proper spacing around colons in headers
    return text.replace(/:\s*$/, ':\n');
  }

  private shouldAddNewline(current: string, next: string): boolean {
    return current.endsWith(':') || 
           (this.state.inList && StreamProcessor.SENTENCE_ENDINGS.some(ending => current.endsWith(ending)));
  }

  private isIncompleteSegment(segment: string): boolean {
    if (!segment) return false;
    
    // Check for incomplete sentences
    if (!StreamProcessor.SENTENCE_ENDINGS.some(ending => segment.endsWith(ending))) {
      return true;
    }

    // Check for incomplete list items
    if (this.state.inList && !this.isListItem(segment)) {
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
