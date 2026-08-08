"use client";

import { useEffect, useState } from "react";
import type { AvatarKey } from "@/lib/mia/store";
import CloseButton from "@/components/mia/CloseButton";

type ProfileDetails = {
  name: string | null;
  gender: string | null;
  birthDate: string | null;
  whatsappNumber: string | null;
  avatar: AvatarKey;
};

// Los 3 avatares del prompt son "avatar-negro.png" / "avatar-verde.png" /
// "avatar-fucsia.png" (assets fijos de diseno, no se generan aqui - ver
// prompt regla 8). Los 3 PNG que llegaron en el chat se ven violeta/oscuro/
// cian (los tokens de marca reales de globals.css), no negro/verde/fucsia -
// mientras no tengamos los archivos definitivos en public/avatars/, estos
// son placeholders de color plano con los 3 colores que SI se pudieron ver,
// para no inventar un verde/fucsia que no vino en ningun asset real. Los
// valores que se guardan en BD (negro/verde/fucsia) no cambian.
const AVATAR_OPTIONS: { key: AvatarKey; colorClass: string }[] = [
  { key: "negro", colorClass: "bg-mia-ink" },
  { key: "verde", colorClass: "bg-mia-violet" },
  { key: "fucsia", colorClass: "bg-mia-cyan" },
];

const GENDER_OPTIONS = [
  { value: "femenino", label: "Femenino" },
  { value: "masculino", label: "Masculino" },
  { value: "prefiero_no_decir", label: "Prefiero no decir" },
];

export default function ProfileSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [profile, setProfile] = useState<ProfileDetails | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [birthDateInput, setBirthDateInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/mia/onboarding/profile?userId=${userId}`)
      .then((r) => r.json())
      .then((data: { profile: ProfileDetails }) => {
        setProfile(data.profile);
        setNameInput(data.profile.name ?? "");
        setBirthDateInput(data.profile.birthDate ?? "");
      });
  }, [userId]);

  async function saveField(fieldKey: "name" | "gender" | "birth_date", value: string) {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/mia/onboarding/profile-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, fieldKey, value }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setBusy(false);
    }
  }

  async function pickAvatar(avatar: AvatarKey) {
    setProfile((p) => (p ? { ...p, avatar } : p));
    await fetch("/api/mia/onboarding/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, avatar }),
    });
  }

  if (!profile) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/35">
      <div className="flex h-[85%] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
          <span className="flex-1 text-sm font-semibold text-mia-ink">Mi perfil</span>
          <CloseButton onClick={onClose} variant="header" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-col items-center gap-1 pb-2 text-center">
            <div
              className={`h-16 w-16 rounded-full ${
                AVATAR_OPTIONS.find((a) => a.key === profile.avatar)?.colorClass ?? "bg-mia-ink"
              }`}
            />
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-mia-violet">Explorador</span>
              <span className="flex gap-0.5 text-sm">
                <span className="text-mia-violet">★</span>
                <span className="text-zinc-200">★</span>
                <span className="text-zinc-200">★</span>
              </span>
            </div>
            <p className="text-xs text-zinc-400">Tu nivel sube solo con el uso - es informativo</p>
          </div>

          <div className="mb-5 flex justify-center gap-3">
            {AVATAR_OPTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => pickAvatar(a.key)}
                aria-label={`Avatar ${a.key}`}
                className={`h-10 w-10 rounded-full ${a.colorClass} ${
                  profile.avatar === a.key ? "ring-2 ring-offset-2 ring-mia-violet" : ""
                }`}
              />
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1 text-xs text-zinc-400">Nombre</p>
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={() => saveField("name", nameInput)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-mia-ink"
              />
            </div>

            <div>
              <p className="mb-1 text-xs text-zinc-400">WhatsApp (solo consulta)</p>
              <input
                value={profile.whatsappNumber ?? ""}
                disabled
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-400"
              />
            </div>

            <div>
              <p className="mb-1 text-xs text-zinc-400">Género</p>
              <div className="flex flex-wrap gap-2">
                {GENDER_OPTIONS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    disabled={busy}
                    onClick={() => saveField("gender", g.value)}
                    className={
                      profile.gender === g.value
                        ? "rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-3 py-1.5 text-xs font-semibold text-white"
                        : "rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-mia-ink"
                    }
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs text-zinc-400">Fecha de nacimiento</p>
              <input
                type="date"
                value={birthDateInput}
                onChange={(e) => setBirthDateInput(e.target.value)}
                onBlur={() => saveField("birth_date", birthDateInput)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-mia-ink"
              />
            </div>
          </div>

          {saved && <p className="mt-3 text-center text-xs text-mia-violet">Guardado</p>}
        </div>
      </div>
    </div>
  );
}
