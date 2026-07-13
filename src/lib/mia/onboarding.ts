import { miaConversation, type ChatMessage } from "./claudeClient";
import {
  classifyAffinity,
  type AffinityCategory,
} from "./tasks/classifyAffinity";
import { extractPrograms } from "./tasks/extractPrograms";
import { rankBenefits } from "./tasks/rankBenefits";
import { detectBenefitRequest } from "./tasks/detectBenefitRequest";
import {
  getOrCreateUserId,
  saveCity,
  saveCityInterest,
  saveAffinity,
  savePrograms,
  saveExposure,
} from "./store";

const SUPPORTED_CITIES = ["Cali"]; // MVP: crece con el tiempo, hoy solo Cali

export type Stage =
  | "location_permission"
  | "location_city_choice"
  | "location_city_text"
  | "affinity"
  | "programs"
  | "reveal"
  | "done";

export type Profile = {
  city?: string;
  affinity?: AffinityCategory;
  programs?: string[];
};

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
   * Procesa el turno del usuario segun el estado actual. `locationPermissionGranted`
   * y `detectedCity` solo aplican en el estado location_permission - vienen del
   * evento real de geolocalizacion del navegador, no de un mensaje de chat.
   */
  async handleUserMessage(
    userMessage: string,
    opts: { locationPermissionGranted?: boolean; detectedCity?: string } = {}
  ): Promise<string> {
    this.history.push({ role: "user", content: userMessage });

    switch (this.stage) {
      case "location_permission":
        return this.resolveLocationPermission(opts);
      case "location_city_choice":
        return this.resolveCityChoice(userMessage);
      case "location_city_text":
        return this.resolveCityText(userMessage);
      case "affinity":
        return this.resolveAffinity(userMessage);
      case "programs":
        return this.resolvePrograms(userMessage);
      default:
        return this.freeChat(userMessage);
    }
  }

  private async resolveLocationPermission(opts: {
    locationPermissionGranted?: boolean;
    detectedCity?: string;
  }): Promise<string> {
    if (opts.locationPermissionGranted) {
      const city = opts.detectedCity ?? "Cali";
      const supported = SUPPORTED_CITIES.includes(city);
      await saveCity(this.userId!, city, "geolocation");
      this.profile.city = city;

      if (!supported) await saveCityInterest(this.userId!, city);

      const instruction = supported
        ? `El usuario concedio el permiso de ubicacion. Se detecto que esta en ${city}, que si tiene cobertura. Afirma la ciudad (no preguntes) y anuncia que hay descuentos disponibles hoy. Luego continua con la siguiente pregunta: que tipo de plan le interesa mas (comer bien, viajar, entretenimiento, salud y bienestar), como pregunta abierta.`
        : `El usuario concedio el permiso de ubicacion. Se detecto que esta en ${city}, que NO tiene cobertura todavia (el MVP solo cubre ${SUPPORTED_CITIES.join(
            ", "
          )}). Explica con respeto que por ahora la cobertura es limitada a ${SUPPORTED_CITIES.join(
            ", "
          )}, que vas a investigar que hay disponible en ${city} y le avisaras. Luego continua con la siguiente pregunta: que tipo de plan le interesa mas (comer bien, viajar, entretenimiento, salud y bienestar), como pregunta abierta.`;

      this.stage = "affinity";
      return this.emit(instruction);
    }

    // No concedio el permiso -> listado de ciudades de respaldo
    const instruction = `El usuario no concedio el permiso de ubicacion. Sin insistir, ofrece el listado de ciudades disponibles del MVP (por ahora solo ${SUPPORTED_CITIES.join(
      ", "
    )}) preguntando si esta ahi o le interesa otra ciudad.`;
    this.stage = "location_city_choice";
    return this.emit(instruction);
  }

  private async resolveCityChoice(userMessage: string): Promise<string> {
    const wantsOther = /otra/i.test(userMessage);

    if (wantsOther) {
      this.stage = "location_city_text";
      return this.emit(
        `El usuario quiere declarar una ciudad distinta. Pregunta en que ciudad se encuentra.`
      );
    }

    const city = SUPPORTED_CITIES[0];
    await saveCity(this.userId!, city, "manual");
    this.profile.city = city;
    this.stage = "affinity";
    return this.emit(
      `El usuario confirmo que esta en ${city}. Continua con la siguiente pregunta: que tipo de plan le interesa mas (comer bien, viajar, entretenimiento, salud y bienestar), como pregunta abierta.`
    );
  }

  private async resolveCityText(userMessage: string): Promise<string> {
    const city = userMessage.trim();
    await saveCityInterest(this.userId!, city);
    this.stage = "affinity";
    return this.emit(
      `El usuario declaro que esta en ${city}, ciudad sin cobertura todavia. Confirma que vas a investigar que hay disponible ahi y que le avisaras. Luego continua con la siguiente pregunta: que tipo de plan le interesa mas (comer bien, viajar, entretenimiento, salud y bienestar), como pregunta abierta.`
    );
  }

  private async resolveAffinity(userMessage: string): Promise<string> {
    const category = await classifyAffinity(userMessage);
    await saveAffinity(this.userId!, category);
    this.profile.affinity = category;
    this.stage = "programs";
    return this.emit(
      `Continua con la ultima pregunta: si cuenta con alguno de estos programas - Comfandi, Comfenalco, Visa, Mastercard, Puntos Colombia, PriceSmart. Puede mencionar varios o ninguno.`
    );
  }

  private async resolvePrograms(userMessage: string): Promise<string> {
    const programs = await extractPrograms(userMessage);
    await savePrograms(this.userId!, programs);
    this.profile.programs = programs;
    this.stage = "reveal";

    if (!SUPPORTED_CITIES.includes(this.profile.city ?? "")) {
      // Ciudad sin cobertura: no hay reveal real todavia.
      this.stage = "done";
      return this.emit(
        `El perfil quedo completo, pero su ciudad (${this.profile.city}) no tiene beneficios cargados todavia. Agradece y confirma que le avisaras apenas haya beneficios disponibles ahi. No inventes recomendaciones.`
      );
    }

    const recommendations = await rankBenefits({
      userId: this.userId!,
      city: this.profile.city!,
      affinity: this.profile.affinity!,
    });

    for (const r of recommendations) {
      await saveExposure(this.userId!, r.benefit.id);
    }

    this.stage = "done";

    if (recommendations.length === 0) {
      return this.emit(
        `El perfil quedo completo, pero por ahora no hay beneficios cargados que apliquen a su combinacion de ciudad, afinidad y programas declarados. Agradece con naturalidad y respeto, sin inventar ni forzar una recomendacion que no aplique, y confirma que le avisaras apenas haya algo bueno para mostrarle.`
      );
    }

    const listado = recommendations
      .map(
        (r, i) =>
          `${i + 1}. ${r.benefit.title} (${r.benefit.sourceProgram}) - ${r.reason}`
      )
      .join("\n");

    return this.emit(
      `Este es el momento del reveal. Presenta exactamente estas ${recommendations.length} recomendaciones ya seleccionadas, con su razon, en tu propio tono (no las reescribas de forma generica, respeta la razon de cada una):\n${listado}\n\nCierra invitando a que escriba cuando quiera para ver que hay de nuevo.`
    );
  }

  private async freeChat(userMessage: string): Promise<string> {
    const detection = await detectBenefitRequest(userMessage);

    if (!detection.isRequest) {
      return this.emit(
        `El usuario ya completo el onboarding y esta en conversacion libre. Respondele de forma natural segun el mensaje: "${userMessage}". No repitas las preguntas de onboarding.

Importante: en este turno NO tienes datos nuevos de beneficios reales. No inventes, nombres ni menciones ningun comercio, marca o descuento nuevo. No completes con conocimiento general sobre negocios reales.`
      );
    }

    if (!SUPPORTED_CITIES.includes(this.profile.city ?? "")) {
      return this.emit(
        `El usuario esta pidiendo beneficios, pero su ciudad (${this.profile.city}) todavia no tiene beneficios cargados. Dile con naturalidad y respeto que por ahora no tienes nada ahi, sin inventar, y confirma que le avisaras apenas haya algo.`
      );
    }

    const affinity = detection.affinity ?? this.profile.affinity!;
    const recommendations = await rankBenefits({
      userId: this.userId!,
      city: this.profile.city!,
      affinity,
    });

    for (const r of recommendations) {
      await saveExposure(this.userId!, r.benefit.id);
    }

    if (recommendations.length === 0) {
      return this.emit(
        `El usuario esta pidiendo beneficios (respondiendo a: "${userMessage}"), pero no hay ninguno real disponible que aplique para "${affinity}" con su ciudad y programas declarados. Dile con naturalidad y respeto que por ahora no tienes algo asi, sin inventar ni forzar una recomendacion, y confirma que le avisaras apenas haya algo.`
      );
    }

    const listado = recommendations
      .map((r, i) => {
        const tag = r.alreadyShown ? "[ya se lo mostraste antes]" : "[nuevo]";
        return `${i + 1}. ${r.benefit.title} (${r.benefit.sourceProgram}) ${tag} - ${r.reason}`;
      })
      .join("\n");

    return this.emit(
      `El usuario esta pidiendo beneficios en conversacion libre (mensaje: "${userMessage}"). Aqui tienes ${recommendations.length} opciones reales seleccionadas para "${affinity}":\n${listado}\n\nPresentalas en tu propio tono, respetando la razon de cada una. Si alguna esta marcada [ya se lo mostraste antes], menciona con naturalidad que sigue siendo una buena opcion para el - no la escondas ni finjas que es nueva. No inventes ninguna adicional.`
    );
  }

  private async emit(instruction: string): Promise<string> {
    const reply = await miaConversation(this.history, instruction);
    this.history.push({ role: "assistant", content: reply });
    return reply;
  }
}
