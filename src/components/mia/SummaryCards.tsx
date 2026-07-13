import type { SummaryCardsMessage } from "@/lib/mia/uiMessages";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function SummaryCards({ message }: { message: SummaryCardsMessage }) {
  return (
    <div className="mt-1 flex w-full flex-col gap-2">
      {message.cards.map((c, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 px-3 py-2.5"
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
            style={{ background: c.color }}
          >
            {initials(c.title)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-mia-ink">{c.title}</div>
            <div className="truncate text-xs text-zinc-400">{c.subtitle}</div>
          </div>
          <div className="shrink-0 rounded-xl bg-white px-2.5 py-1 text-sm font-extrabold text-mia-violet">
            {c.count}
          </div>
        </div>
      ))}
    </div>
  );
}
