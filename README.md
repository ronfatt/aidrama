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
- Optional locked VO input (if provided, system keeps VO text exactly and does not rewrite)
- Scene count selection: `Auto / 20 / 22 / 25`
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
- Optional one-click scene image generation via Gemini API
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
OPENAI_MODEL=gpt-5.1
IMAGE_PROVIDER=gemini
IMAGE_FALLBACK_PROVIDER=
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview
GEMINI_IMAGE_FALLBACK_MODEL=gemini-2.5-flash-image-preview
KLING_API_KEY=your_kling_api_key_here
KLING_IMAGE_ENDPOINT=https://your-kling-image-endpoint
KLING_IMAGE_MODEL=kling-o1-image
KLING_AUTH_HEADER=Authorization
KLING_AUTH_PREFIX=Bearer
```

`OPENAI_MODEL` is optional. If omitted, the app defaults to `gpt-5.1`.
`GEMINI_IMAGE_MODEL` is optional. If omitted, the app defaults to `gemini-3-pro-image-preview`.
`GEMINI_IMAGE_FALLBACK_MODEL` is optional. If omitted, the app falls back to `gemini-2.5-flash-image-preview` when primary model fails.
`IMAGE_PROVIDER` controls image backend (`gemini` or `kling`).
If `IMAGE_PROVIDER=kling`, configure `KLING_API_KEY` and `KLING_IMAGE_ENDPOINT`.
Optional: set `IMAGE_FALLBACK_PROVIDER=gemini` to auto-fallback when Kling fails.

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
   - For one-click image generation:
     - `IMAGE_PROVIDER=gemini` with `GEMINI_API_KEY` (and optional Gemini model vars), or
     - `IMAGE_PROVIDER=kling` with `KLING_API_KEY` + `KLING_IMAGE_ENDPOINT`
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
