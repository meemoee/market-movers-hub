
import { Json } from '@/integrations/supabase/types';

/**
 * Safely converts any JSON value to a string for display in progress logs
 */
export function ensureString(value: Json | undefined | null): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  // For objects and arrays, stringify them
  return JSON.stringify(value);
}
