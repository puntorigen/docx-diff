'use server';

/**
 * Server Action: Summarize Changes
 * Generates AI-powered summary of document changes using Groq.
 * This is a Server Action - no public API endpoint, only callable from frontend.
 */

import { GroqService } from '@/lib/services/groqService';
import type { EnrichedChange } from 'docx-diff-editor';
import type { SummaryBullet } from '@/lib/types/summary.types';

/**
 * Generate AI summary bullets from enriched changes
 */
export async function summarizeChanges(changes: EnrichedChange[]): Promise<SummaryBullet[]> {
  // Validate input
  if (!Array.isArray(changes) || changes.length === 0) {
    return [{ type: 'other', text: 'No changes to summarize' }];
  }

  // Check API key
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn('[summarizeChanges] GROQ_API_KEY not configured');
    return fallbackSummary(changes);
  }

  // Call Groq
  try {
    const groq = new GroqService(apiKey);
    return await groq.generateSummary(changes);
  } catch (error) {
    console.error('[summarizeChanges] Error:', error);
    return fallbackSummary(changes);
  }
}

/**
 * Generate basic summary when LLM is unavailable
 */
function fallbackSummary(changes: EnrichedChange[]): SummaryBullet[] {
  const counts = {
    replacement: 0,
    insertion: 0,
    deletion: 0,
    format: 0,
  };

  changes.forEach(c => {
    if (c.type in counts) {
      counts[c.type as keyof typeof counts]++;
    }
  });

  const bullets: SummaryBullet[] = [];
  if (counts.replacement) bullets.push({ type: 'replacement', text: `${counts.replacement} text replacement(s)` });
  if (counts.insertion) bullets.push({ type: 'insertion', text: `${counts.insertion} addition(s)` });
  if (counts.deletion) bullets.push({ type: 'deletion', text: `${counts.deletion} deletion(s)` });
  if (counts.format) bullets.push({ type: 'format', text: `${counts.format} formatting change(s)` });

  return bullets.length ? bullets : [{ type: 'other', text: 'No significant changes' }];
}

