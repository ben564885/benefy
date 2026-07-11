// Guardrails (spec §7.4): enforced on every piece of agent-generated text,
// whether it came from a live Gradient agent or the local fallback
// generator. The rule that matters most for a benefits tool: never let
// output read as a guarantee ("you WILL get X") — only ever a screening
// estimate. This runs as a real code path in both modes, not just a
// Gradient-console toggle, so the guarantee is enforced regardless of
// which backend produced the text.

const GUARANTEE_PATTERNS: RegExp[] = [
  /\byou\s+will\s+(receive|get|qualify)\b/i,
  /\bguarantee(d)?\b/i,
  /\bwe\s+guarantee\b/i,
  /\bdefinitely\s+(eligible|qualifies|qualify)\b/i,
  /\b100%\s+(eligible|approved|guaranteed)\b/i,
  /\bcertain(ly)?\s+(to\s+)?(be\s+)?(eligible|approved)\b/i,
];

export interface GuardrailCheck {
  passed: boolean;
  violations: string[];
  sanitized: string;
}

export function checkNoGuaranteeLanguage(text: string): GuardrailCheck {
  const violations: string[] = [];
  let sanitized = text;

  for (const pattern of GUARANTEE_PATTERNS) {
    if (pattern.test(text)) {
      violations.push(
        `Output contained guarantee-style language matching /${pattern.source}/ — rewritten to a screening-estimate phrasing.`,
      );
      sanitized = sanitized.replace(
        pattern,
        (match) => `appears likely to qualify based on this screening (not a guarantee: "${match.trim()}")`,
      );
    }
  }

  return { passed: violations.length === 0, violations, sanitized };
}

const PII_LEAK_PATTERNS: RegExp[] = [
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
];

export function checkNoSensitiveDataLeak(text: string): GuardrailCheck {
  const violations: string[] = [];
  let sanitized = text;
  for (const pattern of PII_LEAK_PATTERNS) {
    if (pattern.test(text)) {
      violations.push("Output contained what looks like a Social Security Number — redacted.");
      sanitized = sanitized.replace(pattern, "[redacted]");
    }
  }
  return { passed: violations.length === 0, violations, sanitized };
}

export function applyGuardrails(text: string): {
  text: string;
  violations: string[];
} {
  const g1 = checkNoGuaranteeLanguage(text);
  const g2 = checkNoSensitiveDataLeak(g1.sanitized);
  return { text: g2.sanitized, violations: [...g1.violations, ...g2.violations] };
}
