// Standard working agreement shown to new subcontractors. Admins can replace it
// in Settings (company_settings.subcontractor_agreement); this is the fallback.
// Paragraphs are separated by a blank line; a line starting with "##" is a heading.
// This is a general-purpose starting draft, not legal advice - have it reviewed.

export const DEFAULT_SUBCONTRACTOR_AGREEMENT = `## Subcontractor Working Agreement

This agreement is between Better Batt Insulation (the "Company") and the subcontractor named in the onboarding form (the "Subcontractor"). By signing, the Subcontractor agrees to the terms below for all work offered by the Company and accepted by the Subcontractor.

## 1. Independent contractor
The Subcontractor is an independent contractor and not an employee, partner or agent of the Company. The Subcontractor controls how the work is carried out, supplies their own tools, vehicle and equipment (unless the Company agrees in writing to supply them), and is responsible for their own tax, GST, superannuation and any workers they engage.

## 2. ABN, GST and invoicing
The Subcontractor must hold a valid ABN and keep it current. If registered for GST, the Subcontractor must issue valid tax invoices. Invoices must quote the Company's work order number and be submitted after the work is completed. The Company will pay undisputed invoices within the agreed payment terms, to the bank account the Subcontractor has provided. The Subcontractor must tell the Company in writing before changing bank details.

## 3. Work orders and scope
Work is offered by work order. The work order sets out the site, scope, rates and any special instructions. The Subcontractor may accept or decline any work order. Variations must be approved by the Company before the work is done; unapproved variations will not be paid.

## 4. Standard of work
All work must be done with due care and skill, by suitably qualified people, and in line with the relevant manufacturer's installation instructions, the National Construction Code and applicable Australian Standards (including AS/NZS 3999 and AS 3740 as relevant). The Subcontractor must use only the products specified, and must leave the site clean and tidy.

## 5. Defects and rectification
The Subcontractor must return and fix any defective or incomplete work at their own cost, within a reasonable time after being notified, and no later than 7 days where practicable. If the Subcontractor does not do so, the Company may have the work fixed by others and deduct the reasonable cost from amounts owed.

## 6. Work health and safety
The Subcontractor must comply with the Occupational Health and Safety Act 2004 (Vic), the OHS Regulations, and all site rules. This includes: holding a current Construction Induction ("White Card") for themselves and anyone who works for them; completing and following a Safe Work Method Statement (SWMS) or Job Safety Analysis for each job; wearing appropriate PPE; and immediately reporting any incident, injury, near miss or hazard to the Company. The Subcontractor must not work under the influence of alcohol or drugs.

## 7. Asbestos and hazardous materials
If the Subcontractor suspects asbestos or any other hazardous material on site, they must stop work, keep others away, and notify the Company immediately. Work must not resume until the Company confirms it is safe.

## 8. Insurance
The Subcontractor must hold public liability insurance of at least $10,000,000 for the duration of this agreement, and provide a current certificate of currency before starting work and again on each renewal. The Subcontractor is responsible for workers' compensation insurance for any person they engage (where required by law) and for insuring their own tools, equipment and vehicle. The Company may stop offering work if cover lapses.

## 9. Workers and sub-subcontracting
The Subcontractor must not engage other people or companies to do the Company's work without the Company's prior written consent. Anyone approved must provide photo ID and a current White Card before attending site, and the Subcontractor remains responsible for their work, safety and pay.

## 10. Customers, conduct and presentation
The Subcontractor must act professionally and courteously on site, respect customers' property and privacy, and not discuss pricing or Company business with customers. The Subcontractor must not solicit or accept work directly from the Company's customers or builders for jobs introduced by the Company for 12 months after the last job done for the Company.

## 11. Confidentiality and privacy
The Subcontractor must keep the Company's pricing, customer details and business information confidential. The Company collects the personal information in the onboarding form (including identification, licence and banking details) to engage and pay the Subcontractor, to meet its safety and legal obligations, and keeps it securely. It will not be disclosed except where required by law or needed to operate the engagement.

## 12. Indemnity
The Subcontractor indemnifies the Company against any loss, damage, claim or cost arising from the Subcontractor's negligence, breach of this agreement, or breach of any law while working for the Company, except to the extent caused by the Company.

## 13. Security of payment
Nothing in this agreement limits either party's rights under the Building and Construction Industry Security of Payment Act 2002 (Vic).

## 14. Ending the agreement
Either party may end this agreement by giving 7 days' written notice. The Company may end it immediately if the Subcontractor seriously breaches it, including by a safety breach, lapse in insurance, or poor workmanship that is not fixed. Work already completed and accepted will be paid for. Clauses on defects, insurance, indemnity, confidentiality and non-solicitation continue after the agreement ends.

## 15. General
This agreement, together with each work order, is the entire agreement between the parties on its subject. Changes must be in writing. It is governed by the laws of Victoria, and the parties submit to the courts of Victoria. A person signing for a company confirms they are authorised to bind that company.

By ticking the box and signing below, the Subcontractor confirms they have read, understood and agree to this agreement.`;

export type AgreementBlock = { type: "heading" | "para"; text: string };

export function parseAgreement(text: string): AgreementBlock[] {
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b): AgreementBlock =>
      b.startsWith("##")
        ? { type: "heading", text: b.replace(/^##\s*/, "").split("\n")[0] + (b.includes("\n") ? "\n" + b.split("\n").slice(1).join("\n") : "") }
        : { type: "para", text: b }
    )
    .flatMap((b): AgreementBlock[] => {
      // heading followed directly by text on the next line: split it into two blocks
      if (b.type === "heading" && b.text.includes("\n")) {
        const [h, ...rest] = b.text.split("\n");
        return [{ type: "heading", text: h }, { type: "para", text: rest.join("\n").trim() }];
      }
      return [b];
    });
}
