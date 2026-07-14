"use client";

import type { TrailLevel } from "@/lib/mia/onboarding";

type Node = { level: TrailLevel; label: string };

const ICONS: Record<TrailLevel, string> = {
  city: "📍",
  benefactor: "🏢",
  category: "🏷️",
};

// Colores de marca del path navegable - deliberadamente distintos de los
// chips del chat (blancos, borde claro): el trail dice "donde estoy", los
// chips dicen "que puedo elegir ahora". No reutilizar el mismo lenguaje visual.
const BAR_BG = "#2A1F4D";
const NODE_INACTIVE_BG = "#3D2E6B";
const NODE_INACTIVE_BORDER = "#52407D";
const LINE_INACTIVE = "#4A3A73";
const LABEL_INACTIVE = "#A79ADC";
const GRADIENT = "linear-gradient(135deg,#7C5CFC,#4C7DFB)";
const LINE_GRADIENT = "linear-gradient(90deg,#7C5CFC,#4C7DFB)";

export default function NavTrail({
  city,
  benefactorLabel,
  categoryLabel,
  onHome,
  onTapLevel,
}: {
  city?: string;
  benefactorLabel?: string;
  categoryLabel?: string;
  onHome: () => void;
  onTapLevel: (level: TrailLevel) => void;
}) {
  const nodes: Node[] = [];
  if (city) nodes.push({ level: "city", label: city });
  if (benefactorLabel) nodes.push({ level: "benefactor", label: benefactorLabel });
  if (categoryLabel) nodes.push({ level: "category", label: categoryLabel });

  return (
    <div
      className="flex items-center overflow-x-auto px-3.5 py-2.5"
      style={{ background: BAR_BG }}
    >
      <button
        type="button"
        onClick={onHome}
        aria-label="Inicio"
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-xs"
        style={{ background: GRADIENT }}
      >
        🏠
      </button>

      {nodes.map((node, i) => {
        const isActive = i === nodes.length - 1;
        return (
          <div key={node.level} className="flex shrink-0 items-center">
            <div
              className="mx-[3px] h-0.5 w-4 shrink-0"
              style={{ background: isActive ? LINE_GRADIENT : LINE_INACTIVE }}
            />
            <button
              type="button"
              onClick={() => onTapLevel(node.level)}
              className="flex shrink-0 items-center gap-1.5"
            >
              <span
                className="flex h-[25px] w-[25px] items-center justify-center rounded-full border text-[11px] text-white"
                style={
                  isActive
                    ? { background: GRADIENT, border: "none", boxShadow: "0 0 0 3px rgba(124,92,252,.35)" }
                    : { background: NODE_INACTIVE_BG, borderColor: NODE_INACTIVE_BORDER }
                }
              >
                {ICONS[node.level]}
              </span>
              <span
                className="max-w-[110px] truncate text-[11.5px] font-bold"
                style={{ color: isActive ? "#FFFFFF" : LABEL_INACTIVE }}
              >
                {node.label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
