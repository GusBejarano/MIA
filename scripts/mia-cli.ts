import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { OnboardingSession } from "../src/lib/mia/onboarding.js";

const rl = readline.createInterface({ input: stdin, output: stdout });

async function ask(question: string): Promise<string> {
  return (await rl.question(question)).trim();
}

async function main() {
  console.log("=== Simulador de conversacion con MIA (prueba local) ===");
  console.log(
    "Estas preguntas de aqui abajo son del ARNES DE PRUEBA (simulan al navegador),"
  );
  console.log("no son mensajes de MIA. Los mensajes reales de MIA salen despues.\n");

  const phone = await ask(
    "[SIMULACION] Numero de telefono de prueba (identifica al usuario en Supabase, ej. +573001234567): "
  );

  const permAnswer = await ask(
    "[SIMULACION] ¿El usuario va a conceder el permiso de ubicacion cuando MIA lo pida? (s/n): "
  );
  const simulatedPermission = permAnswer.toLowerCase().startsWith("s");

  let simulatedGeoCity: string | undefined;
  if (simulatedPermission) {
    simulatedGeoCity = await ask(
      "[SIMULACION] ¿Que ciudad detecta el geolocalizador? (ej. Cali, Bogota): "
    );
  }

  const session = new OnboardingSession(phone);

  const firstMessage = await session.start();
  console.log(`\nMIA: ${firstMessage}\n`);

  // El primer turno del usuario responde a la pregunta de permiso. En este
  // punto no importa mucho el texto (el permiso ya se decidio arriba, es un
  // evento de navegador, no de chat), pero mantenemos el flujo conversacional
  // natural pidiendo que el usuario "responda" para no romper el historial.
  const permReplyText = simulatedPermission ? "Sí, dale." : "Prefiero no compartirla.";
  console.log(`Tú (auto): ${permReplyText}`);
  let reply = await session.handleUserMessage(permReplyText, {
    simulatedPermission,
    simulatedGeoCity,
  });
  console.log(`\nMIA: ${reply}\n`);

  // A partir de aqui, conversacion libre por consola hasta que el usuario
  // escriba "salir".
  while (true) {
    const userMessage = await ask("Tú: ");
    if (userMessage.toLowerCase() === "salir") break;

    reply = await session.handleUserMessage(userMessage);
    console.log(`\nMIA: ${reply}\n`);
  }

  console.log("\nPerfil capturado en esta sesion:", session.profile);
  rl.close();
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
