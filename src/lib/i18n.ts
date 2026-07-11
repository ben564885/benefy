// Guided-intake UI strings, EN + ES. Chip `value`s (what actually gets sent
// to the server) stay English in every language — the heuristic extractor and
// the tool-calling prompts are English-keyed, so the guided path works
// identically regardless of display language. Only `label`/`display` localize.

export type Lang = "en" | "es";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
];

export interface Chip {
  label: string;
  value: string;
}

interface IntakeStrings {
  emptyTitle: string;
  emptySub: string;
  questionOf: (n: number, total: number) => string;
  prompts: Record<string, string>;
  chips: Record<string, Chip[]>;
  incomePlaceholder: string;
  perMonth: string;
  perYear: string;
  continueLabel: string;
  composerPlaceholder: string;
  send: string;
  thinking: string;
  checking: string;
  resolvingLabel: (programName: string) => string;
  stopResolving: string;
  resolvePlaceholder: string;
}

export const INTAKE_STRINGS: Record<Lang, IntakeStrings> = {
  en: {
    emptyTitle: "What's your situation?",
    emptySub:
      "Tell me about your household — or just answer the quick questions below — and I'll surface every SF benefit you likely qualify for, right here.",
    questionOf: (n, total) => `Question ${n} of ${total}`,
    prompts: {
      household_size: "How many people are in your household?",
      monthly_income_gross: "What's your household's approximate gross monthly (or annual) income?",
      sf_resident: "Do you live in San Francisco?",
      immigration_status:
        "What's your immigration status (citizen, lawful permanent resident, other, or unknown)?",
      senior_disability: "Is anyone in your household a senior (65+) or living with a disability?",
    },
    chips: {
      household_size: [
        { label: "1 (just me)", value: "I live alone" },
        { label: "2", value: "Household of 2" },
        { label: "3", value: "Household of 3" },
        { label: "4", value: "Household of 4" },
        { label: "5", value: "Household of 5" },
        { label: "6+", value: "Household of 6" },
      ],
      sf_resident: [
        { label: "Yes", value: "Yes, I live in San Francisco" },
        { label: "No", value: "No, I live outside San Francisco" },
      ],
      immigration_status: [
        { label: "U.S. citizen", value: "I'm a U.S. citizen" },
        { label: "Permanent resident (green card)", value: "I'm a permanent resident (green card)" },
        { label: "Other status", value: "Other immigration status" },
        { label: "Not sure", value: "I'm not sure about my immigration status" },
      ],
      senior_disability: [
        { label: "Yes, a senior (65+)", value: "Someone in my household is a senior (65+)" },
        { label: "Yes, a disability", value: "Someone in my household has a disability" },
        { label: "No, neither", value: "No one is a senior and no one has a disability" },
      ],
    },
    incomePlaceholder: "2,400",
    perMonth: "/month",
    perYear: "/year",
    continueLabel: "Continue",
    composerPlaceholder: "Or describe your whole situation…",
    send: "Send",
    thinking: "Thinking…",
    checking: "Checking what you qualify for…",
    resolvingLabel: (programName) => `Resolving: ${programName}`,
    stopResolving: "Stop",
    resolvePlaceholder: "Answer here — I'll re-check your eligibility instantly…",
  },
  es: {
    emptyTitle: "¿Cuál es su situación?",
    emptySub:
      "Cuénteme sobre su hogar — o simplemente responda las preguntas rápidas de abajo — y le mostraré aquí mismo todos los beneficios de SF a los que probablemente califica.",
    questionOf: (n, total) => `Pregunta ${n} de ${total}`,
    prompts: {
      household_size: "¿Cuántas personas hay en su hogar?",
      monthly_income_gross: "¿Cuál es el ingreso bruto mensual (o anual) aproximado de su hogar?",
      sf_resident: "¿Vive usted en San Francisco?",
      immigration_status:
        "¿Cuál es su estatus migratorio (ciudadanía, residencia permanente, otro, o no está seguro/a)?",
      senior_disability: "¿Alguien en su hogar es adulto mayor (65+) o vive con una discapacidad?",
    },
    chips: {
      household_size: [
        { label: "1 (solo yo)", value: "I live alone" },
        { label: "2", value: "Household of 2" },
        { label: "3", value: "Household of 3" },
        { label: "4", value: "Household of 4" },
        { label: "5", value: "Household of 5" },
        { label: "6+", value: "Household of 6" },
      ],
      sf_resident: [
        { label: "Sí", value: "Yes, I live in San Francisco" },
        { label: "No", value: "No, I live outside San Francisco" },
      ],
      immigration_status: [
        { label: "Ciudadano/a de EE. UU.", value: "I'm a U.S. citizen" },
        { label: "Residente permanente (green card)", value: "I'm a permanent resident (green card)" },
        { label: "Otro estatus", value: "Other immigration status" },
        { label: "No estoy seguro/a", value: "I'm not sure about my immigration status" },
      ],
      senior_disability: [
        { label: "Sí, un adulto mayor (65+)", value: "Someone in my household is a senior (65+)" },
        { label: "Sí, una discapacidad", value: "Someone in my household has a disability" },
        { label: "No, ninguno", value: "No one is a senior and no one has a disability" },
      ],
    },
    incomePlaceholder: "2,400",
    perMonth: "/mes",
    perYear: "/año",
    continueLabel: "Continuar",
    composerPlaceholder: "O describa su situación completa…",
    send: "Enviar",
    thinking: "Pensando…",
    checking: "Revisando a qué califica…",
    resolvingLabel: (programName) => `Resolviendo: ${programName}`,
    stopResolving: "Detener",
    resolvePlaceholder: "Responda aquí — vuelvo a revisar su elegibilidad al instante…",
  },
};
