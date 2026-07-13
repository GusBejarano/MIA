import { miaConversation, type ChatMessage } from "./claudeClient";
import { type AffinityCategory, affinityForRealCategory } from "./categoryMapping";
import { rankBenefits } from "./tasks/rankBenefits";
import { detectBenefitRequest } from "./tasks/detectBenefitRequest";
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
  getDailyDetailViewCount,
  colorForId,
  DAILY_DETAIL_VIEW_LIMIT,
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
  affinity?: AffinityCategory;
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
   * Procesa el turno del usuario segun el estado actual.
   * - `locationPermissionGranted`/`detectedCity`: evento real de geolocalizacion
   *   del navegador, solo aplica en location_permission.
   * - `chipSelection`: valores elegidos al tocar chips (benefactores o categoria).
   * - `viewDetailId`: el usuario toco una tarjeta del carrusel para ver el detalle -
   *   se procesa sin importar en que etapa este la sesion.
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
      case "benefactor_select":
        return this.resolveBenefactorSelect(userMessage, opts);
      case "category_select":
        return this.resolveCategorySelect(userMessage, opts);
      default:
        return this.freeChat(userMessage);
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
      : `Pide que el usuario elija los programas o benefactores que tiene (puede elegir varios, hasta ${MAX_BENEFACTORS}) - los va a ver como opciones para tocar, no hace falta que los listes en texto.`;

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

  private async resolveBenefactorSelect(
    userMessage: string,
    opts: { chipSelection?: string[] }
  ): Promise<Turn> {
    const available = await getAvailableBenefactors(this.profile.city!);

    let benefactorIds: string[];
    if (opts.chipSelection && opts.chipSelection.length > 0) {
      const validIds = new Set(available.map((b) => b.id));
      benefactorIds = opts.chipSelection.filter((id) => validIds.has(id)).slice(0, MAX_BENEFACTORS);
    } else {
      const names = available.map((b) => b.name);
      const matchedNames = await matchManyFromList(userMessage, names);
      benefactorIds = matchedNames
        .map((name) => available.find((b) => b.name === name)?.id)
        .filter((id): id is string => Boolean(id))
        .slice(0, MAX_BENEFACTORS);
    }

    if (benefactorIds.length === 0) {
      const reply = await this.emit(
        `No se entendio bien la respuesta del usuario sobre que programas tiene. Pide con amabilidad que elija de las opciones o lo escriba de nuevo.`
      );
      return { reply, ui: [this.benefactorChipMessage(available)] };
    }

    this.profile.selectedBenefactors = benefactorIds;
    await saveProgramSelections(this.userId!, benefactorIds);

    const chosen = available.filter((b) => benefactorIds.includes(b.id));
    const categorias = await getAvailableCategories(benefactorIds, this.profile.city!);

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
      `El usuario eligio estos programas: ${namesJoined}. Confirma con naturalidad que esto es lo que tiene disponible, sin listar detalles (eso lo va a ver como tarjetas). Luego pregunta que categoria le interesa revisar primero, como pregunta abierta.`
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
    const categoryChips: ChipSelectMessage = {
      type: "chip_select",
      options: categorias.map((c) => ({ label: c.label, value: c.value, count: c.count })),
      multi: false,
      allowFreeText: true,
    };

    return { reply, ui: [summary, categoryChips] };
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

    const categoryChips: ChipSelectMessage = {
      type: "chip_select",
      options: categorias.map((c) => ({ label: c.label, value: c.value, count: c.count })),
      multi: false,
      allowFreeText: true,
    };

    if (!chosen) {
      const reply = await this.emit(
        `No se entendio bien que categoria eligio el usuario. Pide con amabilidad que elija de las opciones.`
      );
      return { reply, ui: [categoryChips] };
    }

    this.profile.selectedCategory = { value: chosen.value, label: chosen.label };
    this.profile.affinity = affinityForRealCategory(chosen.value);
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
      `El usuario eligio la categoria "${chosen.label}". Confirma con naturalidad que le vas a mostrar los beneficios disponibles ahi (no los listes en texto, los va a ver como tarjetas que puede tocar para ver el detalle).`
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
    const viewsToday = await getDailyDetailViewCount(this.userId!);
    if (viewsToday >= DAILY_DETAIL_VIEW_LIMIT) {
      const reply = await this.emit(
        `El usuario quiere ver el detalle de un beneficio, pero ya alcanzo el limite de ${DAILY_DETAIL_VIEW_LIMIT} beneficios revisados hoy. Dile con naturalidad y buena onda que puede volver mañana a ver mas, sin sonar restrictivo ni corporativo.`
      );
      return { reply, ui: [] };
    }

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

  private async freeChat(userMessage: string): Promise<Turn> {
    const detection = await detectBenefitRequest(userMessage);

    if (!detection.isRequest) {
      const reply = await this.emit(
        `El usuario ya completo la seleccion inicial y esta en conversacion libre. Respondele de forma natural segun el mensaje: "${userMessage}".

Importante: en este turno NO tienes datos nuevos de beneficios reales. No inventes, nombres ni menciones ningun comercio, marca o descuento nuevo. No completes con conocimiento general sobre negocios reales.`
      );
      return { reply, ui: [] };
    }

    if (!SUPPORTED_CITIES.includes(this.profile.city ?? "")) {
      const reply = await this.emit(
        `El usuario esta pidiendo beneficios, pero su ciudad (${this.profile.city}) todavia no tiene beneficios cargados. Dile con naturalidad y respeto que por ahora no tienes nada ahi, sin inventar, y confirma que le avisaras apenas haya algo.`
      );
      return { reply, ui: [] };
    }

    const affinity = detection.affinity ?? this.profile.affinity;
    if (!affinity) {
      const reply = await this.emit(
        `El usuario esta pidiendo beneficios (mensaje: "${userMessage}") pero no quedo claro de que categoria. Pregunta con naturalidad que tipo de beneficio busca.`
      );
      return { reply, ui: [] };
    }

    const recommendations = await rankBenefits({
      userId: this.userId!,
      city: this.profile.city!,
      affinity,
    });

    for (const r of recommendations) {
      await saveExposure(this.userId!, r.benefit.id);
    }

    if (recommendations.length === 0) {
      const reply = await this.emit(
        `El usuario esta pidiendo beneficios (respondiendo a: "${userMessage}"), pero no hay ninguno real disponible que aplique para "${affinity}" con su ciudad y programas declarados. Dile con naturalidad y respeto que por ahora no tienes algo asi, sin inventar ni forzar una recomendacion, y confirma que le avisaras apenas haya algo.`
      );
      return { reply, ui: [] };
    }

    const listado = recommendations
      .map((r, i) => {
        const tag = r.alreadyShown ? "[ya se lo mostraste antes]" : "[nuevo]";
        return `${i + 1}. ${r.benefit.title} (${r.benefit.sourceProgram}) ${tag} - ${r.reason}`;
      })
      .join("\n");

    const reply = await this.emit(
      `El usuario esta pidiendo beneficios en conversacion libre (mensaje: "${userMessage}"). Aqui tienes ${recommendations.length} opciones reales seleccionadas para "${affinity}":\n${listado}\n\nPresentalas en tu propio tono, respetando la razon de cada una. Si alguna esta marcada [ya se lo mostraste antes], menciona con naturalidad que sigue siendo una buena opcion para el - no la escondas ni finjas que es nueva. No inventes ninguna adicional.`
    );
    return { reply, ui: [] };
  }

  private async emit(instruction: string): Promise<string> {
    const reply = await miaConversation(this.history, instruction);
    this.history.push({ role: "assistant", content: reply });
    return reply;
  }
}
