import type { PdfAdapter, PdfFillOutcome } from "./types.js";

// NOT YET SAFE TO AUTOMATE. Inspected the live FTB Form 3514 AcroForm on
// 2026-07-11 (see worker/README.md) — its 95 fields are named
// "3514_Form_1016", "3514_Form_2003", etc. (FTB's PDF-generation tool
// output), with no semantic names to match against ApplicationProfile
// keys. Filling this correctly requires rendering each page and mapping
// field widget positions to the printed labels next to them — real work,
// not done here, because a wrong guess on a tax document filed under
// penalty of perjury (wrong SSN into the wrong box, income into a
// dependent's row) is a much worse failure mode than not automating it at
// all. verified stays false so the worker refuses to run this even if
// mistakenly enqueued; every CalEITC submission routes to needs_human.
export const caleitcAdapter: PdfAdapter = {
  kind: "pdf_fill",
  programId: "caleitc",
  verified: false,

  async fill(): Promise<PdfFillOutcome> {
    return {
      pdfBytes: new Uint8Array(),
      unfillable: [
        "CalEITC (FTB Form 3514) automation is not yet implemented — the form's fields aren't safely mappable without a manual field-position audit. Use the prefilled draft and file by hand or with a tax preparer.",
      ],
    };
  },
};
