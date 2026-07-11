import type { Adapter } from "./types.js";
import { sfpucCapAdapter } from "./sfpuc_cap.js";
import { pgeCareAdapter } from "./pge_care.js";
import { caleitcAdapter } from "./caleitc.js";
import { pgeFeraAdapter } from "./pge_fera.js";
import { liheapSfpesAdapter } from "./liheap_sfpes.js";
import { caLifelineAdapter } from "./ca_lifeline.js";

// clipper_start is deliberately absent: it is apply_mode "assisted" in
// src/config/programs.json, because its form is OTP-account-gated end to end
// (see worker/README.md). Registering a stub adapter here just to fail every
// job is worse than not offering to auto-apply at all.
const ADAPTERS: Record<string, Adapter> = {
  sfpuc_cap: sfpucCapAdapter,
  pge_care: pgeCareAdapter,
  caleitc: caleitcAdapter,
  pge_fera: pgeFeraAdapter,
  liheap_sfpes: liheapSfpesAdapter,
  ca_lifeline: caLifelineAdapter,
};

export function getAdapter(programId: string): Adapter | undefined {
  return ADAPTERS[programId];
}
