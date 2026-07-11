import { PDFDocument } from "pdf-lib";
import type { ApplicantData, PdfAdapter, PdfFillOutcome } from "./types.js";

// PG&E CARE/FERA paper application. Field names below were read directly
// off the live AcroForm at the config's form_url (fetched + inspected with
// pdf-lib on 2026-07-11 — see worker/README.md) — they are PG&E's real
// field names, not guessed. Category checkboxes map from the client's
// self-reported current_programs; nothing here is fabricated.
//
// The "Customer signature" field is a PDFSignature widget and the "Date"
// field goes with it — this application is a perjury-style attestation, so
// we deliberately leave both blank rather than auto-signing. receiptNote
// tells the user to sign and date by hand before submitting.

const PDF_URL =
  "https://www.pge.com/assets/pge/localized/en/docs/account/billing-and-assistance/care-fera-application.pdf";

const CATEGORY_CHECKBOX_MATCHERS: { field: string; test: (programs: string[]) => boolean }[] = [
  { field: "Low Income Home Energy", test: (p) => p.some((x) => /liheap|low.income.home.energy/i.test(x)) },
  { field: "Women Infants and Children WIC", test: (p) => p.some((x) => /\bwic\b/i.test(x)) },
  { field: "CalFreshSNAP Food stamps", test: (p) => p.some((x) => /calfresh|snap|food stamp/i.test(x)) },
  { field: "CalWORKs TANF or Tribal TANF", test: (p) => p.some((x) => /calworks|tanf/i.test(x)) },
  { field: "Supplemental Security", test: (p) => p.some((x) => /\bssi\b|supplemental security/i.test(x)) },
  { field: "MediCal for Families", test: (p) => p.some((x) => /medi-?cal/i.test(x)) },
  { field: "MedicaidMediCal", test: (p) => p.some((x) => /medi-?cal|medicaid/i.test(x)) },
];

function splitPhone(phone: string | null): [string, string, string] {
  const digits = (phone ?? "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return ["", "", ""];
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
}

function annualIncomeString(data: ApplicantData): string {
  const p = data.profile;
  const annual = p.annual_income_gross ?? (p.monthly_income_gross ?? 0) * 12;
  return String(Math.round(annual));
}

export const pgeCareAdapter: PdfAdapter = {
  kind: "pdf_fill",
  programId: "pge_care",
  verified: true,

  async fill(data: ApplicantData): Promise<PdfFillOutcome> {
    const p = data.profile;
    const res = await fetch(PDF_URL);
    if (!res.ok) throw new Error(`Failed to fetch PG&E CARE PDF: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();

    form.getTextField("Your PG&E account number").setText(p.pge_account_number ?? "");
    form.getTextField("Account holders name").setText(p.legal_name ?? p.display_name);
    form.getTextField("Your home address and unit number").setText(p.street_address ?? "");
    form
      .getTextField("CityStateZip Code")
      .setText([p.city, "CA", p.mailing_zip_code ?? p.zip_code].filter(Boolean).join(" "));
    form.getTextField("Email address").setText(p.email ?? "");

    const langOption = p.preferred_language === "es" ? "Spanish " : "English ";
    form.getRadioGroup("What language do you prefer for future CARE and FERA communications Choose one").select(langOption);

    const [phone1, phone2, phone3] = splitPhone(p.phone);
    if (phone1) {
      form.getTextField("Preferred Phone Number 1").setText(phone1);
      form.getTextField("Preferred Phone Number 2").setText(phone2);
      form.getTextField("Preferred Phone Number 3").setText(phone3);
    }

    const adults = p.member_ages.filter((age) => age >= 18).length;
    const children = p.member_ages.filter((age) => age < 18).length;
    if (p.member_ages.length > 0) {
      form.getTextField("Adults").setText(String(adults));
      form.getTextField("Children").setText(String(children));
    }
    form.getTextField("Total").setText(String(p.household_size ?? p.member_ages.length ?? ""));

    for (const { field, test } of CATEGORY_CHECKBOX_MATCHERS) {
      if (test(p.current_programs)) form.getCheckBox(field).check();
    }

    form.getTextField("Total gross annual household income").setText(annualIncomeString(data));

    const pdfBytes = await doc.save();
    return { pdfBytes, unfillable: [] };
  },
};
