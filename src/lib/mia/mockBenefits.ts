// Catalogo de prueba para la tarea #4 (probar el flujo antes de que exista el
// catalogo real de Fase 3). Estructura alineada con la tabla `benefits` del
// esquema de Supabase de Fase 1, pero vive solo en memoria por ahora.

export type Benefit = {
  id: string;
  title: string;
  sourceProgram: string; // debe coincidir con uno de los 6 programas del MVP
  category: "comida" | "viajes" | "entretenimiento" | "salud";
  city: string;
  accessType: string; // ej. "solo_tarjetahabientes", "publico"
};

export const MOCK_BENEFITS: Benefit[] = [
  {
    id: "b1",
    title: "35% de descuento en Restaurante La Matera",
    sourceProgram: "Comfandi",
    category: "comida",
    city: "Cali",
    accessType: "solo_tarjetahabientes",
  },
  {
    id: "b2",
    title: "2x1 en boletas de cine Cinemark",
    sourceProgram: "Comfandi",
    category: "entretenimiento",
    city: "Cali",
    accessType: "solo_tarjetahabientes",
  },
  {
    id: "b3",
    title: "20% de descuento en gimnasio Bodytech",
    sourceProgram: "Comfenalco",
    category: "salud",
    city: "Cali",
    accessType: "solo_tarjetahabientes",
  },
  {
    id: "b4",
    title: "15% de descuento pagando con Visa en Frisby",
    sourceProgram: "Visa",
    category: "comida",
    city: "Cali",
    accessType: "publico",
  },
  {
    id: "b5",
    title: "10% de descuento en tiquetes con Avianca pagando Mastercard",
    sourceProgram: "Mastercard",
    category: "viajes",
    city: "Cali",
    accessType: "publico",
  },
  {
    id: "b6",
    title: "Puntos dobles en compras de supermercado",
    sourceProgram: "Puntos Colombia",
    category: "comida",
    city: "Cali",
    accessType: "publico",
  },
  {
    id: "b7",
    title: "Descuento en paquete familiar PriceSmart",
    sourceProgram: "PriceSmart",
    category: "comida",
    city: "Cali",
    accessType: "solo_afiliados",
  },
  {
    id: "b8",
    title: "30% de descuento en spa y masajes",
    sourceProgram: "Comfenalco",
    category: "salud",
    city: "Cali",
    accessType: "solo_tarjetahabientes",
  },
  {
    id: "b9",
    title: "Entrada 2x1 a parque temático Comfandi",
    sourceProgram: "Comfandi",
    category: "entretenimiento",
    city: "Cali",
    accessType: "solo_tarjetahabientes",
  },
  {
    id: "b10",
    title: "Descuento en hotel de fin de semana pagando Visa",
    sourceProgram: "Visa",
    category: "viajes",
    city: "Cali",
    accessType: "publico",
  },
];
