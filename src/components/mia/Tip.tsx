import type { TipMessage } from "@/lib/mia/uiMessages";

/** Mismo patron visual de bajo perfil que "¿No ves el tuyo?" en ChipSelect - "hint" identico, "reminder" con un poco mas de peso (ya lo uso antes, es un recordatorio, no un descubrimiento). */
export default function Tip({ message }: { message: TipMessage }) {
  return (
    <p
      className={
        message.tone === "hint"
          ? "mt-1 text-xs text-zinc-400"
          : "mt-1 text-xs font-semibold text-mia-violet"
      }
    >
      {message.text}
    </p>
  );
}
