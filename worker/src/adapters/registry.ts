import type { Adapter } from "./types.js";
import { sfpucCapAdapter } from "./sfpuc_cap.js";
import { pgeCareAdapter } from "./pge_care.js";
import { caleitcAdapter } from "./caleitc.js";
import { pgeFeraAdapter } from "./pge_fera.js";
import { liheapSfpesAdapter } from "./liheap_sfpes.js";
import { caLifelineAdapter } from "./ca_lifeline.js";
import { clipperStartAdapter } from "./clipper_start.js";

const ADAPTERS: Record<string, Adapter> = {
  sfpuc_cap: sfpucCapAdapter,
  pge_care: pgeCareAdapter,
  caleitc: caleitcAdapter,
  pge_fera: pgeFeraAdapter,
  liheap_sfpes: liheapSfpesAdapter,
  ca_lifeline: caLifelineAdapter,
  clipper_start: clipperStartAdapter,
};

export function getAdapter(programId: string): Adapter | undefined {
  return ADAPTERS[programId];
}
