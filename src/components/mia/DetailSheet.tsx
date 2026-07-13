"use client";

import type { DetailSheetMessage } from "@/lib/mia/uiMessages";

export default function DetailSheet({
  message,
  onClose,
}: {
  message: DetailSheetMessage;
  onClose: () => void;
}) {
  const links = [
    message.links.go
      ? { href: message.links.go, label: "Cómo llegar", icon: "📍" }
      : null,
    message.links.web ? { href: message.links.web, label: "Sitio web", icon: "🌐" } : null,
    message.links.social
      ? { href: message.links.social, label: "Redes", icon: "📷" }
      : null,
  ].filter((l): l is { href: string; label: string; icon: string } => l !== null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white sm:max-w-sm sm:rounded-3xl">
        <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-zinc-200 sm:hidden" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-sm text-zinc-500"
        >
          ✕
        </button>

        <div
          className="mx-4 mt-4 flex h-36 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg,#6C4CF1,#22D3EE)" }}
        >
          {message.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={message.photoUrl}
              alt=""
              className="h-full w-full rounded-2xl object-cover"
            />
          ) : (
            <span className="text-3xl font-black opacity-80">
              {message.title.charAt(0)}
            </span>
          )}
        </div>

        <div className="px-5 pb-6 pt-4">
          <span className="mb-2 inline-block rounded-lg bg-mia-violet/10 px-2.5 py-1 text-xs font-extrabold text-mia-violet">
            {message.tag}
          </span>
          <h3 className="text-lg font-extrabold leading-snug text-mia-ink">
            {message.title}
          </h3>
          {message.description && (
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              {message.description}
            </p>
          )}

          {message.details.map((d, i) => (
            <div
              key={i}
              className="flex gap-2 border-t border-zinc-100 py-2.5 text-[13px]"
            >
              <div className="w-24 shrink-0 font-semibold text-zinc-400">{d.label}</div>
              <div className="font-semibold text-mia-ink">{d.value}</div>
            </div>
          ))}

          {links.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {links.map((l, i) => (
                <a
                  key={i}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={
                    i === 0
                      ? "flex-1 rounded-2xl bg-gradient-to-r from-mia-violet to-mia-cyan px-3 py-2.5 text-center text-xs font-bold text-white"
                      : "flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-center text-xs font-bold text-mia-ink"
                  }
                >
                  {l.icon} {l.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
