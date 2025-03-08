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
  private readonly markdownTokens = new Set(['**', '_', '`', '[']);
  private readonly paragraphBreakPattern = /\n\s*\n/;

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
    // Add new text to buffers
    this.state.buffer += text;
    let output = '';
    
    // Check for paragraph breaks
    const paragraphs = this.state.buffer.split(this.paragraphBreakPattern);
    
    if (paragraphs.length > 1) {
      // Process all complete paragraphs
      for (let i = 0; i < paragraphs.length - 1; i++) {
        output += this.processParagraph(paragraphs[i]) + '\n\n';
      }
      
      // Keep the last (possibly incomplete) paragraph in the buffer
      this.state.buffer = paragraphs[paragraphs.length - 1];
    }
    
    // Process character by character for the remaining buffer
    const processedText = this.processBufferCharacters();
    if (processedText) {
      output += processedText;
    }
    
    return output;
  }
  
  private processParagraph(text: string): string {
    let processed = '';
    let lines = text.split('\n');
    
    for (const line of lines) {
      // Check for section headers with markdown
      if (line.startsWith('#')) {
        processed += line + '\n\n';
      }
      // Check for list items
      else if (line.trim().startsWith('- ') || line.trim().startsWith('* ') || this.listMarkerPattern.test(line.trim())) {
        processed += line + '\n';
      }
      // Regular text
      else {
        processed += line + ' ';
      }
    }
    
    return processed.trim();
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
          // Handle list markers
          if (this.listMarkerPattern.test(word)) {
            const number = parseInt(word);
            if (number === this.state.currentListNumber + 1) {
              this.state.currentListNumber = number;
              this.state.isInList = true;
              output += '\n\n' + word;
            }
          } 
          // Handle markdown tokens
          else if (this.isMarkdownToken(word)) {
            this.state.isInMarkdown = !this.state.isInMarkdown;
            output += word;
          }
          // Handle section headings
          else if (word.startsWith('#')) {
            output += (output ? '\n\n' : '') + word;
          }
          // Handle normal words
          else {
            output += (output && !output.endsWith('\n\n') ? ' ' : '') + word;
          }
        }
        
        // Clear sentence buffer
        this.state.sentenceBuffer = '';
        
        // Add the boundary character
        if (this.sentenceEndings.has(char)) {
          output += char + ' ';
          if (this.state.isInList) {
            output += '\n';
          }
        } else if (char === ':') {
          output += char + '\n\n';
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
    return /[\s.,!?:;\-]/.test(char);
  }

  private isMarkdownToken(text: string): boolean {
    return this.markdownTokens.has(text);
  }

  private isCompleteSentence(text: string): boolean {
    if (text.length === 0) return false;
    const lastChar = text[text.length - 1];
    return this.sentenceEndings.has(lastChar) && 
           (text.length === 1 || text[text.length - 2] !== '.');
  }

  private shouldStartNewLine(word: string): boolean {
    return this.listMarkerPattern.test(word) || word === '-';
  }

  private formatText(text: string): string {
    // Ensure proper spacing after punctuation
    return text
      .replace(/([.!?])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .replace(/\s*([.,!?:])\s*/g, '$1 ')
      .trim();
  }

  flush(): string {
    const remaining = this.formatText(
      this.state.buffer + this.state.sentenceBuffer
    );
    this.clear();
    return remaining;
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
