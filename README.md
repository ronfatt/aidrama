# Film Pack Studio

Film Pack Studio is a production-ready Next.js web app for rapid AI film pre-production of short videos. Paste a source script and generate one structured film pack with preserved VO, scene-by-scene breakdown, and Kling-ready image/video prompts.

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS (v4)
- OpenAI Responses API (server-side route)
- Zod validation

## Features

- Script input with optional title and reference tag (e.g. `[DARREN_REF]`)
- Scene count selection: `20 / 22 / 25`
- Tone/style selection:
  - `cinematic documentary`
  - `psychological drama`
  - `NGO educational`
  - `emotional realism`
- Structured output:
  - Preserved 80–90 second VO
  - 20–25 scene cards
  - Per-scene fields:
    - Scene number
    - VO line
    - Shot type
    - Scene purpose
    - Importance (A/B/C)
    - Reference image yes/no
    - Kling O1 image prompt
    - Kling image-to-video prompt
    - Camera movement
    - Lighting/color notes
- Copy controls:
  - Full film pack
  - Scene image prompt
  - Scene video prompt
- Exports:
  - Download `.txt`
  - Download `.md`
- API error handling and output validation
- Dark cinematic responsive UI

## Project Structure

- `app/`
- `components/`
- `lib/`
- `lib/prompts/`
  - `systemPrompt.ts`
  - `stylePrompt.ts`
  - `sceneRules.ts`
  - `outputSchema.ts`
  - `promptBuilder.ts`
- `types/`
- `app/api/generate/route.ts`

## Environment Variables

Copy `.env.example` to `.env.local` and set:

```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_MODEL` is optional. If omitted, the app defaults to `gpt-4.1-mini`.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Run development server:

```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket.
2. Import the project in [Vercel](https://vercel.com/new).
3. Set environment variables in Vercel Project Settings:
   - `OPENAI_API_KEY`
   - Optional: `OPENAI_MODEL`
4. Deploy.

No code changes are required for Vercel deployment.

## API Endpoint

- `POST /api/generate`
- Validates incoming settings with Zod
- Calls OpenAI Responses API with strict JSON schema
- Validates returned JSON before responding
- Supports strict mode toggle:
  - `settings.strictMode` (camelCase) or `strict_mode` (snake_case)
  - Default: `true` (stability-first)

## Notes

- The generation prompt enforces Singapore-specific setting and visual constraints.
- The server route rejects malformed responses and mismatched scene counts.
- This app is designed for practical production usage, not toy output formatting.
