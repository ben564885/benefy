// Local heuristic extractor — the fallback intake path used when no
// GRADIENT_INTAKE_AGENT_* credentials are configured (see client.ts).
// It approximates what the real Gradient Intake Agent does with an LLM:
// turn free text into ClientProfile field patches. It is intentionally
// conservative — it only fills a field when it finds a reasonably clear
// signal, and otherwise leaves the field for the user to confirm.

import type { ClientProfile, ImmigrationStatus } from "@/lib/types";

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function wordOrDigitToNumber(token: string): number | null {
  const digit = Number(token);
  if (!Number.isNaN(digit)) return digit;
  return NUMBER_WORDS[token.toLowerCase()] ?? null;
}

const SF_NEIGHBORHOODS = [
  "tenderloin",
  "mission",
  "soma",
  "bayview",
  "excelsior",
  "sunset",
  "richmond",
  "castro",
  "hayes valley",
  "chinatown",
  "bernal heights",
  "visitacion valley",
  "potrero hill",
  "outer mission",
  "ingleside",
];

export interface ExtractionResult {
  patch: Partial<ClientProfile>;
  notes_appended: string;
}

export function extractProfilePatch(
  text: string,
  existing: ClientProfile,
): ExtractionResult {
  const patch: Partial<ClientProfile> = {};
  const lower = text.toLowerCase();

  // --- Income ---
  const incomeMatch = text.match(
    /\$?\s?([\d,]+(?:\.\d+)?)\s*(?:\/|\s+per\s+|\s+a\s+)?\s*(month|mo\b|year|yr\b|annually|annual)/i,
  );
  if (incomeMatch) {
    const amount = Number(incomeMatch[1].replace(/,/g, ""));
    const period = incomeMatch[2].toLowerCase();
    if (!Number.isNaN(amount)) {
      if (period.startsWith("month") || period.startsWith("mo")) {
        patch.monthly_income_gross = amount;
        patch.annual_income_gross = null;
      } else {
        patch.annual_income_gross = amount;
        patch.monthly_income_gross = null;
      }
    }
  }

  // --- Household size ---
  const explicitSize = text.match(/(?:family|household)\s+of\s+(\d+)/i);
  if (explicitSize) {
    patch.household_size = Number(explicitSize[1]);
  } else {
    const childMatch = lower.match(
      /(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:kids|kid|children|child)/,
    );
    const hasPartner = /\b(husband|wife|spouse|partner|married)\b/.test(lower);
    if (childMatch) {
      const n = wordOrDigitToNumber(childMatch[1]);
      if (n != null) {
        const size = 1 + n + (hasPartner ? 1 : 0);
        patch.household_size = size;
        patch.member_ages = existing.member_ages.length
          ? existing.member_ages
          : Array(size).fill(0).map((_, i) => (i === 0 ? 30 : 8));
      }
    } else if (/\b(lives? alone|single person|by (herself|himself|myself))\b/.test(lower)) {
      patch.household_size = 1;
    }
  }

  // --- Ages ---
  const ageMatches = [...text.matchAll(/\b(\d{1,3})[\s-]?(?:years?[\s-]?old|yo|y\.?o\.?)\b/gi)];
  if (ageMatches.length > 0) {
    patch.member_ages = ageMatches.map((m) => Number(m[1]));
  }
  const leadingAge = text.match(/^(\d{2,3})[-\s]?(?:year|yo)/i);
  if (leadingAge) {
    patch.member_ages = [Number(leadingAge[1]), ...(patch.member_ages?.slice(1) ?? [])];
  }

  // --- Senior / disability ---
  const ages = patch.member_ages ?? existing.member_ages;
  const hasSeniorAge = ages.some((a) => a >= 65);
  if (hasSeniorAge || /\bsenior\b|\belderly\b/.test(lower)) {
    patch.has_senior = true;
  }
  if (/\bdisab(led|ility)\b|\bssdi\b/.test(lower)) {
    patch.has_disability = true;
  }
  if (/\bno one\b.*\bsenior\b|\bnot a senior\b|\bno seniors?\b/.test(lower) && !hasSeniorAge) {
    patch.has_senior = false;
  }
  if (/\bno one\b.*\bdisabilit|\bnot disabled\b|\bwithout a disability\b/.test(lower)) {
    patch.has_disability = false;
  }

  // --- Veteran / military service ---
  if (
    /\bveteran\b|\bformer military\b|\bex-?military\b|\barmed forces\b|\b(military|army|navy|marines|air force|coast guard) service\b|\bserved in the (army|navy|marines|air force|coast guard)\b/.test(
      lower,
    )
  ) {
    patch.is_veteran = true;
  }
  if (/\bnot a veteran\b|\bno military service\b|\bnever served\b|\bnot in the military\b/.test(lower)) {
    patch.is_veteran = false;
  }

  // --- Immigration status ---
  if (/\bcitizen\b/.test(lower) && !/non-?citizen/.test(lower)) {
    patch.immigration_status = "citizen";
  } else if (/\bgreen card\b|\bpermanent resident\b|\blpr\b/.test(lower)) {
    patch.immigration_status = "lpr";
  } else if (
    /\bnot sure\b.*(status|immigration)|\bunsure\b.*(status|immigration)|\bdon'?t know\b.*(status|immigration)|status.*(in process|pending|unclear)/.test(
      lower,
    )
  ) {
    patch.immigration_status = "unknown" as ImmigrationStatus;
  } else if (/\bundocumented\b|\bvisa\b|\bnon-?citizen\b|\bother\b.*(status|immigration)/.test(lower)) {
    patch.immigration_status = "other" as ImmigrationStatus;
  }

  // --- SF residency ---
  const zipMatch = text.match(/\b(94\d{3})\b/);
  if (zipMatch) {
    patch.zip_code = zipMatch[1];
    patch.sf_resident = true;
  }
  if (/\bsan francisco\b|\bsf\b/.test(lower)) {
    patch.sf_resident = true;
  }
  if (SF_NEIGHBORHOODS.some((n) => lower.includes(n))) {
    patch.sf_resident = true;
  }
  if (/\b(oakland|berkeley|daly city|san jose|outside san francisco|not in sf)\b/.test(lower)) {
    patch.sf_resident = false;
  }

  // --- Current programs (categorical hooks) ---
  const programs = new Set(existing.current_programs);
  if (/\bmedi-?cal\b/.test(lower)) programs.add("Medi-Cal");
  if (/\bcalworks\b/.test(lower)) programs.add("CalWORKs");
  if (/\bssi\b(?!\s*n)/.test(lower)) programs.add("SSI");
  if (/\bcalfresh\b|\bsnap\b|\bfood stamps\b/.test(lower)) programs.add("CalFresh");
  if (programs.size > 0) {
    patch.current_programs = Array.from(programs);
  }

  return { patch, notes_appended: text };
}

export const CORE_REQUIRED_FIELDS: { key: keyof ClientProfile; prompt: string }[] = [
  { key: "household_size", prompt: "How many people are in your household?" },
  {
    key: "monthly_income_gross",
    prompt: "What's your household's approximate gross monthly (or annual) income?",
  },
  { key: "sf_resident", prompt: "Do you live in San Francisco?" },
  {
    key: "immigration_status",
    prompt:
      "What's your immigration status (citizen, lawful permanent resident, other, or unknown)?",
  },
];

export function missingCoreFields(profile: ClientProfile): typeof CORE_REQUIRED_FIELDS {
  return CORE_REQUIRED_FIELDS.filter((f) => {
    if (f.key === "monthly_income_gross") {
      return profile.monthly_income_gross == null && profile.annual_income_gross == null;
    }
    return profile[f.key] == null;
  });
}

export function missingSeniorDisabilityField(profile: ClientProfile): boolean {
  return profile.has_senior == null && profile.has_disability == null;
}

export function missingVeteranField(profile: ClientProfile): boolean {
  return profile.is_veteran == null;
}
