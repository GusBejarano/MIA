"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmHashSessionAction } from "./actions";

export default function AuthConfirmPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      router.replace("/admin/login");
      return;
    }

    confirmHashSessionAction(accessToken, refreshToken).catch(() => {
      // confirmHashSessionAction redirige con next/navigation's redirect(),
      // que internamente lanza - un catch generico solo cubre el caso de
      // que algo mas salga mal antes de eso.
      setError("No se pudo validar el link. Puede que ya haya expirado.");
    });
  }, [router]);

  return (
    <div className="mx-auto mt-24 max-w-sm px-4 text-center">
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <p className="text-sm text-zinc-500">Validando tu acceso...</p>
      )}
    </div>
  );
}
