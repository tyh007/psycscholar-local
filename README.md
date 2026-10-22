# PsycScholar

A literature-review workspace prototype for psychology papers, with PDF text extraction, structured AI-assisted summaries, custom fields, cross-paper analysis and exports.

The repository name includes `local`, but the current application uses **Supabase authentication and database storage**. Selecting local Ollama for AI processing does not make the entire application offline or local-only.

## Current workflow

1. Sign in using Supabase email authentication.
2. Create a literature project and import PDF papers.
3. Extract text in the browser with PDF.js.
4. Use configured Ollama or Gemini processing to draft structured fields and custom-field values.
5. Review/edit extracted content, compare papers and export selected information.

The code includes CSV, Excel, JSON, PDF and APA-style reference export paths. AI-generated summaries and reference formatting require human verification; they are not validated systematic-review outputs.

## Stack and structure

```text
src/app/             Next.js App Router UI and API routes
src/components/      Project, paper, extraction, analysis and export interfaces
src/hooks/           Upload and extraction state
src/lib/             PDF processing, AI adapters, prompts and client data access
src/lib/server/      Supabase authentication, per-owner data access and cloud AI
supabase/schema.sql  Schema and row-level access policies
public/pdf.worker.min.js   Vendored PDF.js worker (must match pdfjs-dist)
```

## Setup

Prerequisites: Node.js 22.13 or newer, npm and a Supabase project.

```bash
npm ci
cp .env.example .env.local
```

1. Apply `supabase/schema.sql` to a **fresh development Supabase database** after reviewing it. The file also contains compatibility changes; do not run it casually against an existing dataset.
2. Enable email authentication and configure Supabase's site/redirect URLs for `http://localhost:3000`.
3. Fill in the public URL/anon key and the server-only Supabase credentials in `.env.local`. The service-role key must remain server-side.
4. Optionally configure server-side Gemini credentials. For local processing, start Ollama, install the selected model and configure the browser's AI settings. Browser-to-Ollama access may require an explicit allowed origin.
5. Run `npm run dev` and open `http://localhost:3000`.

Production builds fetch the Geist fonts through `next/font/google`, so the build environment needs network access. Missing backend configuration prevents the authenticated workflow; no sample Supabase dataset or user account is bundled.

## Verification commands

```bash
npm test
npm run typecheck
npm run lint
npm run build
# or: npm run check
```

Build/type/lint checks do not verify a live Supabase account, external AI service, PDF corpus or every browser workflow. The unit tests cover concurrent request credential isolation and core/custom export-field lookup. There is no comprehensive automated end-to-end suite in this repository.

## Privacy and prototype boundaries

- Projects, paper text and extracted fields use Supabase. Cloud extraction sends selected text to the configured AI service.
- AI settings can retain a user-supplied key in browser local storage. Use a trusted browser profile and remove credentials when finished.
- Local heuristics and model fallbacks can produce incomplete or inaccurate fields. Inspect the source paper before relying on a summary.
- This is a research-tool prototype, not a validated screening instrument or completed production service.
- The application has its own product identity. It should be a separate website case study, not presented as the implementation of the Students and Generative AI qualitative study or Delibra.

Original source modules are preserved, including alternative extraction implementations. Their presence is not evidence that every implementation is used by the active interface. No open-source license or sole-authorship claim has been added by this cleanup.
