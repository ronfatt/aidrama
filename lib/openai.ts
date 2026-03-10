import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY environment variable.");
  }

  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return client;
}

export function getModelName(): string {
  return process.env.OPENAI_MODEL || "gpt-5.1-mini";
}

export function getBeatModelName(): string {
  return process.env.OPENAI_BEAT_MODEL || "gpt-4.1-mini";
}

export function getFilmPackModelName(): string {
  return process.env.OPENAI_FILM_PACK_MODEL || "gpt-4.1-mini";
}

export function getCompanionModelName(): string {
  return process.env.OPENAI_COMPANION_MODEL || "gpt-4.1-mini";
}
