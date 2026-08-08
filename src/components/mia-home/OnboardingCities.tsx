"use client";

import { useEffect, useState } from "react";

type CityOption = { value: string; label: string; count: number };

/**
 * OnB-3: seleccion de ciudades de interes, multi-seleccion, independiente
 * del permiso de ubicacion del dispositivo (eso se pide solo al entrar al
 * tab "Cerca de ti", ver NearbyList.tsx). Guarda al tocar "Continuar" -
 * saveUserCities solo agrega, nunca borra (ver store.ts).
 */
export default function OnboardingCities({
  userId,
  onContinue,
}: {
  userId: string;
  onContinue: () => void;
}) {
  const [cities, setCities] = useState<CityOption[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mia/onboarding/catalog")
      .then((r) => r.json())
      .then((data) => setCities(data.cities ?? []))
      .catch(() => setError("No pudimos cargar las ciudades"));
  }, []);

  function toggle(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  async function handleContinue() {
    if (selected.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/mia/onboarding/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, cities: selected }),
      });
      if (!res.ok) throw new Error();
      onContinue();
    } catch {
      setError("No se pudieron guardar las ciudades, intenta de nuevo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4 text-center">
      <h2 className="text-xl font-semibold text-mia-ink">¿Qué ciudades te interesan?</h2>
      <p className="text-sm text-zinc-500">Elige las ciudades donde quieres ver tus beneficios</p>

      <div className="flex flex-wrap justify-center gap-2">
        {!cities && <p className="text-sm text-zinc-400">Cargando...</p>}
        {cities?.map((c) => {
          const isSelected = selected.includes(c.value);
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => toggle(c.value)}
              className={
                isSelected
                  ? "rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-mia-ink"
              }
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="button"
        onClick={handleContinue}
        disabled={selected.length === 0 || saving}
        className="w-full rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Guardando..." : "Continuar"}
      </button>
      <p className="text-xs text-zinc-400">
        No volveremos a pedirte este dato · tu ubicación exacta solo se pide en &quot;Cerca de ti&quot;
      </p>
    </div>
  );
}
