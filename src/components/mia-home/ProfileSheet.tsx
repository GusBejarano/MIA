"use client";

import { useEffect, useState } from "react";
import type { AvatarKey } from "@/lib/mia/store";
import CloseButton from "@/components/mia/CloseButton";
import { PersonIcon } from "@/components/mia/SheetIcons";
import AvatarCircle, { AVATAR_KEYS } from "@/components/mia-home/AvatarCircle";

type ProfileDetails = {
  name: string | null;
  gender: string | null;
  birthDate: string | null;
  whatsappNumber: string | null;
  avatar: AvatarKey;
};

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
    await fetch("/api/mia/onboarding/profile-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, fieldKey, value }),
    });
  }

  async function handleGenderTap(value: string) {
    setBusy(true);
    try {
      await saveField("gender", value);
      setProfile((p) => (p ? { ...p, gender: value } : p));
    } finally {
      setBusy(false);
    }
  }

  const hasChanges = profile
    ? nameInput.trim() !== (profile.name ?? "") || birthDateInput !== (profile.birthDate ?? "")
    : false;

  async function handleSaveChanges() {
    if (!profile || !hasChanges) return;
    setBusy(true);
    try {
      if (nameInput.trim() !== (profile.name ?? "")) await saveField("name", nameInput);
      if (birthDateInput !== (profile.birthDate ?? "")) await saveField("birth_date", birthDateInput);
      setProfile((p) => (p ? { ...p, name: nameInput.trim(), birthDate: birthDateInput } : p));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mia-ink text-white">
            <PersonIcon size={14} />
          </span>
          <span className="flex-1 text-sm font-semibold text-mia-ink">Mi perfil</span>
          <CloseButton onClick={onClose} variant="header" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-col items-center gap-1 pb-2 text-center">
            <AvatarCircle avatar={profile.avatar} size="lg" />
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
            {AVATAR_KEYS.map((key) => (
              <AvatarCircle
                key={key}
                avatar={key}
                size="sm"
                selected={profile.avatar === key}
                onClick={() => pickAvatar(key)}
              />
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1 text-xs text-zinc-400">Nombre</p>
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
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
                    onClick={() => handleGenderTap(g.value)}
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
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-mia-ink"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveChanges}
            disabled={!hasChanges || busy}
            className="mt-5 w-full rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Guardando..." : "Guardar cambios"}
          </button>
          {saved && <p className="mt-3 text-center text-xs text-mia-violet">Guardado</p>}
        </div>
      </div>
    </div>
  );
}
