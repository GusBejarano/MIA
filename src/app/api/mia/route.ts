import { NextRequest, NextResponse } from "next/server";
import {
  OnboardingSession,
  type Profile,
  type Stage,
  type TrailLevel,
} from "@/lib/mia/onboarding";
import type { ChatMessage } from "@/lib/mia/claudeClient";
import type { UiMessage } from "@/lib/mia/uiMessages";

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
  chipSelection?: string[];
  viewDetailId?: string;
  trailAction?: TrailLevel;
  replaceBenefactors?: boolean;
};

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const {
    phone,
    message,
    state,
    locationPermissionGranted,
    detectedCity,
    chipSelection,
    viewDetailId,
    trailAction,
    replaceBenefactors,
  } = body;

  if (!phone || typeof phone !== "string") {
    return NextResponse.json(
      { error: "Falta el numero de telefono" },
      { status: 400 }
    );
  }

  const session = new OnboardingSession(phone);

  try {
    let reply: string;
    let ui: UiMessage[] = [];

    if (!state) {
      const turn = await session.start();
      reply = turn.reply;
      ui = turn.ui;
    } else {
      session.history = state.history;
      session.stage = state.stage;
      session.profile = state.profile;
      session.userId = state.userId;

      const turn = await session.handleUserMessage(message ?? "", {
        locationPermissionGranted,
        detectedCity,
        chipSelection,
        viewDetailId,
        trailAction,
        replaceBenefactors,
      });
      reply = turn.reply;
      ui = turn.ui;
    }

    const nextState: ClientState = {
      history: session.history,
      stage: session.stage,
      profile: session.profile,
      userId: session.userId,
    };

    return NextResponse.json({ reply, ui, state: nextState });
  } catch (err) {
    console.error("Error en /api/mia:", err);
    return NextResponse.json(
      { error: "MIA no pudo responder. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
