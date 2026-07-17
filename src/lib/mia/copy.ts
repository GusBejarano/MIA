// Copy fijo compartido entre el backend (arma el mensaje) y el frontend
// (necesita el termino exacto para anclar el tooltip encima de la palabra
// dentro del texto) - una sola fuente de verdad para que nunca queden
// desincronizados. Sin dependencias de servidor: seguro de importar desde
// un componente "use client".

export const RELACION_ACTIVA_TERM = "relación activa";

export const RELACION_ACTIVA_DEFINITION =
  "Se considera que tienes una relación activa con el benefactor cuando eres empleado, estudiante, afiliado o beneficiario activo, y cuentas con un carnet que puedas presentar al momento de usar el beneficio.";
