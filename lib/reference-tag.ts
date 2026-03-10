export function normalizeReferenceTag(input?: string | null): string {
  const raw = (input || "").trim();
  if (!raw) return "";

  const stripped = raw.replace(/^\[/, "").replace(/\]$/, "").trim();
  const normalized = stripped
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

  return normalized ? `[${normalized}]` : "";
}
