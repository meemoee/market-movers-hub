
import { QANode } from './types';

export const isCompleteMarkdown = (text: string): boolean => {
  const stack: string[] = [];
  let inCode = false;
  let inList = false;
  let currentNumber = '';
  
  if (text.match(/[a-zA-Z]$/)) return false;
  if (text.match(/\([^)]*$/)) return false;
  if (text.match(/\[[^\]]*$/)) return false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '`' && nextChar === '`' && text[i + 2] === '`') {
      inCode = !inCode;
      i += 2;
      continue;
    }
    
    if (inCode) continue;
    
    if (/^\d$/.test(char)) {
      currentNumber += char;
      continue;
    }
    if (char === '.' && currentNumber !== '') {
      inList = true;
      currentNumber = '';
      continue;
    }
    
    if (char === '\n') {
      inList = false;
      currentNumber = '';
    }
    
    if ((char === '*' || char === '_')) {
      if (nextChar === char) {
        if (stack.length > 0 && stack[stack.length - 1] === char + char) {
          stack.pop();
        } else {
          stack.push(char + char);
        }
        i++;
      } else {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        } else {
          stack.push(char);
        }
      }
    }
  }
  
  return stack.length === 0 && !inCode && !inList;
};

export const cleanStreamContent = (chunk: string): { content: string; citations: string[] } => {
  try {
    let dataStr = chunk;
    if (dataStr.startsWith('data: ')) {
      dataStr = dataStr.slice(6);
    }
    dataStr = dataStr.trim();
    
    if (dataStr === '[DONE]') {
      return { content: '', citations: [] };
    }
    
    const parsed = JSON.parse(dataStr);
    const content = parsed.choices?.[0]?.delta?.content || 
                   parsed.choices?.[0]?.message?.content || '';
    return { content, citations: [] };
  } catch (e) {
    console.debug('Chunk parse error (expected during streaming):', e);
    return { content: '', citations: [] };
  }
};

export const processStreamContent = (content: string, prevContent: string = ''): string => {
  let combinedContent = prevContent + content;
  
  combinedContent = combinedContent
    .replace(/\*\*\s*\*\*/g, '')
    .replace(/\*\s*\*/g, '')
    .replace(/`\s*`/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/:{2,}/g, ':')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (combinedContent.match(/[a-zA-Z]$/)) {
    combinedContent += '.';
  }
  
  return combinedContent;
};

export const getPreviewText = (text: string) => {
  const strippedText = text.replace(/[#*`_]/g, '');
  const preview = strippedText.slice(0, 150);
  return preview.length < strippedText.length ? `${preview}...` : preview;
};

export const buildHistoryContext = (node: QANode, parentNodes: QANode[] = []): string => {
  const history = [...parentNodes, node];
  return history.map((n, index) => {
    const prefix = index === 0 ? 'Original Question' : `Follow-up Question ${index}`;
    return `${prefix}: ${n.question}\nAnalysis: ${n.analysis}\n`;
  }).join('\n');
};

export const findParentNodes = (targetNodeId: string, nodes: QANode[], parentNodes: QANode[] = []): QANode[] | null => {
  for (const node of nodes) {
    if (node.id === targetNodeId) {
      return parentNodes;
    }
    if (node.children.length > 0) {
      const found = findParentNodes(targetNodeId, node.children, [...parentNodes, node]);
      if (found) return found;
    }
  }
  return null;
};

export const isLineComplete = (line: string): boolean => {
  return /[.!?]$/.test(line.trim()) || isCompleteMarkdown(line);
};
