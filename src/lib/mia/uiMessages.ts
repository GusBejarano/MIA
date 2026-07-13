// Contrato de mensajes tipados entre el backend y el renderer del chat.
// Basado en el prototipo 2026.07.13-mia-diseno-etapas.html, ajustado a datos
// reales (conteos, colores y categorias dinamicos - nada hardcodeado).

export type ChipOption = {
  label: string;
  value: string;
  count: number;
  color?: string;
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
};

export type CardCarouselMessage = {
  type: "card_carousel";
  cards: CarouselCard[];
};

export type DetailSheetMessage = {
  type: "detail_sheet";
  id: string;
  title: string;
  tag: string;
  description: string;
  photoUrl: string | null;
  details: { label: string; value: string }[];
  links: { go: string | null; web: string | null; social: string | null };
};

export type UiMessage =
  | ChipSelectMessage
  | SummaryCardsMessage
  | CardCarouselMessage
  | DetailSheetMessage;
