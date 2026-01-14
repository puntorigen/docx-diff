/**
 * Groq Service
 * Simple, resilient wrapper for Groq API calls with retry logic.
 */

import Groq from 'groq-sdk';
import type { EnrichedChange } from 'docx-diff-editor';
import type { SummaryBullet } from '../types/summary.types';

const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export class GroqService {
  private groq: Groq;
  private model: string;

  constructor(apiKey: string, model = DEFAULT_MODEL) {
    this.groq = new Groq({ apiKey });
    this.model = model;
  }

  /**
   * Generate change summary bullets with type classification
   */
  async generateSummary(changes: EnrichedChange[]): Promise<SummaryBullet[]> {
    const prompt = buildPrompt(changes);
    const response = await this.complete(prompt);
    return parseBulletsFromResponse(response);
  }

  /**
   * Call Groq API with retries and exponential backoff
   */
  private async complete(prompt: string): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.groq.chat.completions.create({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1500,
          temperature: 0.4,
        });
        return response.choices[0]?.message?.content || '';
      } catch (error) {
        lastError = error as Error;
        console.warn(`[GroqService] Attempt ${attempt + 1} failed:`, error);

        // Don't retry auth errors
        if (this.isAuthError(error)) throw error;

        // Exponential backoff with jitter
        if (attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('All retries failed');
  }

  private isAuthError(error: unknown): boolean {
    const status = (error as { status?: number })?.status;
    return status === 401 || status === 403;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// --- Prompt Building ---

function buildPrompt(changes: EnrichedChange[]): string {
  const formattedChanges = formatChangesForPrompt(changes);

  return `You are analyzing changes between two versions of a legal/business document. Your task is to describe each change in a way that helps a reviewer quickly understand WHAT changed and WHERE to find it.

CHANGES DETECTED:
${formattedChanges}

---

INSTRUCTIONS:

1. For each significant change, write a clear description that includes:
   - WHAT was changed (be specific: company names, numbers, terms, formatting)
   - WHERE it is located (use the section name, e.g., "in the Party Identification section", "in the Client details", "in the Delivery Terms")

2. For location references:
   - Use section names when available (e.g., "in 'Identificación de las partes'")
   - Or describe position naturally (e.g., "in the service provider's address", "in the client's legal information")
   - AVOID saying "paragraph 5" or "line 12" - users can't count paragraphs

3. For formatting changes:
   - Explain what text was emphasized and where (e.g., "emphasized 'Chile' with bold in the provider's address")

4. For deletions:
   - DO NOT quote long removed text verbatim
   - Instead, SUMMARIZE what the deleted text was about AND include the location
   - Example: "removed the clause about delivery deadlines from the Delivery Terms section"
   - Keep deletion descriptions concise but always mention WHERE

5. Read the surrounding context carefully to understand what the change means:
   - A number change might be a year, a serial number, a quantity, or an ID - figure out which from context
   - Don't guess or make assumptions - use the context provided

OUTPUT FORMAT:
Return a JSON object with a "bullets" array. Each bullet is an object with:
- "type": one of "format", "replacement", "insertion", "deletion"
- "text": the description of the change

Example:
{
  "bullets": [
    {"type": "replacement", "text": "replaced company name 'Okidoki SpA' with 'Superdoc Inc' in Client section"},
    {"type": "format", "text": "emphasized 'Chile' with bold in the service provider's address"},
    {"type": "deletion", "text": "removed the delivery deadline clause from Terms of Service"}
  ]
}

Your response (JSON only):`;
}

function formatChangesForPrompt(changes: EnrichedChange[]): string {
  const topChanges = changes.slice(0, 15);

  return topChanges.map((change, i) => {
    const num = i + 1;
    const section = change.location.sectionTitle 
      ? `Located in: "${change.location.sectionTitle}"` 
      : '';
    const context = change.surroundingText 
      ? `Surrounding text: "${change.surroundingText}"` 
      : '';

    switch (change.type) {
      case 'replacement': {
        const lines = [
          `${num}. TYPE: Replacement`,
          `   From: "${change.oldText}"`,
          `   To: "${change.newText}"`,
        ];
        if (section) lines.push(`   ${section}`);
        if (context) lines.push(`   ${context}`);
        return lines.join('\n');
      }

      case 'insertion': {
        const lines = [
          `${num}. TYPE: Insertion`,
          `   Added text: "${change.text}"`,
        ];
        if (section) lines.push(`   ${section}`);
        if (context) lines.push(`   ${context}`);
        return lines.join('\n');
      }

      case 'deletion': {
        // For long deletions, truncate to encourage summarization
        const removedText = change.text && change.text.length > 100 
          ? `${change.text.slice(0, 100)}... (${change.text.length} chars total)`
          : change.text;
        const lines = [
          `${num}. TYPE: Deletion`,
          `   Removed text: "${removedText}"`,
        ];
        if (section) lines.push(`   ${section}`);
        if (context) lines.push(`   ${context}`);
        return lines.join('\n');
      }

      case 'format': {
        const formats = change.formatDetails?.added.join(', ') || 'formatting';
        const lines = [
          `${num}. TYPE: Formatting`,
          `   Text: "${change.text}"`,
          `   Applied: ${formats}`,
        ];
        if (section) lines.push(`   ${section}`);
        if (context) lines.push(`   ${context}`);
        return lines.join('\n');
      }

      default:
        return `${num}. TYPE: Change\n   ${change.location.description}`;
    }
  }).join('\n\n');
}

// --- Fault-Tolerant JSON Parsing ---

function parseBulletsFromResponse(text: string): SummaryBullet[] {
  // Strategy 1: Direct parse
  let result = tryParseStructured(text);
  if (result) return result;

  // Strategy 2: Extract JSON block from response
  const jsonMatch = text.match(/\{[\s\S]*"bullets"[\s\S]*\}/);
  if (jsonMatch) {
    result = tryParseStructured(jsonMatch[0]);
    if (result) return result;
  }

  // Strategy 3: Fix common errors and retry
  result = tryParseStructured(fixJsonErrors(text));
  if (result) return result;

  // Strategy 4: Fallback to plain text extraction
  return extractBulletsFromText(text);
}

function tryParseStructured(text: string): SummaryBullet[] | null {
  try {
    const data = JSON.parse(text);
    const bullets = data.bullets || data;
    if (Array.isArray(bullets)) {
      return bullets
        .filter((b: unknown) => b && typeof b === 'object')
        .map((b: { type?: string; text?: string }) => ({
          type: normalizeType(b.type),
          text: typeof b.text === 'string' ? b.text : String(b.text || ''),
        }))
        .filter((b: SummaryBullet) => b.text.length > 0);
    }
    // Handle if bullets are just strings (old format)
    if (Array.isArray(bullets) && bullets.every((b: unknown) => typeof b === 'string')) {
      return bullets.map((text: string) => ({ type: 'other' as const, text }));
    }
  } catch {
    // Silent fail, try next strategy
  }
  return null;
}

function normalizeType(type: string | undefined): SummaryBullet['type'] {
  if (!type) return 'other';
  const t = type.toLowerCase();
  if (t === 'format' || t === 'formatting') return 'format';
  if (t === 'replacement' || t === 'replace' || t === 'changed') return 'replacement';
  if (t === 'insertion' || t === 'insert' || t === 'added' || t === 'addition') return 'insertion';
  if (t === 'deletion' || t === 'delete' || t === 'removed' || t === 'removal') return 'deletion';
  return 'other';
}

function fixJsonErrors(text: string): string {
  return text
    .replace(/,(\s*[}\]])/g, '$1')     // Trailing commas
    .replace(/```json?\s*/g, '')        // Code fences
    .replace(/```\s*/g, '')
    .trim();
}

function extractBulletsFromText(text: string): SummaryBullet[] {
  return text.split('\n')
    .map(line => line.replace(/^[\d\-•*]+[.):\s]*/, '').trim())
    .filter(line => line.length > 5 && line.length < 200)
    .slice(0, 10)
    .map(text => ({ type: 'other' as const, text }));
}
