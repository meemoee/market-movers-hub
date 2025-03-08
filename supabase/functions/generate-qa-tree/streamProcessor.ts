
interface StreamingState {
  buffer: string;
  sentenceBuffer: string;
  currentListNumber: number;
  isInList: boolean;
  isInMarkdown: boolean;
  lastChar: string;
  lastWord: string;
}

export class StreamProcessor {
  private state: StreamingState;
  private readonly sentenceEndings = new Set(['.', '!', '?']);
  private readonly listMarkerPattern = /^\d+\.\s/;
  private readonly headerPattern = /^#{1,6}\s/;
  private readonly markdownTokens = new Set(['**', '_', '`', '[']);

  constructor() {
    this.state = {
      buffer: '',
      sentenceBuffer: '',
      currentListNumber: 0,
      isInList: false,
      isInMarkdown: false,
      lastChar: '',
      lastWord: ''
    };
  }

  processChunk(text: string): string {
    // Add new text to buffer
    this.state.buffer += text;
    let output = '';
    
    // Process buffer character by character for better control
    const processedText = this.processBufferCharacters();
    if (processedText) {
      output += processedText;
    }
    
    return output;
  }
  
  private processBufferCharacters(): string {
    let output = '';
    
    // Process buffer character by character
    while (this.state.buffer.length > 0) {
      const char = this.state.buffer[0];
      this.state.buffer = this.state.buffer.slice(1);
      
      // Check for complete words and sentences
      if (this.isWordBoundary(char)) {
        const word = this.state.sentenceBuffer.trim();
        
        if (word.length > 0) {
          // Handle headers (# Header)
          if (this.headerPattern.test(word)) {
            const headerLevel = word.match(/^(#+)/)?.[0].length || 1;
            const headerContent = word.replace(/^#+\s+/, '');
            output += (output ? '\n\n' : '') + '#'.repeat(headerLevel) + ' ' + headerContent;
          }
          // Handle list markers
          else if (this.listMarkerPattern.test(word)) {
            const number = parseInt(word);
            if (number === this.state.currentListNumber + 1) {
              this.state.currentListNumber = number;
              this.state.isInList = true;
              output += '\n' + word;
            }
          } 
          // Handle normal words
          else {
            output += (output && !output.endsWith('\n') ? ' ' : '') + word;
          }
        }
        
        // Clear sentence buffer
        this.state.sentenceBuffer = '';
        
        // Add the boundary character
        if (this.sentenceEndings.has(char)) {
          output += char + ' ';
        } else if (char === ':') {
          output += char + '\n';
        } else if (char === '\n') {
          // Handle explicit newlines in the text
          if (this.state.lastChar === '\n') {
            // Double newline, create paragraph break
            output += '\n\n';
          } else {
            output += '\n';
          }
        } else if (char !== ' ') {
          this.state.sentenceBuffer += char;
        }
      } else {
        this.state.sentenceBuffer += char;
      }
      
      this.state.lastChar = char;
    }
    
    return output;
  }

  private isWordBoundary(char: string): boolean {
    return /[\s.,!?:;\-\n]/.test(char);
  }

  private isMarkdownToken(text: string): boolean {
    return this.markdownTokens.has(text);
  }

  flush(): string {
    const remaining = this.formatText(
      this.state.buffer + this.state.sentenceBuffer
    );
    this.clear();
    return remaining;
  }

  private formatText(text: string): string {
    // Ensure proper spacing after punctuation
    return text
      .replace(/([.!?])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .replace(/\s*([.,!?:])\s*/g, '$1 ')
      .trim();
  }

  clear(): void {
    this.state = {
      buffer: '',
      sentenceBuffer: '',
      currentListNumber: 0,
      isInList: false,
      isInMarkdown: false,
      lastChar: '',
      lastWord: ''
    };
  }
}
