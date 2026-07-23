import { miaConversation, type ChatMessage } from "./claudeClient";
import { classifyOpenMessage } from "./tasks/classifyOpenMessage";
import { matchOneFromList } from "./tasks/matchFromText";
import { detectCityChange } from "./tasks/detectCityChange";
import { parseProfileAnswer, type ProfileFieldKey, type GenderValue } from "./tasks/parseProfileAnswer";
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
  getExposedBenefitIds,
  getUserProgramIds,
  getLastBusinessSearchAt,
  markBusinessSearchUsed,
  logBusinessSearchEvent,
  getReminderThresholdDays,
  selectPendingProfileField,
  recordProfileFieldAsked,
  recordProfileFieldAnswered,
  recordProfileFieldDeclined,
  saveProfileFieldValue,
} from "./store";
import {
  getAvailableBenefactors,
  getAvailableCategories,
  getAvailableCities,
  getBenefitsForCategory,
  getBenefitDetail,
  getProgramNamesByIds,
  formatDateEs,
  colorForId,
  type BenefactorOption,
  type CategoryOption,
  type CityOption,
} from "./discovery";
import { cityMatches } from "./cityMatch";
import { findBusinessMatches } from "./businessSearch";
import type {
  UiMessage,
  ChipSelectMessage,
  SummaryCardsMessage,
  CardCarouselMessage,
  DetailSheetMessage,
  TipMessage,
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

// Valores del chip Si/Declinar de la confirmacion de un campo de perfil
// (aprendizaje progresivo, v1.4) - local por la misma razon que
// BACK_TO_LOCATION_PERMISSION: solo los usa este chip puntual.
const CONFIRM_PROFILE_FIELD = "__confirm_profile_field__";
const DECLINE_PROFILE_FIELD = "__decline_profile_field__";

const GENDER_LABEL_ES: Record<GenderValue, string> = {
  femenino: "femenino",
  masculino: "masculino",
  otro: "otro",
  prefiero_no_decir: "prefiero no decir",
};

/**
 * Pregunta de confirmacion de un tap antes de guardar un campo de perfil -
 * fija (no LLM) porque el valor interpretado tiene que aparecer tal cual se
 * va a guardar, sin parafraseo que pueda introducir ambiguedad.
 */
function profileConfirmationQuestion(fieldKey: ProfileFieldKey, value: string): string {
  switch (fieldKey) {
    case "name":
      return `¿Quieres que de ahora en adelante me dirija a ti como ${value}?`;
    case "gender":
      return `¿Confirmas que prefieres que me dirija a ti como ${GENDER_LABEL_ES[value as GenderValue]}?`;
    case "birth_date":
      return `¿Confirmas que tu fecha de nacimiento es ${formatDateEs(value)}?`;
  }
}

/** Frase corta al confirmar un campo de perfil - se antepone al mensaje de benefactores (continueAfterProfileFlow). */
function profileConfirmedAck(fieldKey: ProfileFieldKey, value: string): string {
  switch (fieldKey) {
    case "name":
      return `¡Listo! Te voy a llamar ${value} de ahora en adelante.`;
    case "gender":
      return `Anotado, gracias por contármelo.`;
    case "birth_date":
      return `¡Genial, ya quedó guardado! Te tendré algo especial ese día.`;
  }
}

const KNOWN_PROFILE_FIELD_KEYS: readonly ProfileFieldKey[] = ["name", "gender", "birth_date"];
function isKnownProfileFieldKey(key: string): key is ProfileFieldKey {
  return (KNOWN_PROFILE_FIELD_KEYS as readonly string[]).includes(key);
}

// Chips directos para la pregunta de gender - a diferencia de name/birth_date
// (texto libre + confirmacion de un tap), tocar una de estas 3 opciones YA
// es la confirmacion, mismo patron que elegir un benefactor/categoria por
// chip (no hay paso de "Si/Declinar" despues). Solo 3 opciones (no las 4
// que acepta el CHECK de users.gender) - "otro" queda disponible unicamente
// si el usuario prefiere escribirlo por texto libre (allowFreeText sigue
// activo, cae al flujo normal de interpretar+confirmar).
const GENDER_CHIP_OPTIONS: { label: string; value: GenderValue }[] = [
  { label: "Mujer", value: "femenino" },
  { label: "Hombre", value: "masculino" },
  { label: "No importa", value: "prefiero_no_decir" },
];

function genderChipMessage(): ChipSelectMessage {
  return {
    type: "chip_select",
    options: GENDER_CHIP_OPTIONS.map((o) => ({
      label: o.label,
      value: o.value,
      count: 0,
      icon: "none" as const,
    })),
    multi: false,
    allowFreeText: true,
  };
}

/** UI adicional al preguntar un campo de perfil - solo `gender` trae chips (tap directo, sin confirmacion aparte); `name`/`birth_date` siguen siendo texto libre + confirmacion. */
function profileFieldAskUi(fieldKey: ProfileFieldKey): UiMessage[] {
  return fieldKey === "gender" ? [genderChipMessage()] : [];
}

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
  /** Ya se mostro el tip de "recordar" el buscador de negocio en esta sesion (regreso) - evita repetirlo en cada detalle mientras siga vencido. Se reinicia solo con una sesion nueva de verdad (ver start()). */
  remindTipShownThisSession?: boolean;
  /** Campo de perfil (aprendizaje progresivo, v1.4) que se le acaba de preguntar - el proximo mensaje libre del usuario se interpreta como su respuesta a ESTE campo, no como conversacion normal. */
  pendingProfileField?: ProfileFieldKey;
  /** Valor ya interpretado de un campo de perfil, esperando el tap de confirmacion (Si/Declinar) antes de guardarlo. */
  pendingProfileConfirmation?: { fieldKey: ProfileFieldKey; value: string };
  /**
   * Se pregunto (o se iba a preguntar) un campo de perfil en este regreso -
   * "maximo una cosa extra por regreso": mientras sea true, el tip del
   * buscador de negocio no se muestra en esta sesion, sin importar su
   * propia logica de ensenar/recordar (ver maybeBusinessSearchTip).
   */
  profileLearningActiveThisSession?: boolean;
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
      // Aprendizaje progresivo del perfil (v1.4) - a lo sumo un campo
      // pendiente por regreso, y ocupa el unico "extra" de esta sesion
      // (suprime el tip del buscador de negocio, ver maybeBusinessSearchTip).
      const pendingField = await selectPendingProfileField(this.userId!);
      if (pendingField && isKnownProfileFieldKey(pendingField.fieldKey)) {
        this.profile.profileLearningActiveThisSession = true;
        this.profile.pendingProfileField = pendingField.fieldKey;
        // Se registra AL PREGUNTAR (no solo al confirmar/declinar) - ver el
        // comentario de recordProfileFieldAsked en store.ts.
        await recordProfileFieldAsked(this.userId!, pendingField.fieldKey);

        const greeting = await miaConversation(
          this.history,
          `El usuario regresa (ya habia concedido el permiso de ubicacion antes) y esta en ${city}, que si tiene cobertura. Saludalo con calidez reconociendo la continuidad, en una sola frase breve - no repitas el onboarding, no vuelvas a pedir el permiso de ubicacion, y no hagas ninguna otra pregunta ni menciones benefactores todavia (eso viene despues, en otro mensaje aparte).`
        );
        // prompt_text va tal cual esta en profile_learning_fields, sin
        // pasar por el LLM (es copy de producto ya decidido).
        const reply = `${greeting}\n\n${pendingField.promptText}`;
        this.history.push({ role: "assistant", content: reply });
        return { reply, ui: profileFieldAskUi(pendingField.fieldKey) };
      }

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

    // Leidos ANTES de guardar la exposicion/actualizar last_business_search_at
    // de este mismo turno - "primer beneficio explorado" necesita saber
    // cuantas exposiciones habia antes de esta, y si este detalle llego
    // via resolveBusinessSearch, last_business_search_at ya fue actualizado
    // a "ahora" mas arriba en el mismo turno (por eso no se ofrece ensenar
    // ni recordar justo despues de usarlo - ver maybeBusinessSearchTip).
    const [priorExposures, lastBusinessSearchAt] = await Promise.all([
      getExposedBenefitIds(this.userId!),
      getLastBusinessSearchAt(this.userId!),
    ]);

    await saveExposure(this.userId!, benefitId);

    const reply = await this.emit(
      `El usuario quiere ver el detalle de "${detail.title}". Dale una intro breve y natural (una sola frase) - el detalle completo se lo muestra la tarjeta, no lo repitas en texto.`
    );

    const rating = await getRating(this.userId!, benefitId);

    const { sourceProgramId, ...detailRest } = detail;
    const [programNames, userProgramIds] = await Promise.all([
      getProgramNamesByIds([sourceProgramId]),
      getUserProgramIds(this.userId!),
    ]);
    const relation = {
      programId: sourceProgramId,
      programName: programNames.get(sourceProgramId) ?? "",
      hasRelation: userProgramIds.includes(sourceProgramId),
    };

    // Ruta de contexto (Ciudad › Benefactor › Categoria) en vez del tag
    // plano - el benefactor sale de `relation.programName` (recien resuelto
    // arriba desde el beneficio real), no de `profile.selectedBenefactorName`:
    // ese campo solo se llena en el flujo guiado por chips (se pisa al
    // elegir el chip de benefactor), asi que un beneficio llegado por el
    // buscador de negocio (1.3.0) lo dejaba vacio y el breadcrumb salia con
    // un hueco ("Cali ›  › Categoria").
    const breadcrumb = `${this.profile.city} › ${relation.programName} › ${detail.tag}`;

    const ui: DetailSheetMessage = { type: "detail_sheet", ...detailRest, tag: breadcrumb, rating, relation };
    const uiBlocks: UiMessage[] = [ui];

    const tip = await this.maybeBusinessSearchTip(priorExposures.length === 0, lastBusinessSearchAt);
    if (tip) uiBlocks.push(tip);

    return { reply, ui: uiBlocks };
  }

  /**
   * Decide si mostrar el tip de bajo perfil sobre el buscador de negocio,
   * despues de ver un detalle de beneficio - "ensenar" una sola vez (nunca
   * lo uso Y este es su primer beneficio explorado jamas), o "recordar" con
   * moderacion (ya lo uso, pero hace mas dias que el umbral configurable en
   * app_settings, y todavia no se lo mostramos en este regreso).
   */
  private async maybeBusinessSearchTip(
    isFirstEverDetailView: boolean,
    lastBusinessSearchAt: string | null
  ): Promise<TipMessage | null> {
    // "Maximo una cosa extra por regreso" (v1.4): si en este regreso ya se
    // pregunto (o se iba a preguntar) un campo de perfil, el tip del
    // buscador de negocio no se muestra, sin importar su propia logica.
    if (this.profile.profileLearningActiveThisSession) return null;

    if (lastBusinessSearchAt === null) {
      if (!isFirstEverDetailView) return null;
      return {
        type: "tip",
        tone: "hint",
        text: "La próxima vez, solo escríbeme el nombre de cualquier negocio y te digo si tienes descuento ahí.",
      };
    }

    if (this.profile.remindTipShownThisSession) return null;

    const thresholdDays = await getReminderThresholdDays();
    const daysSince = (Date.now() - new Date(lastBusinessSearchAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= thresholdDays) return null;

    this.profile.remindTipShownThisSession = true;
    return {
      type: "tip",
      tone: "reminder",
      text: "Recuerda que puedes preguntarme por cualquier negocio directamente.",
    };
  }

  /**
   * Buscador de negocio por texto libre (Parte 1) - busca en 2 capas (ver
   * businessSearch.ts) y ramifica segun cuantos resultados activos hay en
   * la ciudad actual del usuario: 1 -> detalle directo, 2+ -> mini-carrusel
   * con badge de relacion, 0 en la ciudad pero si en otra -> honesto sobre
   * cobertura futura, 0 en cualquier ciudad -> honesto sobre que no existe.
   * El intento en si (cualquiera de los 4 casos) marca last_business_search_at.
   */
  private async resolveBusinessSearch(query: string): Promise<Turn> {
    const trimmed = query.trim();
    if (!trimmed) {
      const reply = await this.emit(
        `El usuario quiso preguntar por un negocio puntual pero no se entendio el nombre. Pide con amabilidad que lo escriba de nuevo.`
      );
      return { reply, ui: [] };
    }

    const matches = await findBusinessMatches(trimmed);
    await markBusinessSearchUsed(this.userId!);

    if (matches.length === 0) {
      await logBusinessSearchEvent(this.userId!, "business_search_miss", trimmed);
      const reply = await this.emit(
        `El usuario pregunto si tiene descuento en "${trimmed}", pero ese negocio no existe en el catalogo, en ninguna ciudad. Dile con honestidad y respeto que por ahora no tienes ese negocio, sin inventar nada.`
      );
      return { reply, ui: [] };
    }

    const city = this.profile.city ?? "";
    const inCity = matches.filter((m) => cityMatches(m.city, city));

    if (inCity.length === 0) {
      await logBusinessSearchEvent(this.userId!, "business_search_out_of_city", trimmed);
      const reply = await this.emit(
        `El usuario pregunto si tiene descuento en "${trimmed}". SI existe en el catalogo con descuento activo, pero todavia no en su ciudad actual (${city}) - existe en otra(s) ciudad(es). Dile con honestidad que ese negocio si tiene descuento pero todavia no ahi, sin prometer fecha ni inventar detalles del beneficio.`
      );
      return { reply, ui: [] };
    }

    if (inCity.length === 1) {
      return this.viewBenefitDetail(inCity[0].id);
    }

    const programIds = [...new Set(inCity.map((m) => m.sourceProgramId))];
    const [programNames, userProgramIds] = await Promise.all([
      getProgramNamesByIds(programIds),
      getUserProgramIds(this.userId!),
    ]);

    const reply = await this.emit(
      `El usuario pregunto si tiene descuento en "${trimmed}" y hay ${inCity.length} opciones activas en ${city}. Dile con naturalidad que encontraste mas de una opcion y que elija cual le interesa - no listes los nombres en texto, los va a ver como tarjetas para tocar.`
    );

    const carousel: CardCarouselMessage = {
      type: "card_carousel",
      cards: inCity.map((m) => ({
        id: m.id,
        title: m.title,
        tag: programNames.get(m.sourceProgramId) ?? "",
        color: colorForId(m.sourceProgramId),
        thumbUrl: m.imageUrl,
        rating: 0,
        relationBadge: userProgramIds.includes(m.sourceProgramId) ? "activa" : "sin_relacion",
      })),
    };

    return { reply, ui: [carousel] };
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
    // Aprendizaje progresivo del perfil (v1.4) - si se acaba de preguntar un
    // campo, este turno es exclusivamente la respuesta (o el tap de
    // confirmacion) a ESE campo, nunca conversacion/seleccion normal.
    if (this.profile.pendingProfileConfirmation) {
      return this.resolveProfileConfirmation(chipSelection);
    }
    if (this.profile.pendingProfileField === "gender" && chipSelection?.[0]) {
      const tapped = GENDER_CHIP_OPTIONS.find((o) => o.value === chipSelection[0]);
      if (tapped) {
        return this.resolveGenderChipTap(tapped.value);
      }
      // chipSelection no coincide con ninguna opcion de gender (obsoleto o
      // de otra pantalla) - sigue de largo y trata el mensaje como texto
      // libre, mismo criterio que el resto de los chips de la app.
    }
    if (this.profile.pendingProfileField) {
      return this.resolveProfileAnswer(userMessage);
    }

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

    if (intent.kind === "business_search") {
      return this.resolveBusinessSearch(intent.businessName);
    }

    // NINGUNA - conversacion normal, grounded, sin inventar nada.
    const reply = await this.emit(
      `El usuario esta en conversacion libre. Respondele de forma natural segun el mensaje: "${userMessage}".

Importante: en este turno NO tienes datos nuevos de beneficios reales. No inventes, nombres ni menciones ningun comercio, marca, descuento o categoria que no te haya sido dada explicitamente. No completes con conocimiento general sobre negocios reales.`
    );
    return { reply, ui: [] };
  }

  /**
   * Tap directo en una de las 3 opciones de gender - a diferencia de
   * name/birth_date, elegir el chip YA es la confirmacion (mismo patron que
   * elegir un benefactor/categoria), no hay paso de "Si/Declinar" despues.
   */
  private async resolveGenderChipTap(value: GenderValue): Promise<Turn> {
    this.profile.pendingProfileField = undefined;
    await saveProfileFieldValue(this.userId!, "gender", value);
    await recordProfileFieldAnswered(this.userId!, "gender");
    return this.continueAfterProfileFlow(profileConfirmedAck("gender", value));
  }

  /**
   * Interpreta la respuesta libre del usuario al campo de perfil que se le
   * acaba de preguntar. Si trae un valor usable, pide confirmacion de un tap
   * antes de guardar nada; si no (declina, o la respuesta no sirve), cuenta
   * como intento fallido y sigue directo a los benefactores - nunca se
   * vuelve a preguntar el mismo campo en esta sesion.
   */
  private async resolveProfileAnswer(userMessage: string): Promise<Turn> {
    const fieldKey = this.profile.pendingProfileField!;
    this.profile.pendingProfileField = undefined;

    const value = await parseProfileAnswer(fieldKey, userMessage);

    if (value === null) {
      await recordProfileFieldDeclined(this.userId!, fieldKey);
      return this.continueAfterProfileFlow("Sin problema, no hay afán.");
    }

    this.profile.pendingProfileConfirmation = { fieldKey, value };
    const reply = profileConfirmationQuestion(fieldKey, value);
    this.history.push({ role: "assistant", content: reply });
    return {
      reply,
      ui: [
        {
          type: "chip_select",
          options: [
            { label: "Sí", value: CONFIRM_PROFILE_FIELD, count: 0, icon: "none" as const },
            { label: "Déjame pensarlo", value: DECLINE_PROFILE_FIELD, count: 0, icon: "none" as const },
          ],
          multi: false,
          allowFreeText: false,
        },
      ],
    };
  }

  /** Resuelve el tap de confirmacion (Si/Declinar) de un campo de perfil ya interpretado. */
  private async resolveProfileConfirmation(chipSelection?: string[]): Promise<Turn> {
    const pending = this.profile.pendingProfileConfirmation!;
    this.profile.pendingProfileConfirmation = undefined;

    const confirmed = chipSelection?.[0] === CONFIRM_PROFILE_FIELD;

    if (confirmed) {
      await saveProfileFieldValue(this.userId!, pending.fieldKey, pending.value);
      await recordProfileFieldAnswered(this.userId!, pending.fieldKey);
      return this.continueAfterProfileFlow(profileConfirmedAck(pending.fieldKey, pending.value));
    }

    await recordProfileFieldDeclined(this.userId!, pending.fieldKey);
    return this.continueAfterProfileFlow("Sin problema, no hay afán.");
  }

  /** Cierra el sub-flujo de aprendizaje de perfil y retoma la pantalla de benefactores que se difirio para no mostrar dos cosas a la vez. */
  private async continueAfterProfileFlow(leadIn: string): Promise<Turn> {
    const benefactores = await getAvailableBenefactors(this.profile.city!);

    if (benefactores.length === 0) {
      this.stage = "done";
      const reply = await this.emit(
        `${leadIn} Ademas, no hay benefactores con beneficios cargados en ${this.profile.city} todavia. Dile con naturalidad y respeto que por ahora no tienes nada ahi, sin inventar, y confirma que le avisaras apenas haya algo.`
      );
      return { reply, ui: [] };
    }

    const reply = `${leadIn} ¿Con cuál de tus benefactores tienes una relación activa?`;
    this.history.push({ role: "assistant", content: reply });
    return { reply, ui: [this.benefactorChipMessage(benefactores)] };
  }

  private async emit(instruction: string): Promise<string> {
    const reply = await miaConversation(this.history, instruction);
    this.history.push({ role: "assistant", content: reply });
    return reply;
  }
}
