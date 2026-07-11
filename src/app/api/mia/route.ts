import { NextRequest, NextResponse } from "next/server";
import {
  OnboardingSession,
  type Profile,
  type Stage,
} from "@/lib/mia/onboarding";
import type { ChatMessage } from "@/lib/mia/claudeClient";

// Backend stateless (Netlify Functions no conservan memoria entre
// invocaciones): el estado completo de la sesion viaja de ida y vuelta
// con el cliente en cada turno, en vez de vivir en el servidor.
type ClientState = {
  history: ChatMessage[];
  stage: Stage;
  profile: Profile;
  userId?: string;
};

type RequestBody = {
  phone: string;
  message?: string;
  state?: ClientState;
  locationPermissionGranted?: boolean;
  detectedCity?: string;
};

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { phone, message, state, locationPermissionGranted, detectedCity } =
    body;

  if (!phone || typeof phone !== "string") {
    return NextResponse.json(
      { error: "Falta el numero de telefono" },
      { status: 400 }
    );
  }

  const session = new OnboardingSession(phone);

  try {
    let reply: string;

    if (!state) {
      reply = await session.start();
    } else {
      session.history = state.history;
      session.stage = state.stage;
      session.profile = state.profile;
      session.userId = state.userId;

      reply = await session.handleUserMessage(message ?? "", {
        locationPermissionGranted,
        detectedCity,
      });
    }

    const nextState: ClientState = {
      history: session.history,
      stage: session.stage,
      profile: session.profile,
      userId: session.userId,
    };

    return NextResponse.json({ reply, state: nextState });
  } catch (err) {
    console.error("Error en /api/mia:", err);
    return NextResponse.json(
      { error: "MIA no pudo responder. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
