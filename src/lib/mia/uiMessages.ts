// Contrato de mensajes tipados entre el backend y el renderer del chat.
// Basado en el prototipo 2026.07.13-mia-diseno-etapas.html, ajustado a datos
// reales (conteos, colores y categorias dinamicos - nada hardcodeado).

export type ChipOption = {
  label: string;
  value: string;
  count: number;
  color?: string;
  /** Cuando esta presente, el chip muestra este icono en vez del contador. */
  icon?: "back";
};

export type ContextTab = {
  label: string;
  value: string;
  active: boolean;
};

export type ChipSelectMessage = {
  type: "chip_select";
  options: ChipOption[];
  multi: boolean;
  maxSelect?: number;
  allowFreeText: boolean;
  contextTabs?: ContextTab[] | null;
};

export type SummaryCard = {
  title: string;
  subtitle: string;
  count: number;
  color: string;
};

export type SummaryCardsMessage = {
  type: "summary_cards";
  cards: SummaryCard[];
};

export type CarouselCard = {
  id: string;
  title: string;
  tag: string;
  color: string;
  thumbUrl: string | null;
  /** Calificacion (1-3) que el usuario ya le dio a este beneficio, o 0 si no lo ha calificado. */
  rating: number;
};

export type CardCarouselMessage = {
  type: "card_carousel";
  cards: CarouselCard[];
};

export type DetailSheetMessage = {
  type: "detail_sheet";
  id: string;
  title: string;
  /** Ruta de contexto "Ciudad › Benefactor › Categoria", ya armada como un solo string. */
  tag: string;
  description: string;
  photoUrl: string | null;
  details: { label: string; value: string }[];
  links: { go: string | null; web: string | null; social: string | null };
  /** Calificacion (1-3) que el usuario ya le dio a este beneficio, o 0 si no lo ha calificado. */
  rating: number;
};

export type UiMessage =
  | ChipSelectMessage
  | SummaryCardsMessage
  | CardCarouselMessage
  | DetailSheetMessage;

/**
 * Enlace de navegacion dentro del texto de una respuesta (ej. el nombre de
 * la ciudad/benefactor/categoria en el mensaje del carrusel). `term` es la
 * subcadena exacta a resaltar dentro de `reply`; `action` es uno de los
 * codigos NAV_BACK_TO_* de copy.ts, que el frontend manda de vuelta como
 * si fuera un chip tocado al tocar ese termino.
 */
export type NavLink = { term: string; action: string };
