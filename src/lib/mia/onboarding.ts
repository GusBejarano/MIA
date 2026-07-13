import { miaConversation, type ChatMessage } from "./claudeClient";
import { classifyOpenMessage } from "./tasks/classifyOpenMessage";
import { matchManyFromList, matchOneFromList } from "./tasks/matchFromText";
import {
  getOrCreateUserId,
  saveCity,
  saveCityInterest,
  saveAffinity,
  saveProgramSelections,
  saveExposure,
} from "./store";
import {
  getAvailableBenefactors,
  getAvailableCategories,
  getBenefitsForCategory,
  getBenefitDetail,
  colorForId,
  type BenefactorOption,
  type CategoryOption,
} from "./discovery";
import type {
  UiMessage,
  ChipSelectMessage,
  SummaryCardsMessage,
  CardCarouselMessage,
  DetailSheetMessage,
} from "./uiMessages";

const SUPPORTED_CITIES = ["Cali"]; // MVP: crece con el tiempo, hoy solo Cali
const MAX_BENEFACTORS = 3;

// Solo la ubicacion es un flujo verdaderamente secuencial/obligatorio. Todo
// lo posterior (benefactor_select/category_select/benefit_browse/done) es
// descriptivo unicamente - handleUserMessage no las usa para enrutar, todas
// pasan por freeChat, que decide que mostrar segun el mensaje y los datos
// reales (nunca segun "en que paso estaba").
export type Stage =
  | "location_permission"
  | "location_city_choice"
  | "location_city_text"
  | "benefactor_select"
  | "category_select"
  | "benefit_browse"
  | "done";

export type Profile = {
  city?: string;
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

  /** Arranca la conversacion: resuelve/crea el usuario y MIA pide el permiso de ubicacion. */
  async start(): Promise<string> {
    this.userId = await getOrCreateUserId(this.phone);

    // La API de Claude exige al menos un mensaje en `messages` - el arranque
    // no tiene un turno de usuario todavia, asi que sembramos uno sintetico
    // que representa "el usuario abrio el chat".
    this.history.push({ role: "user", content: "Hola" });

    const reply = await miaConversation(
      this.history,
      `Este es el inicio de la conversacion con un usuario nuevo. Da la bienvenida
brevemente y pide el permiso de ubicacion, aclarando que solo se usa para
mostrar descuentos cercanos y que no se guarda.`
    );
    this.history.push({ role: "assistant", content: reply });
    return reply;
  }

  /**
   * Procesa el turno del usuario. Solo la ubicacion tiene un enrutamiento
   * secuencial real (`location_permission`/`location_city_choice`/
   * `location_city_text`) - todo lo demas cae en freeChat, que interpreta
   * el mensaje (y cualquier `chipSelection`) contra los datos reales del
   * momento, no contra un estado de "paso pendiente".
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
        return this.resolveCityChoice(userMessage);
      case "location_city_text":
        return this.resolveCityText(userMessage);
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
      this.profile.city = city;

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

    const instruction = `El usuario no concedio el permiso de ubicacion. Sin insistir, ofrece el listado de ciudades disponibles del MVP (por ahora solo ${SUPPORTED_CITIES.join(
      ", "
    )}) preguntando si esta ahi o le interesa otra ciudad.`;
    this.stage = "location_city_choice";
    const reply = await this.emit(instruction);
    return { reply, ui: [] };
  }

  private async resolveCityChoice(userMessage: string): Promise<Turn> {
    const wantsOther = /otra/i.test(userMessage);

    if (wantsOther) {
      this.stage = "location_city_text";
      const reply = await this.emit(
        `El usuario quiere declarar una ciudad distinta. Pregunta en que ciudad se encuentra.`
      );
      return { reply, ui: [] };
    }

    const city = SUPPORTED_CITIES[0];
    await saveCity(this.userId!, city, "manual");
    this.profile.city = city;
    return this.startBenefactorSelect(city, true);
  }

  private async resolveCityText(userMessage: string): Promise<Turn> {
    const city = userMessage.trim();
    await saveCityInterest(this.userId!, city);
    this.stage = "done";
    const reply = await this.emit(
      `El usuario declaro que esta en ${city}, ciudad sin cobertura todavia. Confirma que vas a investigar que hay disponible ahi y que le avisaras.`
    );
    return { reply, ui: [] };
  }

  /** Arranca la etapa de seleccion de benefactores con datos reales de Supabase. */
  private async startBenefactorSelect(city: string, affirmCity: boolean): Promise<Turn> {
    const benefactores = await getAvailableBenefactors(city);

    if (benefactores.length === 0) {
      this.stage = "done";
      const reply = await this.emit(
        `No hay benefactores con beneficios cargados en ${city} todavia. Dile al usuario con naturalidad y respeto que por ahora no tienes nada ahi, sin inventar, y confirma que le avisaras apenas haya algo.`
      );
      return { reply, ui: [] };
    }

    this.stage = "benefactor_select";
    const instruction = affirmCity
      ? `El usuario concedio el permiso de ubicacion y esta en ${city}, que si tiene cobertura. Afirma la ciudad (no preguntes) y anuncia con entusiasmo moderado que hay beneficios disponibles. Luego pide que elija los programas o benefactores que tiene (puede elegir varios, hasta ${MAX_BENEFACTORS}) - los va a ver como opciones para tocar, no hace falta que los listes en texto.`
      : `Pide que el usuario elija (o agregue) los programas o benefactores que tiene (puede elegir varios, hasta ${MAX_BENEFACTORS}) - los va a ver como opciones para tocar, no hace falta que los listes en texto.`;

    const reply = await this.emit(instruction);
    return { reply, ui: [this.benefactorChipMessage(benefactores)] };
  }

  private benefactorChipMessage(benefactores: BenefactorOption[]): ChipSelectMessage {
    return {
      type: "chip_select",
      options: benefactores.map((b) => ({
        label: b.name,
        value: b.id,
        count: b.count,
        color: b.color,
      })),
      multi: true,
      maxSelect: MAX_BENEFACTORS,
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
   * Resuelve una seleccion de benefactores - por chip o por texto libre.
   * SUMA a lo que ya tenia elegido (no reemplaza): si el usuario ya tenia
   * Comfandi y ahora dice "tambien tengo Comfenalco", se queda con ambos.
   */
  private async resolveBenefactorSelect(
    userMessage: string,
    opts: { chipSelection?: string[] }
  ): Promise<Turn> {
    const available = await getAvailableBenefactors(this.profile.city!);

    let newIds: string[];
    if (opts.chipSelection && opts.chipSelection.length > 0) {
      const validIds = new Set(available.map((b) => b.id));
      newIds = opts.chipSelection.filter((id) => validIds.has(id));
    } else {
      const names = available.map((b) => b.name);
      const matchedNames = await matchManyFromList(userMessage, names);
      newIds = matchedNames
        .map((name) => available.find((b) => b.name === name)?.id)
        .filter((id): id is string => Boolean(id));
    }

    if (newIds.length === 0) {
      const reply = await this.emit(
        `El usuario respondio "${userMessage}" sobre que programas tiene, pero eso no matchea con ninguno de los que tienen beneficios cargados ahora mismo (podria ser un programa real que simplemente no tiene beneficios cargados todavia, o algo que no se entendio). No asumas que lo agregaste ni digas "anotado" - dile con honestidad que por ahora no tienes beneficios de eso, y pide con amabilidad que elija de las opciones disponibles o lo escriba de otra forma.`
      );
      return { reply, ui: [this.benefactorChipMessage(available)] };
    }

    const merged = [...new Set([...(this.profile.selectedBenefactors ?? []), ...newIds])].slice(
      0,
      MAX_BENEFACTORS
    );
    this.profile.selectedBenefactors = merged;
    await saveProgramSelections(this.userId!, merged);

    const chosen = available.filter((b) => merged.includes(b.id));
    const categorias = await getAvailableCategories(merged, this.profile.city!);

    if (categorias.length === 0) {
      this.stage = "done";
      const reply = await this.emit(
        `El usuario eligio programas validos, pero no hay categorias con beneficios activos para ellos en este momento. Dile con naturalidad y respeto, sin inventar, y confirma que le avisaras apenas haya algo.`
      );
      return { reply, ui: [] };
    }

    this.stage = "category_select";
    const namesJoined = chosen.map((b) => b.name).join(" y ");
    const reply = await this.emit(
      `El usuario tiene registrados estos programas: ${namesJoined}. Confirma con naturalidad que esto es lo que tiene disponible, sin listar detalles (eso lo va a ver como tarjetas). Luego pregunta que categoria le interesa revisar, como pregunta abierta.`
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
