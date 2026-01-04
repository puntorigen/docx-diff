# AI-Powered Change Summary Feature

## Overview

Implement an intelligent change summary that describes document differences in human-readable bullet points, similar to the design mockup showing:

```
✨ Changes in the new version include:
  - an updated title (NDA CONTRACT)
  - bolding 'contractor'
  - populating the contract number
  - adding a quote
  - removing part of the subcontracting clause
```

This requires extracting semantic context from changes and using an LLM (Groq) to generate meaningful summaries.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (page.tsx)                         │
├─────────────────────────────────────────────────────────────────────┤
│  1. Compare documents → get mergedJson + diffResult                 │
│  2. Extract enriched changes with context                           │
│  3. POST to /api/summarize-changes                                  │
│  4. Display AI summary in notification card                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    API Route (/api/summarize-changes)               │
├─────────────────────────────────────────────────────────────────────┤
│  1. Receive enriched changes                                        │
│  2. Format prompt with semantic context                             │
│  3. Call Groq API (openai/oss-gpt-120b)                            │
│  4. Return structured bullet points                                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Groq LLM Service                            │
├─────────────────────────────────────────────────────────────────────┤
│  Model: openai/oss-gpt-120b                                         │
│  Output: JSON with 3-6 bullet points                                │
│  Fallback: Basic stats if LLM fails                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Step 1: Enriched Change Extraction

Transform raw diff results into semantically rich change objects:

```typescript
// Input: Raw diff result
{
  segments: [
    { type: 'delete', text: 'SERVICE CONTRACT' },
    { type: 'insert', text: 'NDA CONTRACT' },
    { type: 'equal', text: '...' },
  ],
  formatChanges: [
    { from: 150, to: 160, before: [], after: [{ type: 'bold' }] }
  ]
}

// Output: Enriched changes with context
[
  {
    type: 'replacement',
    oldText: 'SERVICE CONTRACT',
    newText: 'NDA CONTRACT',
    location: {
      nodeType: 'heading',
      headingLevel: 1,
      description: 'document title'
    }
  },
  {
    type: 'format',
    text: 'contractor',
    location: {
      nodeType: 'paragraph',
      paragraphIndex: 2,
      sectionTitle: 'Parties',
      description: 'paragraph in "Parties" section'
    },
    formatDetails: {
      added: ['bold'],
      removed: []
    }
  }
]
```

### Step 2: LLM Prompt Construction

```
You are analyzing changes between two versions of a document.

CHANGES DETECTED:
1. REPLACED in document title (heading level 1):
   "SERVICE CONTRACT" → "NDA CONTRACT"

2. FORMATTED in paragraph 2, section "Parties":
   "contractor" - added bold styling

3. ADDED in header area, Contract No. field:
   "123"

4. ADDED new paragraph after introduction:
   "Fortune favors the brave" (quote)

5. DELETED in section "Delivery of Services", paragraph about subcontracting:
   47 words removed regarding contractor delegation

---

Generate 3 to 6 bullet points summarizing the most important changes.
Focus on WHAT changed and WHERE, in plain English.
Be concise - each bullet should be under 15 words.

Respond in JSON format:
{
  "bullets": [
    "an updated title (NDA CONTRACT)",
    "bolding 'contractor'",
    ...
  ]
}
```

### Step 3: Response Handling

```typescript
// Success response
{
  bullets: [
    "an updated title (NDA CONTRACT)",
    "bolding 'contractor'",
    "populating the contract number",
    "adding a quote",
    "removing part of the subcontracting clause"
  ]
}

// Fallback (if LLM fails)
{
  bullets: [
    "5 text changes detected",
    "2 formatting changes detected"
  ]
}
```

---

## Type Definitions

### `src/lib/types/summary.types.ts`

```typescript
/**
 * Location context for a change
 */
export interface ChangeLocation {
  nodeType: 'heading' | 'paragraph' | 'listItem' | 'tableCell' | 'unknown';
  headingLevel?: number;           // 1-6 for headings
  paragraphIndex?: number;         // 1-based index in document
  sectionTitle?: string;           // Title of enclosing section
  description: string;             // Human-readable location description
}

/**
 * Format change details
 */
export interface FormatDetails {
  added: string[];    // Formats added: ['bold', 'italic', 'underline']
  removed: string[];  // Formats removed
}

/**
 * Enriched change with full context
 */
export interface EnrichedChange {
  type: 'insertion' | 'deletion' | 'replacement' | 'format';
  
  // Text content
  text?: string;           // For insertions/deletions
  oldText?: string;        // For replacements
  newText?: string;        // For replacements
  
  // Location context
  location: ChangeLocation;
  
  // Format-specific
  formatDetails?: FormatDetails;
  
  // Metadata
  charCount?: number;      // Length of changed text
}

/**
 * API request body
 */
export interface SummarizeChangesRequest {
  changes: EnrichedChange[];
  maxBullets?: number;     // Default: 6
}

/**
 * API response
 */
export interface SummarizeChangesResponse {
  bullets: string[];
  generatedAt: string;     // ISO timestamp
  model?: string;          // Model used (for debugging)
  fallback?: boolean;      // True if LLM failed and using fallback
}
```

---

## Code Organization

### File Structure

```
src/lib/
├── services/
│   ├── changeContextExtractor.ts   # Extract enriched changes
│   ├── groqService.ts              # Groq API wrapper
│   └── index.ts                    # Re-exports
├── types/
│   └── summary.types.ts            # TypeScript interfaces
└── utils/
    └── jsonParser.ts               # Fault-tolerant JSON parsing

src/app/
└── api/
    └── summarize-changes/
        └── route.ts                # API endpoint
```

### Design Goals

1. **Simple**: Each file does one thing
2. **Readable**: Clear function names, minimal nesting
3. **Testable**: Pure functions where possible
4. **No over-abstraction**: Avoid unnecessary indirection

---

## Implementation Files

### 1. `src/lib/services/changeContextExtractor.ts`

**Purpose:** Extract enriched changes from merged document (~100 lines)

```typescript
import { EnrichedChange, ChangeLocation } from '../types/summary.types';
import { ProseMirrorJSON } from './documentParser';

/**
 * Main entry point
 */
export function extractEnrichedChanges(mergedJson: ProseMirrorJSON): EnrichedChange[] {
  const changes: EnrichedChange[] = [];
  const context = createInitialContext();
  
  traverseDocument(mergedJson, context, changes);
  
  return groupReplacements(changes);
}

/**
 * Tracking state while traversing
 */
interface TraversalContext {
  currentSection: string | null;  // Last heading text
  paragraphIndex: number;         // Counter for paragraphs
}

function createInitialContext(): TraversalContext {
  return { currentSection: null, paragraphIndex: 0 };
}

/**
 * Recursively walk the document tree
 */
function traverseDocument(
  node: any,
  context: TraversalContext,
  changes: EnrichedChange[]
): void {
  // Update context based on node type
  if (node.type === 'heading') {
    context.currentSection = extractText(node);
  }
  if (node.type === 'paragraph') {
    context.paragraphIndex++;
  }

  // Check for track change marks on text nodes
  if (node.type === 'text' && node.marks) {
    const trackMark = findTrackChangeMark(node.marks);
    if (trackMark) {
      changes.push(createEnrichedChange(node, trackMark, context));
    }
  }

  // Recurse into children
  if (node.content) {
    for (const child of node.content) {
      traverseDocument(child, context, changes);
    }
  }
}

/**
 * Find trackInsert, trackDelete, or trackFormat mark
 */
function findTrackChangeMark(marks: any[]): any | null {
  return marks.find(m => 
    m.type === 'trackInsert' || 
    m.type === 'trackDelete' || 
    m.type === 'trackFormat'
  ) || null;
}

/**
 * Build location description
 */
function describeLocation(nodeType: string, context: TraversalContext): string {
  if (nodeType === 'heading') return 'document title';
  if (context.currentSection) {
    return `paragraph ${context.paragraphIndex} in "${context.currentSection}" section`;
  }
  return `paragraph ${context.paragraphIndex}`;
}

/**
 * Combine adjacent delete+insert into replacements
 */
function groupReplacements(changes: EnrichedChange[]): EnrichedChange[] {
  const result: EnrichedChange[] = [];
  let i = 0;
  
  while (i < changes.length) {
    const current = changes[i];
    const next = changes[i + 1];
    
    // Check if delete followed by insert at same location
    if (current.type === 'deletion' && next?.type === 'insertion' &&
        current.location.description === next.location.description) {
      result.push({
        type: 'replacement',
        oldText: current.text,
        newText: next.text,
        location: current.location,
      });
      i += 2;
    } else {
      result.push(current);
      i++;
    }
  }
  
  return result;
}
```

### 2. `src/lib/services/groqService.ts`

**Purpose:** Simple, resilient wrapper for Groq API calls

**Design Principles:**
- Keep it simple - one class, few methods
- Retry with backoff on transient failures
- Graceful fallback on any error
- No external dependencies beyond groq-sdk

**Simple Implementation:**

```typescript
import Groq from 'groq-sdk';

const DEFAULT_MODEL = 'openai/oss-gpt-120b';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class GroqService {
  private groq: Groq;
  private model: string;

  constructor(apiKey: string, model = DEFAULT_MODEL) {
    this.groq = new Groq({ apiKey });
    this.model = model;
  }

  /**
   * Generate change summary bullets
   */
  async generateSummary(changes: EnrichedChange[]): Promise<string[]> {
    const prompt = buildPrompt(changes);
    const response = await this.complete(prompt);
    return parseBulletsFromResponse(response);
  }

  /**
   * Call Groq API with retries
   */
  private async complete(prompt: string): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.groq.chat.completions.create({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500,
          temperature: 0.3,
        });
        return response.choices[0]?.message?.content || '';
      } catch (error) {
        lastError = error as Error;
        console.warn(`[GroqService] Attempt ${attempt + 1} failed:`, error);
        
        // Don't retry auth errors
        if (this.isAuthError(error)) throw error;
        
        // Wait before retry (exponential backoff)
        if (attempt < MAX_RETRIES - 1) {
          await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
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
```

**Key Points:**
- ~50 lines of code total
- Simple retry loop (no complex abstractions)
- Exponential backoff: 1s → 2s → 4s
- Auth errors fail fast (no point retrying)
- Uses `buildPrompt` and `parseBulletsFromResponse` from shared utils

**Fault-Tolerant JSON Parsing:**

LLMs sometimes produce malformed JSON (trailing commas, unescaped quotes, etc.). We use a multi-step parsing approach:

```typescript
/**
 * Parse LLM response with multiple fallback strategies
 */
function parseBulletsFromResponse(text: string): string[] {
  // Strategy 1: Direct JSON parse
  const direct = tryParseJson(text);
  if (direct) return direct;
  
  // Strategy 2: Extract JSON block from response (LLM may add explanation)
  const jsonBlock = text.match(/\{[\s\S]*"bullets"[\s\S]*\}/);
  if (jsonBlock) {
    const extracted = tryParseJson(jsonBlock[0]);
    if (extracted) return extracted;
  }
  
  // Strategy 3: Fix common JSON errors and retry
  const fixed = tryParseJson(fixCommonJsonErrors(text));
  if (fixed) return fixed;
  
  // Strategy 4: Extract bullet-like lines from plain text
  return extractBulletsFromText(text);
}

/**
 * Attempt JSON parse, return null on failure
 */
function tryParseJson(text: string): string[] | null {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.bullets)) {
      return parsed.bullets.filter(b => typeof b === 'string');
    }
    if (Array.isArray(parsed)) {
      return parsed.filter(b => typeof b === 'string');
    }
  } catch {
    // Silent fail, try next strategy
  }
  return null;
}

/**
 * Fix common LLM JSON mistakes
 */
function fixCommonJsonErrors(text: string): string {
  return text
    // Remove trailing commas before ] or }
    .replace(/,(\s*[}\]])/g, '$1')
    // Fix unescaped newlines in strings
    .replace(/(?<!\\)\n/g, '\\n')
    // Remove markdown code fences
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    // Trim whitespace
    .trim();
}

/**
 * Last resort: extract lines that look like bullet points
 */
function extractBulletsFromText(text: string): string[] {
  const lines = text.split('\n');
  return lines
    .map(line => line.replace(/^[\d\-•*]+[.):\s]*/, '').trim())
    .filter(line => line.length > 5 && line.length < 100)
    .slice(0, 6);
}
```

This approach is:
- **Resilient**: Handles malformed JSON gracefully
- **Simple**: Just a few small functions, no external libraries
- **Predictable**: Always returns an array of strings

**Error Logging:**

```typescript
private log(level: 'info' | 'warn' | 'error', message: string, meta?: object) {
  const timestamp = new Date().toISOString();
  console[level](`[GroqService ${timestamp}] ${message}`, meta || '');
}

// Usage in withRetry:
this.log('warn', `Attempt ${attempt + 1} failed, retrying...`, {
  error: error.message,
  nextDelayMs: delay
});

```

### 3. `src/lib/utils/jsonParser.ts`

**Purpose:** Fault-tolerant JSON parsing (~40 lines)

```typescript
/**
 * Parse LLM response into bullet array with multiple fallback strategies
 */
export function parseBulletsFromResponse(text: string): string[] {
  // Strategy 1: Direct parse
  let result = tryParse(text);
  if (result) return result;

  // Strategy 2: Extract JSON block
  const jsonMatch = text.match(/\{[\s\S]*"bullets"[\s\S]*\}/);
  if (jsonMatch) {
    result = tryParse(jsonMatch[0]);
    if (result) return result;
  }

  // Strategy 3: Fix common errors and retry
  result = tryParse(fixJsonErrors(text));
  if (result) return result;

  // Strategy 4: Extract bullet-like lines
  return extractBulletsFromText(text);
}

function tryParse(text: string): string[] | null {
  try {
    const data = JSON.parse(text);
    const bullets = data.bullets || data;
    if (Array.isArray(bullets)) {
      return bullets.filter(b => typeof b === 'string').slice(0, 6);
    }
  } catch {
    // Silent fail
  }
  return null;
}

function fixJsonErrors(text: string): string {
  return text
    .replace(/,(\s*[}\]])/g, '$1')     // Trailing commas
    .replace(/```json?\s*/g, '')        // Code fences
    .replace(/```\s*/g, '')
    .trim();
}

function extractBulletsFromText(text: string): string[] {
  return text.split('\n')
    .map(line => line.replace(/^[\d\-•*]+[.):\s]*/, '').trim())
    .filter(line => line.length > 5 && line.length < 100)
    .slice(0, 6);
}
```

### 4. `src/app/api/summarize-changes/route.ts`

**Purpose:** Next.js API route (~40 lines)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { GroqService } from '@/lib/services/groqService';
import { EnrichedChange } from '@/lib/types/summary.types';

export async function POST(request: NextRequest) {
  const { changes } = await request.json();

  // Validate
  if (!Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json({ bullets: ['No changes to summarize'] });
  }

  // Check API key
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      bullets: fallbackSummary(changes),
      fallback: true,
    });
  }

  // Call Groq
  try {
    const groq = new GroqService(apiKey);
    const bullets = await groq.generateSummary(changes);
    return NextResponse.json({ bullets });
  } catch (error) {
    console.error('[summarize-changes] Error:', error);
    return NextResponse.json({
      bullets: fallbackSummary(changes),
      fallback: true,
    });
  }
}

function fallbackSummary(changes: EnrichedChange[]): string[] {
  const counts = {
    replacement: 0,
    insertion: 0,
    deletion: 0,
    format: 0,
  };
  
  changes.forEach(c => counts[c.type]++);
  
  const bullets: string[] = [];
  if (counts.replacement) bullets.push(`${counts.replacement} text replacement(s)`);
  if (counts.insertion) bullets.push(`${counts.insertion} addition(s)`);
  if (counts.deletion) bullets.push(`${counts.deletion} deletion(s)`);
  if (counts.format) bullets.push(`${counts.format} formatting change(s)`);
  
  return bullets.length ? bullets : ['No significant changes'];
}
```

### 4. Update `src/app/page.tsx`

**Changes needed:**

```typescript
// New state
const [aiSummary, setAiSummary] = useState<string[] | null>(null);
const [summaryLoading, setSummaryLoading] = useState(false);

// After comparison completes, trigger AI summary
useEffect(() => {
  if (stage === 'result' && comparison.mergedJson && comparison.diffResult) {
    generateAiSummary();
  }
}, [stage, comparison.mergedJson]);

async function generateAiSummary() {
  setSummaryLoading(true);
  setAiSummary(null);
  
  try {
    // Extract enriched changes
    const enrichedChanges = extractEnrichedChanges(
      comparison.mergedJson!,
      comparison.diffResult!
    );
    
    // Skip if no changes
    if (enrichedChanges.length === 0) {
      setAiSummary(['No changes detected']);
      return;
    }
    
    // Call API
    const response = await fetch('/api/summarize-changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: enrichedChanges, maxBullets: 6 })
    });
    
    const data = await response.json();
    setAiSummary(data.bullets);
  } catch (error) {
    console.error('AI summary failed:', error);
    // Fallback handled by API
  } finally {
    setSummaryLoading(false);
  }
}
```

**Update notification card:**

```tsx
{/* Change summary notification card */}
{changeSet && showChangeSummary && (
  <div className="...notification card styles...">
    <h3>Changes detected in new version</h3>
    
    {summaryLoading ? (
      <p className="text-sm text-gray-500">
        <span className="animate-pulse">✨ Analyzing changes...</span>
      </p>
    ) : aiSummary ? (
      <ul className="text-sm space-y-1">
        {aiSummary.map((bullet, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-blue-500">•</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-gray-600">
        {changeSet.summary.totalChanges} changes found
      </p>
    )}
  </div>
)}
```

---

## Environment Setup

### `.env.local`

```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxx
```

### Vercel Environment Variables

Add `GROQ_API_KEY` in Vercel project settings → Environment Variables.

---

## Dependencies

```bash
npm install groq-sdk
```

---

## Prompt Engineering

### Soft Schema Enforcement

Instead of using strict JSON schemas, we guide the LLM with clear examples and format instructions. This is more flexible and works across different models.

### Combined Prompt (System + User)

```typescript
function buildPrompt(changes: EnrichedChange[]): string {
  const formattedChanges = formatChangesForPrompt(changes);
  
  return `You are a document comparison assistant. Summarize the changes between two document versions.

CHANGES DETECTED:
${formattedChanges}

---

INSTRUCTIONS:
- Generate 3 to 6 bullet points summarizing the most important changes
- Focus on WHAT changed and WHERE (be specific)
- Use plain English, under 15 words per bullet
- Start each bullet with lowercase (they follow "Changes include:")

OUTPUT FORMAT:
Return ONLY a JSON object with a "bullets" array. Example:
{"bullets": ["an updated title (NDA CONTRACT)", "bolding 'contractor'", "removing the subcontracting clause"]}

Your response:`;
}
```

### Formatting Changes for the Prompt

```typescript
function formatChangesForPrompt(changes: EnrichedChange[]): string {
  // Limit to top 20 changes to avoid token overflow
  const topChanges = changes.slice(0, 20);
  
  return topChanges.map((change, i) => {
    const num = i + 1;
    const loc = change.location.description;
    
    switch (change.type) {
      case 'replacement':
        const oldText = truncate(change.oldText || '', 50);
        const newText = truncate(change.newText || '', 50);
        return `${num}. REPLACED in ${loc}: "${oldText}" → "${newText}"`;
      
      case 'insertion':
        const addedText = truncate(change.text || '', 80);
        return `${num}. ADDED in ${loc}: "${addedText}"`;
      
      case 'deletion':
        const removedText = truncate(change.text || '', 80);
        return `${num}. DELETED in ${loc}: "${removedText}"`;
      
      case 'format':
        const formats = change.formatDetails?.added.join(', ') || 'formatting';
        return `${num}. FORMATTED in ${loc}: "${change.text}" → ${formats}`;
      
      default:
        return `${num}. CHANGED in ${loc}`;
    }
  }).join('\n');
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}
```

### Why Soft Enforcement Works

| Approach | Pros | Cons |
|----------|------|------|
| **Strict Schema** | Guaranteed structure | Model may refuse, errors on mismatch |
| **Soft Enforcement** | Flexible, works with any model | Need fallback parsing |

Our soft enforcement + fault-tolerant parsing gives us the best of both worlds.

---

## Edge Cases

| Case | Handling |
|------|----------|
| No changes | Return `["No changes detected"]` |
| 50+ changes | Truncate to top 20 most significant |
| Very long text (>100 chars) | Truncate with "..." |
| LLM timeout (>10s) | Use fallback summary |
| LLM error | Use fallback summary |
| No API key | Use fallback summary |
| Only format changes | Focus summary on styling |
| Only deletions | Describe what was removed |

---

## Future Enhancements

1. **"View All Changes" Modal**: Show complete list with AI descriptions for each
2. **Change Categories**: Group by type (content, formatting, structure)
3. **Importance Ranking**: Let user configure what's "important"
4. **Multiple Languages**: Support document comparison in other languages
5. **Caching**: Cache summaries for identical change sets

---

## Testing Checklist

- [ ] Basic comparison with mixed changes
- [ ] Document with only format changes
- [ ] Document with only insertions
- [ ] Document with only deletions
- [ ] Large document (100+ changes)
- [ ] API key missing (fallback)
- [ ] Groq API error (fallback)
- [ ] Groq API timeout (fallback)
- [ ] Empty document comparison
- [ ] Non-English document content

---

## Estimated Timeline

| Task | Time |
|------|------|
| Type definitions | 30 min |
| Change context extractor | 2 hours |
| Groq service + JSON parser | 1 hour |
| API route | 30 min |
| Frontend integration | 1 hour |
| Testing & polish | 1 hour |
| **Total** | **~6 hours** |

---

## Summary: Keeping It Simple

### Total New Code

| File | Lines | Purpose |
|------|-------|---------|
| `summary.types.ts` | ~30 | Type definitions |
| `changeContextExtractor.ts` | ~100 | Extract changes with context |
| `groqService.ts` | ~50 | API wrapper with retries |
| `jsonParser.ts` | ~40 | Fault-tolerant parsing |
| `route.ts` | ~40 | API endpoint |
| **Total** | **~260 lines** | |

### Key Decisions

1. **No external JSON parsing library** - Simple regex fixes handle 99% of cases
2. **No complex retry framework** - Simple for-loop with exponential backoff
3. **Soft schema enforcement** - Prompt guides output, parser handles variations
4. **Single responsibility** - Each file does one thing well
5. **Graceful degradation** - Always returns something useful, even on errors

### What We're NOT Doing

- ❌ Complex state machines for retries
- ❌ Streaming responses (overkill for 6 bullets)
- ❌ Caching (summaries are fast enough)
- ❌ Multiple LLM providers (just Groq for now)
- ❌ Complex prompt chaining

This keeps the implementation maintainable and easy to debug.
