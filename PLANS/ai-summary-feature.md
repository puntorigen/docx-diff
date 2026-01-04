# AI-Powered Change Summary Feature

## Overview

The AI summary feature analyzes document changes and generates human-readable bullet points describing what changed and where. Each bullet is color-coded by type (replacement, insertion, deletion, format).

**Example output:**
```
Main changes detected in new version:
• [blue]  replaced company name 'Okidoki SpA' with 'Superdoc Inc' in Client section
• [yellow] emphasized 'Chile' with bold in the service provider's address  
• [red]   removed the delivery deadline clause from Terms of Service
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (page.tsx)                          │
│  1. Comparison completes → mergedJson available                  │
│  2. extractEnrichedChanges(mergedJson) → EnrichedChange[]       │
│  3. Call Server Action: summarizeChanges(changes)               │
│  4. Display colored bullets in notification card                 │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼ (internal RPC, no public URL)
┌─────────────────────────────────────────────────────────────────┐
│              Server Action (lib/actions/summarize.ts)            │
│  - 'use server' directive                                        │
│  - No public API endpoint (secure by design)                     │
│  - Calls GroqService.generateSummary(changes)                    │
│  - Returns SummaryBullet[] (or fallback)                         │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     GroqService                                  │
│  Model: openai/gpt-oss-120b                                     │
│  Retries: 3 with exponential backoff                            │
│  Prompt: Rich context with surrounding text + section names      │
│  Output: JSON { bullets: [{ type, text }] }                     │
└─────────────────────────────────────────────────────────────────┘
```

**Security**: Using a Server Action instead of an API route means there's no public `/api/...` endpoint. The summarization can only be triggered by the frontend - external callers cannot access it.

---

## File Structure

```
src/
├── lib/
│   ├── actions/
│   │   └── summarize.ts                # Server Action (~60 lines)
│   ├── services/
│   │   ├── changeContextExtractor.ts   # 285 lines
│   │   └── groqService.ts              # 263 lines
│   └── types/
│       └── summary.types.ts            # 62 lines
```

---

## Type Definitions

**`src/lib/types/summary.types.ts`**

```typescript
export interface ChangeLocation {
  nodeType: 'heading' | 'paragraph' | 'listItem' | 'tableCell' | 'unknown';
  headingLevel?: number;
  sectionTitle?: string;
  description: string;
}

export interface FormatDetails {
  added: string[];
  removed: string[];
}

export interface EnrichedChange {
  type: 'insertion' | 'deletion' | 'replacement' | 'format';
  text?: string;
  oldText?: string;
  newText?: string;
  location: ChangeLocation;
  formatDetails?: FormatDetails;
  charCount?: number;
  surroundingText?: string;  // Key: the sentence containing the change
}

export interface SummaryBullet {
  type: 'format' | 'replacement' | 'insertion' | 'deletion' | 'other';
  text: string;
}

export interface SummarizeChangesResponse {
  bullets: SummaryBullet[];
  generatedAt: string;
  fallback?: boolean;
}
```

---

## Change Context Extraction

**`src/lib/services/changeContextExtractor.ts`**

Traverses the merged document and extracts changes with semantic context:

```typescript
export function extractEnrichedChanges(mergedJson: ProseMirrorJSON): EnrichedChange[] {
  const changes: EnrichedChange[] = [];
  const context: TraversalContext = {
    currentSection: null,
    currentParagraphText: '',
    currentNodeType: 'unknown',
  };

  traverseDocument(mergedJson, context, changes);
  return groupReplacements(changes);
}
```

**Key features:**
- Tracks current section (heading text) as context
- Extracts full paragraph text to find surrounding sentence
- Groups adjacent delete+insert into single "replacement"
- Extracts format change details (what was added/removed)

**Surrounding text extraction:**
```typescript
function extractSurroundingSentence(changedText: string, paragraphText: string): string {
  // Split paragraph by sentence breaks (. ; ! ?)
  // Find which sentence contains the changed text
  // Return that sentence (truncated to 200 chars max)
}
```

This is critical for LLM context - instead of just "changed 4 to 6", the LLM sees the full sentence like "Registro de Comercio Nº 2024-00123-4 de Santiago".

---

## Groq Service

**`src/lib/services/groqService.ts`**

Simple wrapper with retry logic:

```typescript
export class GroqService {
  private groq: Groq;
  private model = 'openai/gpt-oss-120b';

  async generateSummary(changes: EnrichedChange[]): Promise<SummaryBullet[]> {
    const prompt = buildPrompt(changes);
    const response = await this.complete(prompt);
    return parseBulletsFromResponse(response);
  }

  private async complete(prompt: string): Promise<string> {
    // 3 retries with exponential backoff (1s → 2s → 4s + jitter)
    // Auth errors fail fast
  }
}
```

**LLM Settings:**
- `max_tokens: 1500` (no artificial limits on output)
- `temperature: 0.4`

---

## Prompt Design

The prompt provides rich context and clear instructions:

```typescript
function buildPrompt(changes: EnrichedChange[]): string {
  return `You are analyzing changes between two versions of a legal/business document...

CHANGES DETECTED:
${formatChangesForPrompt(changes)}

INSTRUCTIONS:
1. For each change, describe WHAT changed and WHERE
2. Use section names (e.g., "in the Party Identification section")
3. AVOID "paragraph 5" or "line 12" - users can't count paragraphs
4. For deletions: SUMMARIZE what was removed, don't quote verbatim
   Include the location where it was removed from

OUTPUT FORMAT:
{
  "bullets": [
    {"type": "replacement", "text": "replaced company name 'Okidoki SpA' with 'Superdoc Inc' in Client section"},
    {"type": "format", "text": "emphasized 'Chile' with bold in the service provider's address"}
  ]
}`;
}
```

**Change formatting for prompt:**
```typescript
function formatChangesForPrompt(changes: EnrichedChange[]): string {
  // Limit to top 15 changes
  // For each change, include:
  //   - Type (Replacement, Insertion, Deletion, Formatting)
  //   - The actual text changed
  //   - Section name (if available)
  //   - Surrounding sentence (for context)
  // For long deletions: truncate to 100 chars + "(X chars total)"
}
```

---

## Fault-Tolerant Parsing

LLMs sometimes produce malformed JSON. We handle it:

```typescript
function parseBulletsFromResponse(text: string): SummaryBullet[] {
  // Strategy 1: Direct JSON.parse
  // Strategy 2: Extract JSON block with regex
  // Strategy 3: Fix common errors (trailing commas, code fences)
  // Strategy 4: Extract bullet-like lines from plain text
}

function normalizeType(type: string): SummaryBullet['type'] {
  // Handle variations: 'format' | 'formatting' → 'format'
  //                    'insertion' | 'added' | 'addition' → 'insertion'
  //                    etc.
}
```

---

## Server Action

**`src/lib/actions/summarize.ts`**

```typescript
'use server';

export async function summarizeChanges(changes: EnrichedChange[]): Promise<SummaryBullet[]> {
  if (!Array.isArray(changes) || changes.length === 0) {
    return [{ type: 'other', text: 'No changes to summarize' }];
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return fallbackSummary(changes);
  }

  try {
    const groq = new GroqService(apiKey);
    return await groq.generateSummary(changes);
  } catch (error) {
    return fallbackSummary(changes);
  }
}
```

**Why Server Action instead of API Route?**
- No public `/api/...` endpoint exists
- Cannot be called externally (curl, Postman, etc.)
- Only the frontend can trigger it
- Simpler code (no HTTP request/response handling)

---

## Frontend Integration

**`src/app/page.tsx`**

```typescript
import { summarizeChanges } from '@/lib/actions/summarize';

const [aiSummary, setAiSummary] = useState<SummaryBullet[] | null>(null);
const [summaryLoading, setSummaryLoading] = useState(false);

// Trigger when comparison completes
useEffect(() => {
  if (stage === 'result' && comparison.mergedJson && !aiSummary && !summaryLoading) {
    generateAiSummary();
  }
}, [stage, comparison.mergedJson]);

async function generateAiSummary() {
  setSummaryLoading(true);
  const enrichedChanges = extractEnrichedChanges(comparison.mergedJson!);
  
  // Direct Server Action call (no fetch, no public URL)
  const bullets = await summarizeChanges(enrichedChanges);
  setAiSummary(bullets);
  setSummaryLoading(false);
}
```

**UI rendering with color coding:**
```tsx
{aiSummary.map((bullet, i) => (
  <li key={i} className="flex items-start gap-2">
    <span className={
      bullet.type === 'format' ? 'text-yellow-600' :
      bullet.type === 'replacement' ? 'text-blue-600' :
      bullet.type === 'insertion' ? 'text-green-600' :
      bullet.type === 'deletion' ? 'text-red-600' : 'text-gray-600'
    }>•</span>
    <span>{bullet.text}</span>
  </li>
))}
```

---

## Environment Setup

```env
# .env.local
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxx
```

---

## Key Design Decisions

| Decision | Why |
|----------|-----|
| **Surrounding text context** | LLM needs sentence context to understand what "4 → 6" means |
| **Section names over paragraph numbers** | Users can't count paragraphs, sections are navigable |
| **Structured output (type + text)** | Enables color-coding in UI |
| **No max_tokens limit** | Let LLM write good bullets, not truncated ones |
| **Soft schema + fallback parsing** | LLMs sometimes produce malformed JSON |
| **Summarize deletions** | Long verbatim quotes aren't useful |

---

## What We Learned

1. **Context is everything**: Raw "changed X to Y" is useless without surrounding text
2. **Section names > paragraph numbers**: Users navigate by sections
3. **Structured output enables UI**: Type field allows color-coding
4. **Don't limit the LLM**: Remove word count restrictions, let it write naturally
5. **Always have a fallback**: Basic counts are better than nothing
