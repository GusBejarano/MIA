import Anthropic from "@anthropic-ai/sdk";
import { MIA_SYSTEM_PROMPT } from "./systemPrompt";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error(
    "Falta ANTHROPIC_API_KEY. Copia .env.example a .env.local y pega la key del workspace 'MIA by Descuentos Inteligentes'."
  );
}

const client = new Anthropic({ apiKey });

const SONNET_MODEL = process.env.MIA_MODEL_SONNET ?? "claude-sonnet-5";
const HAIKU_MODEL = process.env.MIA_MODEL_HAIKU ?? "claude-haiku-4-5-20251001";

export type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Llama a Sonnet 5 para la conversacion real con el usuario (onboarding, reveal,
 * visitas de retorno). El bloque de personalidad va marcado con cache_control
 * (prompt caching, no cambia entre requests). El `turnInstruction` es dinamico -
 * le dice a Sonnet que tiene que producir en este turno especifico (ej. "pide el
 * permiso de ubicacion") sin ensuciar el historial visible de la conversacion.
 */
export async function miaConversation(
  history: ChatMessage[],
  turnInstruction: string
): Promise<string> {
  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 500,
    system: [
      {
        type: "text",
        text: MIA_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: `Instruccion para tu proximo mensaje (no la repitas literal, redactala en tu propio tono): ${turnInstruction}`,
      },
    ],
    messages: history,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "";
}

/**
 * Llama a Haiku 4.5 para tareas de clasificacion/extraccion de back-office:
 * categoria de afinidad, programas mencionados, deteccion de cambio de ciudad,
 * clasificacion de beneficios y ranking. No lleva el system prompt de
 * personalidad - es una tarea mecanica, no una conversacion con el usuario.
 */
export async function miaTask(prompt: string): Promise<string> {
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "";
}
