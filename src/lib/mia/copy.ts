// Copy fijo compartido entre el backend (arma el mensaje) y el frontend
// (necesita el termino exacto para anclar el tooltip encima de la palabra
// dentro del texto) - una sola fuente de verdad para que nunca queden
// desincronizados. Sin dependencias de servidor: seguro de importar desde
// un componente "use client".

export const RELACION_ACTIVA_TERM = "relación activa";

export const RELACION_ACTIVA_DEFINITION =
  "Se considera que tienes una relación activa con el benefactor cuando eres empleado, estudiante, afiliado o beneficiario activo, y cuentas con un carnet que puedas presentar al momento de usar el beneficio.";

// Acciones de navegacion por enlace dentro de un mensaje (ver NavLink en
// uiMessages.ts) - el backend le dice al frontend que termino de la frase
// mapea a cual accion, y el frontend manda de vuelta ese mismo codigo como
// si fuera un chip tocado (mismo mecanismo, sin chip visible). Comparten
// destino con los chips "Volver" ya existentes en Paso 3.1/4/5, por eso
// viven en un solo lugar en vez de duplicarse en el backend y el frontend.
export const NAV_BACK_TO_CITY_CHOICE = "__back_to_city_choice__";
export const NAV_BACK_TO_BENEFACTOR_SELECT = "__back_to_benefactor_select__";
export const NAV_BACK_TO_CATEGORY_SELECT = "__back_to_category_select__";

// Home nuevo (dev 2.5) - tab "Cerca de ti". Tono informativo, sin lenguaje
// de "desbloquear" ni iconos de candado (ver prompt del ajuste): el nivel
// de madurez es descriptivo, no una recompensa.
export const NEARBY_HABITUAL_GATE_MESSAGE =
  "Ver estos descuentos directamente en el mapa se activa cuando pases a nivel Habitual.";

export const NEARBY_EMPTY_STATE_MESSAGE =
  "Todavía no tenemos sedes ubicadas para tus benefactores conectados en esta zona. Estamos sumando más sedes al mapa.";

export const NEARBY_RADIUS_EMPTY_MESSAGE =
  "No hay beneficios dentro de este radio - prueba ampliándolo.";

// Home nuevo (dev 2.5) - tab "Sugerencias" (antes "Explorar"): superficie
// 100% dependiente de la conversacion con MIA, sin fila de categorias ni
// contenido por defecto.
export const SUGGESTIONS_EMPTY_MESSAGE =
  "Todavía no tienes sugerencias.\nToca este tab para preguntarle a MIA.";

/**
 * Saludo especial SOLO para cuando se abre el chat desde el tab
 * "Sugerencias" vacío (reemplaza el saludo real de esa apertura, sin
 * tocar el saludo real que arma OnboardingSession.start() para cualquier
 * otro punto de entrada - ver ChatOverlay.tsx/MiaHome.tsx). Sin numero de
 * tope fijo en el texto (hoy son hasta 12, ver getSuggestions en
 * discovery.ts) para no tener que sincronizar dos lugares si ese numero
 * cambia despues.
 */
export function suggestionsChatGreeting(name: string | null): string {
  const saludo = name ? `¡Bienvenido, ${name}!` : "¡Bienvenido!";
  return `${saludo} Cuéntame qué buscas y te lo encuentro. Por ejemplo, puedes escribir algo como "quiero invitar a mi esposa a cenar hoy" y te muestro las mejores alternativas.`;
}
