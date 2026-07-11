// Multi-agent router (spec §7.1): decides whether a user's chat turn
// is "capture/update client info" (→ Intake Agent) or "explain / what's
// next / what documents" (→ Navigator Agent). Gradient's Agent Routing does
// this at the platform level when both agents are deployed there; this is
// the same policy expressed as backend orchestration logic so it works
// identically in local-fallback mode.

export type AgentTarget = "intake" | "navigator" | "resolve";

const NAVIGATOR_SIGNALS = [
  /\bwhy\b/,
  /\bwhat (documents?|paperwork)\b/,
  /\bhow (do|does|can)\b.*\bapply\b/,
  /\bexplain\b/,
  /\bwhat'?s next\b/,
  /\bwhat does .* mean\b/,
  /\bneeds? review\b.*\bwhy\b/,
  /\bwhich programs?\b/,
];

// After a screening exists, only route back to Intake when the user is
// clearly correcting or adding profile facts — everything else goes to Navigator.
const INTAKE_UPDATE_SIGNALS = [
  /\$\d/,
  /\bhousehold of\b/,
  /\bi live (in|outside)\b/,
  /\bmy income\b/,
  /\bactually\b/,
  /\bcorrect\b/,
  /\bupdate my\b/,
  /\bi(?:'m| am) a (u\.?s\.? )?citizen\b/,
  /\bpermanent resident\b/,
  /\bveteran\b|\bmilitary\b/,
  /\bsenior\b|\bdisabilit/,
  // Mentions of a household member (age, care responsibilities, someone
  // moving in) are profile-relevant facts even without the literal word
  // "household" or "senior" — e.g. "I also take care of my mom, she's 68"
  // should update has_senior/household_size, not get re-explained by the
  // Navigator against a stale profile.
  /\bmy (mom|mother|dad|father|parent|grandmother|grandfather|grandma|grandpa|husband|wife|spouse|son|daughter|child|kids?|sibling|brother|sister)\b/,
  /\btake care of\b|\bcaring for\b|\bcaregiver\b/,
  /\blives? with (me|us)\b|\bmoved in\b/,
  /\b(she|he|they)\s+(is|are)\s+\d{1,3}\b/,
  /\b\d{1,3}\s*years?\s*old\b/,
];

// "Ask me the rest", "resolve the unresolved", "finish the questions" —
// requests to work through the needs-review items.
const RESOLVE_SIGNALS = [
  /\bresolve\b/,
  /\bunresolved\b/,
  /\bneeds? review\b/,
  /\bask me\b.*\bquestions?\b/,
  /\b(finish|complete|answer)\b.*\b(questions?|screening|review)\b/,
  /\bremaining (questions?|items?|programs?)\b/,
  /\bresolver\b/,
  /\bpendientes?\b/,
];

export function routeTurn(
  userText: string,
  hasExistingScreening: boolean,
  needsReviewCount = 0,
): AgentTarget {
  const lower = userText.toLowerCase();
  if (hasExistingScreening && needsReviewCount > 0 && RESOLVE_SIGNALS.some((p) => p.test(lower))) {
    return "resolve";
  }
  if (hasExistingScreening && INTAKE_UPDATE_SIGNALS.some((p) => p.test(lower))) {
    return "intake";
  }
  if (hasExistingScreening && NAVIGATOR_SIGNALS.some((p) => p.test(lower))) {
    return "navigator";
  }
  // Resolve-phrased asks ("ask me the rest", "finish the questions") with
  // nothing currently unresolved still mean "keep asking me questions" —
  // that's an intake request, not a request to explain something.
  if (hasExistingScreening && RESOLVE_SIGNALS.some((p) => p.test(lower))) {
    return "intake";
  }
  if (hasExistingScreening) {
    return "navigator";
  }
  return "intake";
}
