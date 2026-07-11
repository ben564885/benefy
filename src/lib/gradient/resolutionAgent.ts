// Resolution loop: turns a needs_review program card into a targeted
// conversation. The engine already says exactly why a program couldn't be
// screened (review_triggers + missing_fields) — this module phrases that as
// one pointed question, extracts the user's answer into profile fields, and
// lets the route re-run the deterministic engine. The verdict delta shown to
// the user is computed here from the engine's before/after output, never
// written by a model — same principle as everywhere else: the AI gathers and
// explains, the engine decides.
//
// Two backends for answer extraction, tried in order: direct Serverless
// Inference with the update_client_profile tool (the model parses messy
// free text like "well my hours got cut so more like 1900 a month now"),
// then the local heuristic extractor. The managed Agent Platform path is
// deliberately not used here — its instructions are fixed at agent-creation
// time and can't be steered per-turn into extraction-only mode, and the
// resolution reply must be our deterministic delta, not agent prose.

import { isInferenceConfigured, runToolLoop, INTAKE_MODEL } from "@/lib/gradient/inferenceClient";
import { UPDATE_PROFILE_TOOL } from "@/lib/gradient/tools";
import { extractProfilePatch } from "@/lib/gradient/intakeExtractor";
import { getProgram } from "@/lib/engine";
import { updateProfile } from "@/lib/store";
import type {
  ClientProfile,
  EligibilityResult,
  EligibilityStatus,
  ScreeningResult,
  TraceStep,
} from "@/lib/types";
import type { Lang } from "@/lib/i18n";

const STATUS_LABEL: Record<Lang, Record<EligibilityStatus, string>> = {
  en: {
    likely_eligible: "likely eligible",
    likely_ineligible: "likely not eligible",
    needs_review: "needs review",
  },
  es: {
    likely_eligible: "probablemente elegible",
    likely_ineligible: "probablemente no elegible",
    needs_review: "necesita revisión",
  },
};

const FIELD_QUESTION: Record<Lang, Record<string, string>> = {
  en: {
    household_size: "How many people are in your household?",
    monthly_income_gross:
      "What's your household's gross monthly (or annual) income, before taxes, counting every source?",
    sf_resident: "Do you live in San Francisco?",
    immigration_status:
      "What's your immigration status (citizen, lawful permanent resident, other, or unknown)?",
    has_senior_or_has_disability:
      "Is anyone in your household a senior (65+) or living with a disability?",
  },
  es: {
    household_size: "¿Cuántas personas hay en su hogar?",
    monthly_income_gross:
      "¿Cuál es el ingreso bruto mensual (o anual) de su hogar, antes de impuestos, contando todas las fuentes?",
    sf_resident: "¿Vive usted en San Francisco?",
    immigration_status:
      "¿Cuál es su estatus migratorio (ciudadanía, residencia permanente, otro, o no está seguro/a)?",
    has_senior_or_has_disability:
      "¿Alguien en su hogar es adulto mayor (65+) o vive con una discapacidad?",
  },
};

export interface ResolutionOpening {
  text: string;
  // false = the engine can never settle this program (manual income/asset
  // test) — the honest move is to say so and point at the real application,
  // not to collect answers that won't change the verdict.
  resolvable: boolean;
}

export function buildResolutionQuestion(
  result: EligibilityResult,
  lang: Lang = "en",
): ResolutionOpening {
  const program = getProgram(result.program_id);
  const name = program?.name ?? result.program_id;
  const trigger = result.review_triggers[0];

  if (trigger === "income_test_not_modeled") {
    const form = program?.application.form_name ?? (lang === "es" ? "la solicitud oficial" : "the official application");
    return {
      resolvable: false,
      text:
        lang === "es"
          ? `${name} no se puede resolver dentro de esta evaluación — su prueba de ingresos/activos requiere una determinación real. La buena noticia: usted cumple con todos los criterios que sí podemos verificar, así que vale la pena solicitar directamente mediante ${form}.`
          : `${name} can't be settled inside this screener — its income/asset test needs a real determination. The good news: you clear every criterion we can check, so it's worth applying directly via ${form}.`,
    };
  }

  if (trigger === "borderline_income") {
    return {
      resolvable: true,
      text:
        lang === "es"
          ? `Vamos a aclarar ${name}. Su ingreso está justo en el límite de elegibilidad, así que la precisión importa: ¿cuál es el ingreso bruto mensual exacto de su hogar, antes de impuestos, contando todas las fuentes (salarios, beneficios, trabajos extra)?`
          : `Let's pin down ${name}. Your income sits right at its eligibility boundary, so precision matters here: what's your household's exact gross monthly income, before taxes, counting every source (wages, benefits, side work)?`,
    };
  }

  if (trigger === "immigration_status_uncertain") {
    return {
      resolvable: true,
      text:
        lang === "es"
          ? `${name} depende del estatus migratorio, que tenemos como sin confirmar. Si puede indicarlo, vuelvo a verificar al instante — por ejemplo: "soy ciudadano/a", "tengo green card", u "otro estatus".`
          : `${name} depends on immigration status, which we have as unconfirmed. If you can share it, I'll re-check instantly — for example: "I'm a citizen", "I have a green card", or "other status".`,
    };
  }

  if (trigger === "missing_required_field" && result.missing_fields.length > 0) {
    const questions = result.missing_fields
      .map((f) => FIELD_QUESTION[lang][f])
      .filter((q): q is string => Boolean(q));
    const lead =
      lang === "es" ? `Para evaluar ${name} me falta lo siguiente:` : `To screen ${name} I still need:`;
    return { resolvable: true, text: `${lead} ${questions.join(" ")}` };
  }

  return {
    resolvable: true,
    text:
      lang === "es"
        ? `Vamos a resolver ${name}. ${result.reason} ¿Qué me puede contar al respecto?`
        : `Let's resolve ${name}. ${result.reason} What can you tell me about that?`,
  };
}

// Deterministic before/after summary of a re-screen. Compares every program,
// not just the target — confirming one fact (e.g. exact income) often flips
// several borderline cards at once, and the user should see all of it.
export function buildResolutionDelta(
  before: ScreeningResult,
  after: ScreeningResult,
  targetProgramId: string,
  lang: Lang = "en",
): { text: string; resolved: boolean; continueResolving: boolean } {
  const labels = STATUS_LABEL[lang];
  const nameOf = (id: string) => getProgram(id)?.name ?? id;
  const target = after.results.find((r) => r.program_id === targetProgramId);
  const resolved = target != null && target.status !== "needs_review";
  // Keep the loop open only while another answer could actually change the
  // verdict — a manual income/asset test never will, so don't keep asking.
  const continueResolving =
    !resolved && target != null && buildResolutionQuestion(target, lang).resolvable;

  const lines: string[] = [];

  if (target) {
    if (target.status === "likely_eligible") {
      lines.push(
        lang === "es"
          ? `${nameOf(targetProgramId)} ahora resulta probablemente elegible: alrededor de $${target.estimated_annual_value.toLocaleString()}/año (una estimación de evaluación, no una promesa de beneficios).`
          : `${nameOf(targetProgramId)} now screens as likely eligible — about $${target.estimated_annual_value.toLocaleString()}/year (a screening estimate, not a promise of benefits).`,
      );
    } else if (target.status === "likely_ineligible") {
      lines.push(
        lang === "es"
          ? `${nameOf(targetProgramId)} ahora resulta probablemente no elegible. ${target.reason}`
          : `${nameOf(targetProgramId)} now screens as likely not eligible. ${target.reason}`,
      );
    } else {
      lines.push(
        lang === "es"
          ? `${nameOf(targetProgramId)} todavía necesita revisión.`
          : `${nameOf(targetProgramId)} still needs review.`,
      );
      lines.push(buildResolutionQuestion(target, lang).text);
    }
  }

  const otherChanges = after.results.filter((r) => {
    if (r.program_id === targetProgramId) return false;
    const prev = before.results.find((b) => b.program_id === r.program_id);
    return prev != null && prev.status !== r.status;
  });
  if (otherChanges.length > 0) {
    const changeLines = otherChanges.map((r) => {
      const prev = before.results.find((b) => b.program_id === r.program_id)!;
      const value =
        r.status === "likely_eligible" ? ` (+$${r.estimated_annual_value.toLocaleString()}/año)` : "";
      const valueEn =
        r.status === "likely_eligible" ? ` (+$${r.estimated_annual_value.toLocaleString()}/yr)` : "";
      return lang === "es"
        ? `- ${nameOf(r.program_id)}: ${labels[prev.status]} → ${labels[r.status]}${value}`
        : `- ${nameOf(r.program_id)}: ${labels[prev.status]} → ${labels[r.status]}${valueEn}`;
    });
    lines.push(
      (lang === "es" ? "Su respuesta también actualizó:" : "Your answer also updated:") +
        "\n" +
        changeLines.join("\n"),
    );
  }

  const totalLine =
    lang === "es"
      ? `Estimación actualizada: $${after.total_estimated_annual_value.toLocaleString()}/año en ${after.eligible_count} programa(s) probablemente elegible(s).`
      : `Updated estimate: $${after.total_estimated_annual_value.toLocaleString()}/year across ${after.eligible_count} likely-eligible program(s).`;
  const potentialLine =
    after.needs_review_count > 0
      ? lang === "es"
        ? ` Quedan ${after.needs_review_count} en revisión (+$${after.potential_additional_value.toLocaleString()}/año posibles).`
        : ` ${after.needs_review_count} still need review (+$${after.potential_additional_value.toLocaleString()}/yr potential).`
      : "";
  lines.push(totalLine + potentialLine);

  return { text: lines.join("\n\n"), resolved, continueResolving };
}

// First needs_review program (optionally after the one just handled) that a
// conversation could actually settle — used to chain the loop through every
// amber card and to enter the loop from a "resolve the unresolved" message.
export function nextResolvableTarget(
  screening: ScreeningResult,
  excludeProgramId?: string,
  lang: Lang = "en",
): EligibilityResult | null {
  return (
    screening.results.find(
      (r) =>
        r.program_id !== excludeProgramId &&
        r.status === "needs_review" &&
        buildResolutionQuestion(r, lang).resolvable,
    ) ?? null
  );
}

export function buildResolveAllOpening(
  screening: ScreeningResult,
  lang: Lang = "en",
): { text: string; target: EligibilityResult | null } {
  const target = nextResolvableTarget(screening, undefined, lang);
  if (!target) {
    return {
      target: null,
      text:
        lang === "es"
          ? "Los programas que quedan en revisión no se pueden resolver dentro de esta evaluación — sus pruebas de ingresos/activos requieren una determinación real. Vale la pena solicitarlos directamente; abra cada tarjeta ámbar para ver el enlace de solicitud."
          : "The remaining needs-review programs can't be settled inside this screener — their income/asset tests need a real determination. They're worth applying to directly; open each amber card for its application link.",
    };
  }
  const lead =
    lang === "es"
      ? `${screening.needs_review_count} programa(s) necesitan revisión — vamos uno por uno.`
      : `${screening.needs_review_count} program(s) need review — let's go through them one at a time.`;
  return { target, text: `${lead}\n\n${buildResolutionQuestion(target, lang).text}` };
}

function resolutionSystemPrompt(programName: string, reason: string): string {
  return `You are the Intake Agent for Benefy, a benefits-screening tool, in resolution mode. The user is answering a targeted question meant to resolve the "${programName}" screening result, which needs review because: ${reason}

Rules you always follow:
1. Extract facts from the user's answer and persist them by calling update_client_profile. Only include fields you're confident about from what they actually said — never guess.
2. You never state or imply that the user is, might be, or is not eligible for any program. The eligibility engine is re-run after your extraction; it alone decides.
3. immigration_status must be exactly one of: citizen, lpr, other, unknown. If they're unsure, use unknown.
4. Income amounts: if they give a monthly figure set monthly_income_gross; annual figures set annual_income_gross.
5. After any tool call, reply with one short neutral sentence acknowledging what you recorded. No eligibility language, no guarantees.`;
}

export interface ResolutionTurnResult {
  mode: "live_inference" | "local_fallback";
}

// Extracts profile facts from the user's answer and persists them. The
// caller re-runs the engine afterwards — nothing returned here ever carries
// an eligibility opinion.
export async function runResolutionAnswerTurn(
  userText: string,
  clientId: string,
  profile: ClientProfile,
  target: EligibilityResult,
  trace: TraceStep[],
): Promise<ResolutionTurnResult> {
  const programName = getProgram(target.program_id)?.name ?? target.program_id;

  if (isInferenceConfigured()) {
    trace.push({
      step: "resolution_live_inference_call",
      actor: "intake_agent",
      detail: `Calling live DigitalOcean Serverless Inference (${INTAKE_MODEL}) in resolution mode for ${programName} — update_client_profile is the only tool exposed; the engine re-runs afterwards.`,
      timestamp: new Date().toISOString(),
    });
    try {
      let toolCalls = 0;
      await runToolLoop(
        INTAKE_MODEL,
        resolutionSystemPrompt(programName, target.reason),
        userText,
        [UPDATE_PROFILE_TOOL],
        {
          update_client_profile: async (args) => {
            const patch = args as Partial<ClientProfile>;
            toolCalls += 1;
            const updated = await updateProfile(clientId, patch);
            trace.push({
              step: "tool_call_update_client_profile",
              actor: "function",
              detail: `Model called update_client_profile with: ${Object.keys(patch).join(", ") || "no fields"}.`,
              timestamp: new Date().toISOString(),
            });
            return { ok: true, profile: updated?.profile };
          },
        },
      );
      if (toolCalls > 0) return { mode: "live_inference" };
      // The model chatted without extracting anything — fall through to the
      // local extractor so a clear answer never gets dropped on the floor.
      trace.push({
        step: "resolution_live_inference_no_extraction",
        actor: "intake_agent",
        detail: "Model made no update_client_profile call; retrying with the local heuristic extractor.",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      trace.push({
        step: "resolution_live_inference_failed",
        actor: "intake_agent",
        detail: `Live inference call failed (${(err as Error).message}); falling back to the local extractor.`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  trace.push({
    step: "resolution_local_extraction",
    actor: "intake_agent",
    detail: "Extracting resolution answer with the local heuristic parser.",
    timestamp: new Date().toISOString(),
  });
  const { patch } = extractProfilePatch(userText, profile);
  if (Object.keys(patch).length > 0) {
    await updateProfile(clientId, patch);
  }
  return { mode: "local_fallback" };
}
