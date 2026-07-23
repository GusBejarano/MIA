"use client";

import { useId, useState } from "react";
import type { ChipSelectMessage } from "@/lib/mia/uiMessages";

/** Flecha de retorno con el gradiente de marca de MIA (#7C5CFC → #4C7DFB). */
function BackIcon() {
  const gradientId = useId();
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="24" x2="24" y2="0">
          <stop offset="0%" stopColor="#7C5CFC" />
          <stop offset="100%" stopColor="#4C7DFB" />
        </linearGradient>
      </defs>
      <path
        d="M10 6L4 12L10 18"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 12H15C17.7614 12 20 14.2386 20 17V18"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ChipSelect({
  message,
  locked,
  resolvedSelection,
  onConfirm,
}: {
  message: ChipSelectMessage;
  locked: boolean;
  resolvedSelection?: string[];
  onConfirm: (values: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  const visibleOptions = locked
    ? message.options.filter((o) => resolvedSelection?.includes(o.value))
    : message.options;

  function toggle(value: string) {
    if (locked) return;
    if (!message.multi) {
      onConfirm([value]);
      return;
    }
    setSelected((prev) => {
      if (prev.includes(value)) return prev.filter((v) => v !== value);
      if (message.maxSelect && prev.length >= message.maxSelect) return prev;
      return [...prev, value];
    });
  }

  return (
    <div className="mt-1 w-full">
      <div className="flex flex-wrap gap-2">
        {visibleOptions.map((o) => {
          const isSelected = locked || selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              disabled={locked}
              onClick={() => toggle(o.value)}
              className={
                isSelected
                  ? "flex items-center gap-1.5 rounded-full border border-transparent bg-gradient-to-r from-mia-violet to-mia-cyan px-3 py-2 text-sm font-semibold text-white"
                  : "flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-mia-ink"
              }
            >
              {o.label}
              {o.icon === "back" && <BackIcon />}
              {o.icon === undefined && (
                <span
                  className={
                    isSelected
                      ? "rounded-full bg-white/25 px-1.5 py-0.5 text-xs font-bold"
                      : "rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs font-bold text-zinc-500"
                  }
                >
                  {o.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!locked && message.multi && (
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={() => onConfirm(selected)}
          className="mt-3 rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-5 py-2.5 text-sm font-semibold text-white disabled:hidden"
        >
          Continuar ({selected.length}
          {message.maxSelect ? `/${message.maxSelect}` : ""})
        </button>
      )}

      {!locked && message.allowFreeText && (
        <p className="mt-2 flex items-center gap-1 text-xs text-zinc-400">
          ¿No ves el tuyo? Escríbelo abajo, también cuenta.
        </p>
      )}
    </div>
  );
}
