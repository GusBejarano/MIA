import { miaConversation, type ChatMessage } from "./claudeClient";
import { classifyOpenMessage } from "./tasks/classifyOpenMessage";
import { matchOneFromList } from "./tasks/matchFromText";
import { detectCityChange } from "./tasks/detectCityChange";
import {
  getOrCreateUser,
  saveCity,
  saveCityInterest,
  saveLocationPermission,
  saveAffinity,
  saveProgramSelections,
  saveExposure,
  saveSessionStarted,
  getRating,
  getRatingsForBenefits,
} from "./store";
import {
  getAvailableBenefactors,
  getAvailableCategories,
  getAvailableCities,
  getBenefitsForCategory,
  getBenefitDetail,
  colorForId,
  type BenefactorOption,
  type CategoryOption,
  type CityOption,
} from "./discovery";
import type {
  UiMessage,
  ChipSelectMessage,
  SummaryCardsMessage,
  CardCarouselMessage,
  DetailSheetMessage,
  NavLink,
} from "./uiMessages";
import {
  RELACION_ACTIVA_TERM,
  NAV_BACK_TO_CITY_CHOICE,
  NAV_BACK_TO_BENEFACTOR_SELECT,
  NAV_BACK_TO_CATEGORY_SELECT,
} from "./copy";

// Mensaje fijo del primer contacto - no se genera por LLM porque su
// redaccion exacta importa (honestidad sobre que la ubicacion si se
// guarda, para poder saltarnos esta pregunta la proxima vez).
const LOCATION_PERMISSION_MESSAGE = `¡Hola! Soy MIA. Te ayudo a descubrir los descuentos a los que ya tienes derecho, donde y cuando los necesites, incluso los que no sabías que existían.

Para empezar, ¿me compartes tu ubicación? La uso para mostrarte los descuentos disponibles cerca de ti, y la recuerdo para que la próxima vez no tengas que volver a compartirla.`;

// Idem para el mensaje que sigue cuando el usuario no comparte la
// ubicacion - tambien fijo, en vez de generado, por la misma razon.
const LOCATION_DECLINED_MESSAGE = `Sin problema, entiendo. Aunque no compartiste tu ubicación, sí puedo mostrarte las ciudades donde ya tenemos descuentos activos esperando por ti — elige la que te interese explorar:`;

// Valor especial del chip "Volver" en la pantalla de ciudades - le da al
// usuario una segunda oportunidad real de conceder el permiso. Local (no en
// copy.ts) porque solo lo usa un chip, nunca un enlace de navegacion en
// texto - el frontend nunca necesita conocerlo de antemano.
const BACK_TO_LOCATION_PERMISSION = "__back_to_location_permission__";

/**
 * Mensaje fijo del primer contacto con la pantalla de benefactores - fijo
 * (no LLM) porque el termino "relacion activa" necesita coincidir
 * exactamente con RELACION_ACTIVA_TERM para que el frontend le pueda
 * enganchar el tooltip encima de esa frase.
 */
function benefactorSelectMessage(city: string): string {
  return `Perfecto, ${city}. Ya tenemos descuentos activos por acá, así que hay bastante para mostrarte. Cuéntame con cuál de estos benefactores tienes una ${RELACION_ACTIVA_TERM}:`;
}

/** Mensaje fijo del primer contacto con la pantalla de categorias. */
function categorySelectMessage(benefactorName: string, city: string): string {
  return `Perfecto, esto es lo que tienes disponible con ${benefactorName} en ${city}. Elige la categoría que quieras explorar:`;
}

/**
 * Mensaje fijo de la pantalla del carrusel - categoria, benefactor y ciudad
 * necesitan coincidir con esas mismas subcadenas exactas para que el
 * frontend les enganche los enlaces de navegacion (ver navLinksForCarousel).
 */
function carouselMessage(category: string, benefactor: string, city: string): string {
  return `Listo, aquí tienes las opciones de ${category} disponibles para ti con ${benefactor} en ${city}. Desliza hacia la derecha para ver todas las opciones y toca la que te interese para conocer el detalle.`;
}

/** Los tres enlaces tocables del mensaje del carrusel - ciudad, benefactor y categoria, cada uno salta a su pantalla de eleccion correspondiente. */
function navLinksForCarousel(category: string, benefactor: string, city: string): NavLink[] {
  return [
    { term: category, action: NAV_BACK_TO_CATEGORY_SELECT },
    { term: benefactor, action: NAV_BACK_TO_BENEFACTOR_SELECT },
    { term: city, action: NAV_BACK_TO_CITY_CHOICE },
  ];
}

// Solo la ubicacion es un flujo verdaderamente secuencial/obligatorio. Todo
// lo posterior (benefactor_select/category_select/benefit_browse/done) es
// descriptivo unicamente - handleUserMessage no las usa para enrutar, todas
// pasan por freeChat, que decide que mostrar segun el mensaje y los datos
// reales (nunca segun "en que paso estaba").
export type Stage =
  | "location_permission"
  | "location_city_choice"
  | "benefactor_select"
  | "category_select"
  | "benefit_browse"
  | "done";

export type Profile = {
  city?: string;
  locationPermissionGranted?: boolean;
  selectedBenefactors?: string[];
  /** Nombre para mostrar del benefactor en selectedBenefactors[0] - cacheado para no releer Supabase solo para armar un mensaje. */
  selectedBenefactorName?: string;
  selectedCategory?: { value: string; label: string };
};

export type Turn = { reply: string; ui: UiMessage[]; navLinks?: NavLink[] };

export class OnboardingSession {
  history: ChatMessage[] = [];
  stage: Stage = "location_permission";
  profile: Profile = {};

  // Publico (no private) para que las rutas de API puedan restaurar una
  // sesion entre requests sin reconstruir la clase: el backend es stateless
  // (Netlify Functions), asi que el estado completo (history/stage/profile/
  // userId) viaja de ida y vuelta con el cliente entre turnos.
  userId?: string;

  /**
   * `phone` identifica al usuario entre visitas (viene del webhook de
   * WhatsApp o de la sesion web autenticada por telefono) - nunca se
   * guarda en texto plano, solo su hash (ver phoneHash.ts).
   */
  constructor(private readonly phone: string) {}

  /**
   * Arranca la conversacion: resuelve/crea el usuario.
   * - Si ya habia concedido el permiso de ubicacion antes (Supabase, por
   *   numero de telefono) MIA no vuelve a pedirlo: usa `opts.detectedCity`
   *   si el cliente logro redetectarla en silencio (Permissions API en
   *   estado "granted"), o si no la ciudad que ya tenia guardada.
   * - Si nunca lo concedio, o lo rechazo en una sesion anterior ("Ahora
   *   no"), se lo vuelve a pedir con el mismo mensaje de siempre.
   */
  async start(
    opts: {
      locationPermissionGranted?: boolean;
      detectedCity?: string;
      logVisit?: boolean;
    } = {}
  ): Promise<Turn> {
    const user = await getOrCreateUser(this.phone);
    this.userId = user.id;

    // Analitica de retencion (1 evento por visita real, ver MiaChat.tsx) -
    // nunca debe poder romper el arranque de la conversacion si falla, asi
    // que el error se registra pero no se propaga.
    if (opts.logVisit ?? true) {
      try {
        await saveSessionStarted(this.userId);
      } catch (err) {
        console.error("No se pudo registrar session_started:", err);
      }
    }

    // La API de Claude exige al menos un mensaje en `messages` - el arranque
    // no tiene un turno de usuario todavia, asi que sembramos uno sintetico
    // que representa "el usuario abrio el chat".
    this.history.push({ role: "user", content: "Hola" });

    const granted = opts.locationPermissionGranted ?? user.locationPermissionGranted;
    const city = opts.detectedCity ?? user.city ?? undefined;

    if (granted && city) {
      this.profile.city = city;
      this.profile.locationPermissionGranted = true;
      if (opts.detectedCity && opts.detectedCity !== user.city) {
        await saveCity(this.userId, city, "geolocation");
      }
      if (!user.locationPermissionGranted) {
        await saveLocationPermission(this.userId);
      }

      const benefactores = await getAvailableBenefactors(city);
      if (benefactores.length === 0) {
        await saveCityInterest(this.userId, city);
        return this.showCityChoice();
      }

      return this.startBenefactorSelect(city, false, true);
    }

    const reply = LOCATION_PERMISSION_MESSAGE;
    this.history.push({ role: "assistant", content: reply });
    return { reply, ui: [] };
  }

  /**
   * Procesa el turno del usuario. Solo la ubicacion tiene un enrutamiento
   * secuencial real (`location_permission`/`location_city_choice`) - todo
   * lo demas cae en freeChat, que interpreta el mensaje (y cualquier
   * `chipSelection`) contra los datos reales del momento, no contra un
   * estado de "paso pendiente".
   * - `locationPermissionGranted`/`detectedCity`: evento real de geolocalizacion.
   * - `chipSelection`: valores elegidos al tocar chips (benefactores o categoria).
   * - `viewDetailId`: el usuario toco una tarjeta del carrusel - se procesa
   *   sin importar en que etapa este la sesion.
   */
  async handleUserMessage(
    userMessage: string,
    opts: {
      locationPermissionGranted?: boolean;
      detectedCity?: string;
      chipSelection?: string[];
      viewDetailId?: string;
    } = {}
  ): Promise<Turn> {
    // La API de Claude rechaza mensajes de usuario con contenido vacio. El
    // frontend siempre deberia mandar un texto (ej. la etiqueta del chip
    // elegido), pero esto es un cinturon de seguridad por si algun caller
    // manda vacio.
    this.history.push({ role: "user", content: userMessage.trim() || "(seleccion)" });

    if (opts.viewDetailId) {
      return this.viewBenefitDetail(opts.viewDetailId);
    }

    switch (this.stage) {
      case "location_permission":
        return this.resolveLocationPermission(opts);
      case "location_city_choice":
        return this.resolveCityChoice(userMessage, opts);
      default:
        return this.freeChat(userMessage, opts.chipSelection);
    }
  }

  private async resolveLocationPermission(opts: {
    locationPermissionGranted?: boolean;
    detectedCity?: string;
  }): Promise<Turn> {
    if (opts.locationPermissionGranted) {
      const city = opts.detectedCity ?? "Cali";
      await saveCity(this.userId!, city, "geolocation");
      await saveLocationPermission(this.userId!);
      this.profile.city = city;
      this.profile.locationPermissionGranted = true;

      // Validacion interna y silenciosa contra la cobertura real - sin
      // mensaje intermedio. Si no hay descuentos activos ahi, salta directo
      // al Paso 3.1 (elegir ciudad); si si hay, directo al Paso 4
      // (benefactores), la ciudad detectada queda preseleccionada.
      const benefactores = await getAvailableBenefactors(city);
      if (benefactores.length === 0) {
        await saveCityInterest(this.userId!, city);
        return this.showCityChoice();
      }

      return this.startBenefactorSelect(city, true);
    }

    return this.showCityChoice();
  }

  /**
   * Muestra (o vuelve a mostrar) la pantalla de ciudades con cobertura real.
   * Limpia cualquier benefactor/categoria ya elegidos - pertenecian a la
   * ciudad anterior, no tienen por que seguir siendo validos en la nueva.
   */
  private async showCityChoice(): Promise<Turn> {
    this.profile.selectedBenefactors = undefined;
    this.profile.selectedCategory = undefined;
    this.stage = "location_city_choice";
    this.history.push({ role: "assistant", content: LOCATION_DECLINED_MESSAGE });
    const cities = await getAvailableCities();
    return { reply: LOCATION_DECLINED_MESSAGE, ui: [this.cityChipMessage(cities)] };
  }

  /**
   * Interpreta un texto libre (en cualquier etapa posterior a la
   * ubicacion, no solo al inicio) como pedido de cambiar de ciudad.
   * `rawCity` ya viene detectado por detectCityChange, pero sin validar -
   * aca se hace coincidencia aproximada contra la cobertura real (mismo
   * mecanismo que matchFromText.ts usa para benefactor/categoria). Si no
   * hay match, nunca un error seco: se muestra el listado completo de
   * ciudades (Paso 3.1), igual que cuando el usuario declina el permiso.
   */
  private async changeCity(rawCity: string): Promise<Turn> {
    const cities = await getAvailableCities();
    const matchedLabel = await matchOneFromList(
      rawCity,
      cities.map((c) => c.label)
    );
    const match = cities.find((c) => c.label === matchedLabel);

    if (!match) {
      return this.showCityChoice();
    }

    await saveCity(this.userId!, match.label, "manual");
    this.profile.city = match.label;
    this.profile.selectedBenefactors = undefined;
    this.profile.selectedBenefactorName = undefined;
    this.profile.selectedCategory = undefined;
    return this.startBenefactorSelect(match.label, true);
  }

  /**
   * Resuelve la pantalla de ciudades tras declinar el permiso: por chip
   * (una ciudad real, o "Volver") o por texto libre (ciudad no listada).
   */
  private async resolveCityChoice(
    userMessage: string,
    opts: { chipSelection?: string[] }
  ): Promise<Turn> {
    const selectedValue = opts.chipSelection?.[0];

    if (selectedValue === BACK_TO_LOCATION_PERMISSION) {
      this.stage = "location_permission";
      this.history.push({ role: "assistant", content: LOCATION_PERMISSION_MESSAGE });
      return { reply: LOCATION_PERMISSION_MESSAGE, ui: [] };
    }

    const cities = await getAvailableCities();
    const typed = userMessage.trim().toLowerCase();
    const city = selectedValue
      ? cities.find((c) => c.value === selectedValue)
      : cities.find((c) => c.value === typed);

    if (city) {
      await saveCity(this.userId!, city.label, "manual");
      this.profile.city = city.label;
      return this.startBenefactorSelect(city.label, true);
    }

    const declaredCity = userMessage.trim();
    await saveCityInterest(this.userId!, declaredCity);
    this.stage = "done";
    const reply = await this.emit(
      `El usuario declaro que esta en ${declaredCity}, ciudad sin cobertura todavia. Confirma que vas a investigar que hay disponible ahi y que le avisaras.`
    );
    return { reply, ui: [] };
  }

  private cityChipMessage(cities: CityOption[]): ChipSelectMessage {
    return {
      type: "chip_select",
      options: [
        ...cities.map((c) => ({ label: c.label, value: c.value, count: c.count })),
        { label: "Volver", value: BACK_TO_LOCATION_PERMISSION, count: 0, icon: "back" as const },
      ],
      multi: false,
      allowFreeText: true,
    };
  }

  /** Arranca la etapa de seleccion de benefactores con datos reales de Supabase. */
  private async startBenefactorSelect(
    city: string,
    affirmCity: boolean,
    returning = false
  ): Promise<Turn> {
    const benefactores = await getAvailableBenefactors(city);

    if (benefactores.length === 0) {
      this.stage = "done";
      const reply = await this.emit(
        `No hay benefactores con beneficios cargados en ${city} todavia. Dile al usuario con naturalidad y respeto que por ahora no tienes nada ahi, sin inventar, y confirma que le avisaras apenas haya algo.`
      );
      return { reply, ui: [] };
    }

    this.stage = "benefactor_select";

    if (returning) {
      const reply = await this.emit(
        `El usuario regresa (ya habia concedido el permiso de ubicacion antes) y esta en ${city}, que si tiene cobertura. Saludalo con calidez reconociendo la continuidad, sin repetir el onboarding ni volver a pedir el permiso de ubicacion. Luego pide que elija con cual de sus benefactores tiene una relacion activa (una sola opcion) - lo va a ver como opciones para tocar, no hace falta que las listes en texto.`
      );
      return { reply, ui: [this.benefactorChipMessage(benefactores)] };
    }

    if (!affirmCity) {
      const reply = await this.emit(
        `Pide que el usuario elija con cual de sus benefactores tiene una relacion activa (una sola opcion) - lo va a ver como opciones para tocar, no hace falta que las listes en texto.`
      );
      return { reply, ui: [this.benefactorChipMessage(benefactores)] };
    }

    // Copy fijo (ver benefactorSelectMessage) - el termino "relacion activa"
    // necesita coincidir exactamente para que el frontend le enganche el
    // tooltip, asi que este mensaje no pasa por el LLM.
    const reply = benefactorSelectMessage(city);
    this.history.push({ role: "assistant", content: reply });
    return { reply, ui: [this.benefactorChipMessage(benefactores)] };
  }

  private benefactorChipMessage(benefactores: BenefactorOption[]): ChipSelectMessage {
    return {
      type: "chip_select",
      options: [
        ...benefactores.map((b) => ({
          label: b.name,
          value: b.id,
          count: b.count,
          color: b.color,
        })),
        { label: "Volver", value: NAV_BACK_TO_CITY_CHOICE, count: 0, icon: "back" as const },
      ],
      multi: false,
      allowFreeText: true,
    };
  }

  private categoryChipMessage(categorias: CategoryOption[]): ChipSelectMessage {
    return {
      type: "chip_select",
      options: [
        ...categorias.map((c) => ({ label: c.label, value: c.value, count: c.count })),
        { label: "Volver", value: NAV_BACK_TO_BENEFACTOR_SELECT, count: 0, icon: "back" as const },
      ],
      multi: false,
      allowFreeText: true,
    };
  }

  /**
   * Vuelve a mostrar la pantalla de benefactores de la ciudad actual - por
   * si el usuario quiere explorar descuentos de otro benefactor distinto.
   * Limpia benefactor/categoria ya elegidos, pertenecian a la eleccion
   * anterior.
   */
  private async showBenefactorSelect(): Promise<Turn> {
    this.profile.selectedBenefactors = undefined;
    this.profile.selectedBenefactorName = undefined;
    this.profile.selectedCategory = undefined;
    return this.startBenefactorSelect(this.profile.city!, true);
  }

  /**
   * Vuelve a mostrar la pantalla de categorias del benefactor y ciudad
   * actuales - por si el usuario quiere explorar otra categoria distinta.
   * No toca el benefactor elegido, solo limpia la categoria.
   */
  private async showCategorySelect(): Promise<Turn> {
    this.profile.selectedCategory = undefined;
    const benefactorIds = this.profile.selectedBenefactors ?? [];
    const categorias = await getAvailableCategories(benefactorIds, this.profile.city!);
    this.stage = "category_select";
    const reply = categorySelectMessage(
      this.profile.selectedBenefactorName ?? "",
      this.profile.city!
    );
    this.history.push({ role: "assistant", content: reply });
    return { reply, ui: [this.categoryChipMessage(categorias)] };
  }

  /**
   * Resuelve la eleccion de benefactor - por chip o por texto libre. Es
   * seleccion unica: REEMPLAZA lo que hubiera elegido antes (no suma), a
   * diferencia del viejo flujo de "hasta 3" que acumulaba.
   */
  private async resolveBenefactorSelect(
    userMessage: string,
    opts: { chipSelection?: string[] }
  ): Promise<Turn> {
    const available = await getAvailableBenefactors(this.profile.city!);

    let newId: string | undefined;
    if (opts.chipSelection && opts.chipSelection.length > 0) {
      newId = available.find((b) => b.id === opts.chipSelection![0])?.id;
    } else {
      const matchedName = await matchOneFromList(
        userMessage,
        available.map((b) => b.name)
      );
      newId = available.find((b) => b.name === matchedName)?.id;
    }

    if (!newId) {
      // Se le pasa la lista real de benefactores con cobertura en esta
      // ciudad explicitamente - sin esto, el LLM cae de vuelta a la lista
      // generica del system prompt (Visa, Mastercard, etc.) aunque no
      // tengan cobertura real ahi, y termina sugiriendo opciones que no
      // existen (confirmado en pruebas de esta sesion).
      const reply = await this.emit(
        `El usuario respondio "${userMessage}" sobre con cual benefactor tiene una relacion activa, pero eso no matchea con ninguno de los que tienen beneficios cargados ahora mismo en ${this.profile.city}. Los UNICOS benefactores con beneficios activos ahi son: ${available.map((b) => b.name).join(", ")} - podria ser un benefactor real que simplemente no tiene beneficios cargados todavia, o algo que no se entendio. No asumas que lo agregaste ni digas "anotado", y no menciones ni sugieras ningun benefactor que no este en esa lista exacta - dile con honestidad que por ahora no tienes beneficios de eso, y pide con amabilidad que elija entre esos (solo esos) o lo escriba de otra forma.`
      );
      return { reply, ui: [this.benefactorChipMessage(available)] };
    }

    const chosen = available.filter((b) => b.id === newId);
    this.profile.selectedBenefactors = [newId];
    this.profile.selectedBenefactorName = chosen[0]?.name;
    await saveProgramSelections(this.userId!, [newId]);

    const categorias = await getAvailableCategories([newId], this.profile.city!);

    if (categorias.length === 0) {
      this.stage = "done";
      const reply = await this.emit(
        `El usuario eligio un benefactor valido, pero no hay categorias con beneficios activos para el en este momento. Dile con naturalidad y respeto, sin inventar, y confirma que le avisaras apenas haya algo.`
      );
      return { reply, ui: [] };
    }

    this.stage = "category_select";
    const benefactorName = chosen[0]?.name ?? "";
    // Copy fijo (ver categorySelectMessage) - indica explicitamente ciudad
    // y benefactor, no pasa por el LLM para no diluir esos datos reales.
    const reply = categorySelectMessage(benefactorName, this.profile.city!);
    this.history.push({ role: "assistant", content: reply });

    const summary: SummaryCardsMessage = {
      type: "summary_cards",
      cards: chosen.map((b) => ({
        title: b.name,
        subtitle: "Beneficios disponibles para ti",
        count: b.count,
        color: b.color,
      })),
    };

    return { reply, ui: [summary, this.categoryChipMessage(categorias)] };
  }

  private async resolveCategorySelect(
    userMessage: string,
    opts: { chipSelection?: string[] }
  ): Promise<Turn> {
    const benefactorIds = this.profile.selectedBenefactors ?? [];
    const categorias = await getAvailableCategories(benefactorIds, this.profile.city!);

    let chosen: CategoryOption | undefined;
    if (opts.chipSelection && opts.chipSelection[0]) {
      chosen = categorias.find((c) => c.value === opts.chipSelection![0]);
    } else {
      const labels = categorias.map((c) => c.label);
      const matchedLabel = await matchOneFromList(userMessage, labels);
      chosen = categorias.find((c) => c.label === matchedLabel);
    }

    if (!chosen) {
      const reply = await this.emit(
        `No se entendio bien que categoria eligio el usuario. Pide con amabilidad que elija de las opciones.`
      );
      return { reply, ui: [this.categoryChipMessage(categorias)] };
    }

    return this.showCarouselForCategory(chosen, benefactorIds);
  }

  /** Reutilizado tanto por la etapa guiada como por freeChat cuando el usuario pide una categoria puntual. */
  private async showCarouselForCategory(
    chosen: CategoryOption,
    benefactorIds: string[]
  ): Promise<Turn> {
    this.profile.selectedCategory = { value: chosen.value, label: chosen.label };
    await saveAffinity(this.userId!, chosen.value);

    const benefits = await getBenefitsForCategory(
      benefactorIds,
      chosen.value,
      chosen.label,
      this.profile.city!
    );

    if (benefits.length === 0) {
      this.stage = "done";
      const reply = await this.emit(
        `El usuario eligio la categoria "${chosen.label}", pero no hay beneficios activos ahi en este momento pese a que la categoria aparecia disponible. Dile con respeto que por ahora no tienes nada ahi.`
      );
      return { reply, ui: [] };
    }

    this.stage = "done";
    const city = this.profile.city!;
    const benefactorName = this.profile.selectedBenefactorName ?? "";
    // Copy fijo (ver carouselMessage) - ciudad/benefactor/categoria son
    // ademas enlaces de navegacion, necesitan coincidir con esas subcadenas
    // exactas, asi que este mensaje no pasa por el LLM.
    const reply = carouselMessage(chosen.label, benefactorName, city);
    this.history.push({ role: "assistant", content: reply });
    const navLinks = navLinksForCarousel(chosen.label, benefactorName, city);

    // Una sola consulta para las calificaciones de todos los beneficios
    // visibles, no una por tarjeta.
    const ratings = await getRatingsForBenefits(
      this.userId!,
      benefits.map((b) => b.id)
    );

    // Los que el usuario ya califico mejor van primero - hace el carrusel
    // mas atractivo de entrada. Sort estable: entre empates (misma
    // calificacion, incluyendo los 0 sin calificar) se respeta el orden
    // original.
    benefits.sort((a, b) => (ratings[b.id] ?? 0) - (ratings[a.id] ?? 0));

    const carousel: CardCarouselMessage = {
      type: "card_carousel",
      cards: benefits.map((b) => ({
        id: b.id,
        title: b.title,
        tag: b.tag,
        color: colorForId(b.sourceProgram),
        thumbUrl: b.thumbUrl,
        rating: ratings[b.id] ?? 0,
      })),
    };
    return { reply, ui: [carousel], navLinks };
  }

  private async viewBenefitDetail(benefitId: string): Promise<Turn> {
    // Tope diario de vistas de detalle desactivado en esta etapa de
    // lanzamiento del MVP - se evaluara la mejor alternativa mas adelante.
    // La infraestructura (discovery.getDailyDetailViewCount/
    // DAILY_DETAIL_VIEW_LIMIT) queda lista para reactivarse cuando se
    // decida el criterio definitivo.
    const detail = await getBenefitDetail(benefitId);
    if (!detail) {
      const reply = await this.emit(
        `El usuario pidio ver un beneficio que ya no esta disponible. Dile con naturalidad que ese en particular ya no esta activo.`
      );
      return { reply, ui: [] };
    }

    await saveExposure(this.userId!, benefitId);

    const reply = await this.emit(
      `El usuario quiere ver el detalle de "${detail.title}". Dale una intro breve y natural (una sola frase) - el detalle completo se lo muestra la tarjeta, no lo repitas en texto.`
    );

    const rating = await getRating(this.userId!, benefitId);
    // Ruta de contexto (Ciudad › Benefactor › Categoria) en vez del tag
    // plano - cualquier beneficio llegado hasta aca pertenece siempre a la
    // ciudad y benefactor ya elegidos (el carrusel los filtra por eso), asi
    // que se arman con el perfil actual, sin volver a consultar la BD.
    const breadcrumb = `${this.profile.city} › ${this.profile.selectedBenefactorName ?? ""} › ${detail.tag}`;

    const ui: DetailSheetMessage = { type: "detail_sheet", ...detail, tag: breadcrumb, rating };
    return { reply, ui: [ui] };
  }

  /**
   * Punto de entrada para todo lo posterior a la ubicacion. Primero revisa
   * si `chipSelection` corresponde a un id de benefactor real o a un valor
   * de categoria real (los datos mismos dicen que es, no un "paso
   * pendiente" guardado) - si no hay chip, clasifica el mensaje abierto
   * para decidir si mostrar benefactores, el menu de categorias, el
   * carrusel de una categoria puntual, o responder en texto plano (solo
   * cuando el mensaje de verdad no tiene que ver con nada de esto).
   */
  private async freeChat(userMessage: string, chipSelection?: string[]): Promise<Turn> {
    if (chipSelection?.[0] === NAV_BACK_TO_CITY_CHOICE) {
      return this.showCityChoice();
    }
    if (chipSelection?.[0] === NAV_BACK_TO_BENEFACTOR_SELECT) {
      return this.showBenefactorSelect();
    }
    if (chipSelection?.[0] === NAV_BACK_TO_CATEGORY_SELECT) {
      return this.showCategorySelect();
    }

    const benefactores = await getAvailableBenefactors(this.profile.city ?? "");
    if (benefactores.length === 0) {
      const reply = await this.emit(
        `El usuario esta en conversacion libre, pero su ciudad (${this.profile.city}) todavia no tiene beneficios cargados. Respondele de forma natural segun el mensaje: "${userMessage}", sin inventar beneficios ni comercios.`
      );
      return { reply, ui: [] };
    }

    const benefactorIds = this.profile.selectedBenefactors ?? [];
    const categorias =
      benefactorIds.length > 0
        ? await getAvailableCategories(benefactorIds, this.profile.city!)
        : [];

    if (chipSelection && chipSelection.length > 0) {
      const isBenefactorTap = benefactores.some((b) => chipSelection.includes(b.id));
      if (isBenefactorTap) {
        return this.resolveBenefactorSelect(userMessage, { chipSelection });
      }
      const isCategoryTap = categorias.some((c) => c.value === chipSelection[0]);
      if (isCategoryTap) {
        return this.resolveCategorySelect(userMessage, { chipSelection });
      }
      // chipSelection no reconocido contra los datos actuales (pudo quedar
      // obsoleto) - sigue de largo y trata el mensaje como texto libre.
    }

    // Cambio de ciudad y clasificacion del resto de intenciones corren en
    // paralelo (dos tareas de Haiku independientes) - el cambio de ciudad
    // tiene prioridad si el mensaje habla de ambas cosas a la vez, porque
    // invalida lo demas de todos modos.
    const [cityChange, intent] = await Promise.all([
      detectCityChange(userMessage, this.profile.city ?? ""),
      classifyOpenMessage(userMessage, {
        benefactorNames: benefactores.map((b) => b.name),
        categoryLabels: categorias.map((c) => c.label),
      }),
    ]);

    if (cityChange.changed && cityChange.newCity) {
      return this.changeCity(cityChange.newCity);
    }

    if (intent.kind === "benefactor") {
      const chosen = benefactores.find((b) => b.name === intent.label);
      if (chosen) {
        return this.resolveBenefactorSelect(userMessage, { chipSelection: [chosen.id] });
      }
    }

    if (intent.kind === "benefactors") {
      return this.resolveBenefactorSelect(userMessage, {});
    }

    if (intent.kind === "category_menu") {
      if (categorias.length === 0) {
        const reply = await this.emit(
          `El usuario quiere ver categorias, pero todavia no ha elegido ningun programa. Pidele con naturalidad que elija primero de sus programas.`
        );
        return { reply, ui: benefactores.length ? [this.benefactorChipMessage(benefactores)] : [] };
      }
      this.stage = "category_select";
      const reply = await this.emit(
        `El usuario quiere ver el menu de categorias de nuevo. Pregunta que le interesa revisar, sin listar las categorias en texto (las va a ver como opciones para tocar).`
      );
      return { reply, ui: [this.categoryChipMessage(categorias)] };
    }

    if (intent.kind === "category") {
      const chosen = categorias.find((c) => c.label === intent.label);
      if (!chosen) {
        // Nunca un error seco - se muestra el listado completo de
        // categorias disponibles en vez de un callejon sin salida.
        const reply = await this.emit(
          `El usuario pidio una categoria que ya no esta disponible. Dile con naturalidad que por ahora no tienes eso, y que puede elegir de las que si estan disponibles.`
        );
        return { reply, ui: [this.categoryChipMessage(categorias)] };
      }
      return this.showCarouselForCategory(chosen, benefactorIds);
    }

    // NINGUNA - conversacion normal, grounded, sin inventar nada.
    const reply = await this.emit(
      `El usuario esta en conversacion libre. Respondele de forma natural segun el mensaje: "${userMessage}".

Importante: en este turno NO tienes datos nuevos de beneficios reales. No inventes, nombres ni menciones ningun comercio, marca, descuento o categoria que no te haya sido dada explicitamente. No completes con conocimiento general sobre negocios reales.`
    );
    return { reply, ui: [] };
  }

  private async emit(instruction: string): Promise<string> {
    const reply = await miaConversation(this.history, instruction);
    this.history.push({ role: "assistant", content: reply });
    return reply;
  }
}
