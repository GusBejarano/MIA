import { miaConversation, type ChatMessage } from "./claudeClient.js";
import {
  classifyAffinity,
  type AffinityCategory,
} from "./tasks/classifyAffinity.js";
import { extractPrograms } from "./tasks/extractPrograms.js";
import { rankBenefits } from "./tasks/rankBenefits.js";
import {
  saveCity,
  saveCityInterest,
  saveAffinity,
  savePrograms,
  saveExposure,
} from "./mockStore.js";

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

  /** Arranca la conversacion: MIA pide el permiso de ubicacion. */
  async start(): Promise<string> {
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
   * Procesa el turno del usuario segun el estado actual. `simulatedPermission`
   * solo aplica en el estado location_permission (viene del harness de prueba,
   * no de un mensaje de chat, porque en la vida real es un evento del navegador,
   * no texto).
   */
  async handleUserMessage(
    userMessage: string,
    opts: { simulatedPermission?: boolean; simulatedGeoCity?: string } = {}
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
    simulatedPermission?: boolean;
    simulatedGeoCity?: string;
  }): Promise<string> {
    if (opts.simulatedPermission) {
      const city = opts.simulatedGeoCity ?? "Cali";
      const supported = SUPPORTED_CITIES.includes(city);
      saveCity(city, "geolocation");
      this.profile.city = city;

      if (!supported) saveCityInterest(city);

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
    saveCity(city, "manual");
    this.profile.city = city;
    this.stage = "affinity";
    return this.emit(
      `El usuario confirmo que esta en ${city}. Continua con la siguiente pregunta: que tipo de plan le interesa mas (comer bien, viajar, entretenimiento, salud y bienestar), como pregunta abierta.`
    );
  }

  private async resolveCityText(userMessage: string): Promise<string> {
    const city = userMessage.trim();
    saveCityInterest(city);
    this.stage = "affinity";
    return this.emit(
      `El usuario declaro que esta en ${city}, ciudad sin cobertura todavia. Confirma que vas a investigar que hay disponible ahi y que le avisaras. Luego continua con la siguiente pregunta: que tipo de plan le interesa mas (comer bien, viajar, entretenimiento, salud y bienestar), como pregunta abierta.`
    );
  }

  private async resolveAffinity(userMessage: string): Promise<string> {
    const category = await classifyAffinity(userMessage);
    saveAffinity(category);
    this.profile.affinity = category;
    this.stage = "programs";
    return this.emit(
      `Continua con la ultima pregunta: si cuenta con alguno de estos programas - Comfandi, Comfenalco, Visa, Mastercard, Puntos Colombia, PriceSmart. Puede mencionar varios o ninguno.`
    );
  }

  private async resolvePrograms(userMessage: string): Promise<string> {
    const programs = await extractPrograms(userMessage);
    savePrograms(programs);
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
      city: this.profile.city!,
      affinity: this.profile.affinity!,
      programs: this.profile.programs ?? [],
    });

    recommendations.forEach((r) => saveExposure(r.benefit.id));

    const listado = recommendations
      .map(
        (r, i) =>
          `${i + 1}. ${r.benefit.title} (${r.benefit.sourceProgram}) - ${r.reason}`
      )
      .join("\n");

    this.stage = "done";
    return this.emit(
      `Este es el momento del reveal. Presenta exactamente estas 3 recomendaciones ya seleccionadas, con su razon, en tu propio tono (no las reescribas de forma generica, respeta la razon de cada una):\n${listado}\n\nCierra invitando a que escriba cuando quiera para ver que hay de nuevo.`
    );
  }

  private async freeChat(userMessage: string): Promise<string> {
    return this.emit(
      `El usuario ya completo el onboarding y esta en conversacion libre. Respondele de forma natural segun el mensaje: "${userMessage}". No repitas las preguntas de onboarding.`
    );
  }

  private async emit(instruction: string): Promise<string> {
    const reply = await miaConversation(this.history, instruction);
    this.history.push({ role: "assistant", content: reply });
    return reply;
  }
}
