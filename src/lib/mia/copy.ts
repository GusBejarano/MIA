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
