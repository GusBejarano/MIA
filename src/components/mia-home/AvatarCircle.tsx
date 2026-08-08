"use client";

import { useState } from "react";
import type { AvatarKey } from "@/lib/mia/store";

// Los 3 avatares van en public/avatars/avatar-{negro|verde|fucsia}.png (los
// 3 valores que ya guarda la BD, ver supabase/2026.08.07-...sql). Mientras
// ese archivo no exista todavia para una clave puntual, AvatarCircle cae a
// un circulo de color solido en vez de un icono roto - mismo patron de
// fallback que BenefitThumbnail.tsx.
export const AVATAR_FALLBACK_COLOR: Record<AvatarKey, string> = {
  negro: "bg-mia-ink",
  verde: "bg-mia-violet",
  fucsia: "bg-mia-cyan",
};
export const AVATAR_KEYS = Object.keys(AVATAR_FALLBACK_COLOR) as AvatarKey[];

/**
 * Circulo de avatar reutilizable - lo usa ProfileSheet.tsx (grande + picker
 * chico) y el boton de perfil del header (MiaHome.tsx, chico, antes
 * mostraba el logo de MIA fijo en vez del avatar real del usuario).
 */
export default function AvatarCircle({
  avatar,
  size,
  selected,
  onClick,
}: {
  avatar: AvatarKey;
  size: "sm" | "lg";
  selected?: boolean;
  onClick?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const dimension = size === "lg" ? "h-16 w-16" : "h-10 w-10";
  const ring = selected ? "ring-2 ring-offset-2 ring-mia-violet" : "";

  const content = failed ? (
    <div className={`${dimension} rounded-full ${AVATAR_FALLBACK_COLOR[avatar]}`} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- fallback a color si el PNG todavia no existe en public/avatars/
    <img
      src={`/avatars/avatar-${avatar}.png`}
      alt={`Avatar ${avatar}`}
      onError={() => setFailed(true)}
      className={`${dimension} rounded-full object-cover`}
    />
  );

  if (!onClick) return <div className={ring}>{content}</div>;

  return (
    <button type="button" onClick={onClick} aria-label={`Avatar ${avatar}`} className={`rounded-full ${ring}`}>
      {content}
    </button>
  );
}
