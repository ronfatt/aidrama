"use client";

import { useState } from "react";
import { getRuleChecklist } from "@/lib/constants";
import type { ProjectMode } from "@/types/film-pack";

export function RulesPanel({ projectMode }: { projectMode: ProjectMode }) {
  const rules = getRuleChecklist(projectMode);
  const [checked, setChecked] = useState<boolean[]>(rules.map(() => true));

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-4">
      <h3 className="mb-3 text-sm font-semibold tracking-wide text-zinc-200">Generation Rules</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {rules.map((rule, index) => (
          <label
            key={rule}
            className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-xs text-zinc-300"
          >
            <input
              type="checkbox"
              checked={checked[index]}
              onChange={() =>
                setChecked((prev) => prev.map((item, i) => (i === index ? !item : item)))
              }
              className="mt-0.5 h-4 w-4 accent-cyan-400"
            />
            <span>{rule}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
