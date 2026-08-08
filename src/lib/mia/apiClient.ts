import type { UiMessage, NavLink } from "@/lib/mia/uiMessages";
import type { Profile, Stage } from "@/lib/mia/onboarding";
import type { ChatMessage } from "@/lib/mia/claudeClient";

export type ClientState = {
  history: ChatMessage[];
  stage: Stage;
  profile: Profile;
  userId?: string;
};

/**
 * Cliente para /api/mia (motor de turnos de chat) - extraido de MiaChat.tsx
 * para reusarlo tambien desde ChatOverlay.tsx (dev 2.5), que necesita
 * arrancar su propia sesion de chat en el overlay sin duplicar este
 * wrapper.
 */
// "Una visita real = un evento session_started". Usa sessionStorage a
// proposito (no localStorage): vive mientras la pestana/ventana siga
// abierta y sobrevive a un refresco de pagina (no duplica el evento), pero
// se vacia solo al cerrarla. Compartido entre MiaChat.tsx (chat de pantalla
// completa) y MiaHome.tsx (dev 2.5, bootstrap del chat en segundo plano) -
// un solo lugar que decide "es una visita nueva", sin importar cual de los
// dos shells la dispare primero.
const VISIT_LOGGED_KEY = "mia_visit_logged";

/** true la primera vez que se llama en esta pestana; false en refrescos posteriores dentro de la misma visita. */
export function claimVisit(): boolean {
  try {
    if (window.sessionStorage.getItem(VISIT_LOGGED_KEY)) return false;
    window.sessionStorage.setItem(VISIT_LOGGED_KEY, "1");
    return true;
  } catch {
    // sessionStorage no disponible (ej. modo privado estricto) - mejor
    // registrar la visita de mas que perderla del todo.
    return true;
  }
}

export async function callMia(payload: Record<string, unknown>) {
  const res = await fetch("/api/mia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Algo salio mal");
  return data as {
    reply: string;
    ui: UiMessage[];
    navLinks?: NavLink[];
    state: ClientState;
  };
}
