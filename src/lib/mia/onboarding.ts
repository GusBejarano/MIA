import { miaConversation, type ChatMessage } from "./claudeClient";
import { classifyOpenMessage } from "./tasks/classifyOpenMessage";
import { matchOneFromList } from "./tasks/matchFromText";
import {
  getOrCreateUser,
  saveCity,
  saveCityInterest,
  saveLocationPermission,
  saveAffinity,
  saveProgramSelections,
  saveExposure,
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
} from "./uiMessages";
import { RELACION_ACTIVA_TERM } from "./copy";

const SUPPORTED_CITIES = ["Cali"]; // MVP: crece con el tiempo, hoy solo Cali

// Mensaje fijo del primer contacto - no se genera por LLM porque su
// redaccion exacta importa (honestidad sobre que la ubicacion si se
// guarda, para poder saltarnos esta pregunta la proxima vez).
const LOCATION_PERMISSION_MESSAGE = `¡Hola! Soy MIA. Te ayudo a descubrir los descuentos a los que ya tienes derecho, donde y cuando los necesites, incluso los que no sabías que existían.

Para empezar, ¿me compartes tu ubicación? La uso para mostrarte los descuentos disponibles cerca de ti, y la recuerdo para que la próxima vez no tengas que volver a compartirla.`;

// Idem para el mensaje que sigue cuando el usuario no comparte la
// ubicacion - tambien fijo, en vez de generado, por la misma razon.
const LOCATION_DECLINED_MESSAGE = `Sin problema, entiendo. Aunque no compartiste tu ubicación, sí puedo mostrarte las ciudades donde ya tenemos descuentos activos esperando por ti — elige la que te interese explorar:`;

// Valor especial del chip "Volver" en la pantalla de ciudades - le da al
// usuario una segunda oportunidad real de conceder el permiso.
const BACK_TO_LOCATION_PERMISSION = "__back_to_location_permission__";

// Valor especial del chip "Volver" en la pantalla de benefactores - regresa
// a la pantalla de ciudades por si quiere explorar otra.
const BACK_TO_CITY_CHOICE = "__back_to_city_choice__";

/**
 * Mensaje fijo del primer contacto con la pantalla de benefactores - fijo
 * (no LLM) porque el termino "relacion activa" necesita coincidir
 * exactamente con RELACION_ACTIVA_TERM para que el frontend le pueda
 * enganchar el tooltip encima de esa frase.
 */
function benefactorSelectMessage(city: string): string {
  return `Perfecto, ${city}. Ya tenemos descuentos activos por acá, así que hay bastante para mostrarte. Cuéntame con cuál de estos benefactores tienes una ${RELACION_ACTIVA_TERM}:`;
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
  selectedCategory?: { value: string; label: string };
};

export type Turn = { reply: string; ui: UiMessage[] };

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
    opts: { locationPermissionGranted?: boolean; detectedCity?: string } = {}
  ): Promise<Turn> {
    const user = await getOrCreateUser(this.phone);
    this.userId = user.id;

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

      if (!SUPPORTED_CITIES.includes(city)) {
        this.stage = "done";
        const reply = await this.emit(
          `El usuario regresa y ya habia concedido el permiso de ubicacion antes. Esta en ${city}, que NO tiene cobertura todavia (el MVP solo cubre ${SUPPORTED_CITIES.join(
            ", "
          )}). Saludalo reconociendo la continuidad, sin repetir el onboarding ni volver a pedir el permiso, y recuerdale con respeto que por ahora la cobertura ahi sigue siendo limitada.`
        );
        return { reply, ui: [] };
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
      const supported = SUPPORTED_CITIES.includes(city);
      await saveCity(this.userId!, city, "geolocation");
      await saveLocationPermission(this.userId!);
      this.profile.city = city;
      this.profile.locationPermissionGranted = true;

      if (!supported) {
        await saveCityInterest(this.userId!, city);
        this.stage = "done";
        const reply = await this.emit(
          `El usuario concedio el permiso de ubicacion. Se detecto que esta en ${city}, que NO tiene cobertura todavia (el MVP solo cubre ${SUPPORTED_CITIES.join(
            ", "
          )}). Explica con respeto que por ahora la cobertura es limitada, que vas a investigar que hay disponible en ${city} y le avisaras.`
        );
        return { reply, ui: [] };
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
        { label: "Volver", value: BACK_TO_CITY_CHOICE, count: 0, icon: "back" as const },
      ],
      multi: false,
      allowFreeText: true,
    };
  }

  private categoryChipMessage(categorias: CategoryOption[]): ChipSelectMessage {
    return {
      type: "chip_select",
      options: categorias.map((c) => ({ label: c.label, value: c.value, count: c.count })),
      multi: false,
      allowFreeText: true,
    };
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
      const reply = await this.emit(
        `El usuario respondio "${userMessage}" sobre con cual benefactor tiene una relacion activa, pero eso no matchea con ninguno de los que tienen beneficios cargados ahora mismo (podria ser un benefactor real que simplemente no tiene beneficios cargados todavia, o algo que no se entendio). No asumas que lo agregaste ni digas "anotado" - dile con honestidad que por ahora no tienes beneficios de eso, y pide con amabilidad que elija de las opciones disponibles o lo escriba de otra forma.`
      );
      return { reply, ui: [this.benefactorChipMessage(available)] };
    }

    this.profile.selectedBenefactors = [newId];
    await saveProgramSelections(this.userId!, [newId]);

    const chosen = available.filter((b) => b.id === newId);
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
    const reply = await this.emit(
      `El usuario tiene una relacion activa con: ${benefactorName}. Confirma con naturalidad que esto es lo que tiene disponible, sin listar detalles (eso lo va a ver como tarjetas). Luego pregunta que categoria le interesa revisar, como pregunta abierta.`
    );

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
    const reply = await this.emit(
      `El usuario quiere ver la categoria "${chosen.label}". Confirma con naturalidad que le vas a mostrar las opciones disponibles ahi (no las listes en texto, las va a ver como tarjetas que puede tocar para ver el detalle).`
    );

    const carousel: CardCarouselMessage = {
      type: "card_carousel",
      cards: benefits.map((b) => ({
        id: b.id,
        title: b.title,
        tag: b.tag,
        color: colorForId(b.sourceProgram),
        thumbUrl: b.thumbUrl,
      })),
    };
    return { reply, ui: [carousel] };
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

    const ui: DetailSheetMessage = { type: "detail_sheet", ...detail };
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
    if (chipSelection?.[0] === BACK_TO_CITY_CHOICE) {
      return this.showCityChoice();
    }

    if (!SUPPORTED_CITIES.includes(this.profile.city ?? "")) {
      const reply = await this.emit(
        `El usuario esta en conversacion libre, pero su ciudad (${this.profile.city}) todavia no tiene beneficios cargados. Respondele de forma natural segun el mensaje: "${userMessage}", sin inventar beneficios ni comercios.`
      );
      return { reply, ui: [] };
    }

    const benefactores = await getAvailableBenefactors(this.profile.city!);
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

    const intent = await classifyOpenMessage(userMessage, {
      benefactorNames: benefactores.map((b) => b.name),
      categoryLabels: categorias.map((c) => c.label),
    });

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
        const reply = await this.emit(
          `El usuario pidio una categoria que ya no esta disponible. Dile con naturalidad que por ahora no tienes eso.`
        );
        return { reply, ui: [] };
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
