import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { OnboardingSession } from "../src/lib/mia/onboarding";
import type { UiMessage } from "../src/lib/mia/uiMessages";

const rl = readline.createInterface({ input: stdin, output: stdout });

async function ask(question: string): Promise<string> {
  return (await rl.question(question)).trim();
}

function printUi(ui: UiMessage[]) {
  // El CLI es solo un arnes de prueba por texto - no dibuja chips/carruseles
  // de verdad, pero imprime lo suficiente para responder por texto libre
  // (allowFreeText siempre esta activo en el contrato real).
  for (const block of ui) {
    switch (block.type) {
      case "chip_select":
        console.log(
          `  [chips${block.multi ? ` - hasta ${block.maxSelect ?? "varios"}` : " - una sola"}]`,
          block.options.map((o) => `${o.label} (${o.count})`).join(", ")
        );
        break;
      case "summary_cards":
        console.log(
          "  [resumen]",
          block.cards.map((c) => `${c.title}: ${c.count}`).join(", ")
        );
        break;
      case "card_carousel":
        console.log(
          "  [carrusel]",
          block.cards.map((c) => `${c.title} [${c.tag}]`).join(" | ")
        );
        break;
      case "detail_sheet":
        console.log(`  [detalle] ${block.title} (${block.tag})`);
        console.log(`  ${block.description}`);
        for (const d of block.details) console.log(`  ${d.label}: ${d.value}`);
        break;
    }
  }
}

async function main() {
  console.log("=== Simulador de conversacion con MIA (prueba local) ===");
  console.log(
    "Estas preguntas de aqui abajo son del ARNES DE PRUEBA (simulan al navegador),"
  );
  console.log("no son mensajes de MIA. Los mensajes reales de MIA salen despues.\n");
  console.log(
    "Nota: este CLI no dibuja chips ni carruseles de verdad - los imprime como texto.\n" +
      "Responde escribiendo el nombre/categoria tal cual aparece entre parentesis.\n"
  );

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

  let turn = await session.start();
  console.log(`\nMIA: ${turn.reply}\n`);
  printUi(turn.ui);

  if (session.stage === "location_permission") {
    const permReplyText = simulatedPermission ? "Sí, dale." : "Prefiero no compartirla.";
    console.log(`Tú (auto): ${permReplyText}`);
    turn = await session.handleUserMessage(permReplyText, {
      locationPermissionGranted: simulatedPermission,
      detectedCity: simulatedGeoCity,
    });
    console.log(`\nMIA: ${turn.reply}\n`);
    printUi(turn.ui);
  }

  while (true) {
    const userMessage = await ask("\nTú: ");
    if (userMessage.toLowerCase() === "salir") break;

    turn = await session.handleUserMessage(userMessage);
    console.log(`\nMIA: ${turn.reply}\n`);
    printUi(turn.ui);
  }

  console.log("\nPerfil capturado en esta sesion:", session.profile);
  rl.close();
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
