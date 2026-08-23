/**
 * The view models a renderer consumes. Plain data with no dependencies: they are
 * the seam between assembly (which holds all the logic) and rendering (which
 * holds none). Swapping the PDF engine touches neither these nor the pipeline.
 *
 * Every monetary field is already rounded to cents by DocumentAssemblyService.
 */

/** Logo bytes, already fetched. Renderers embed images, they don't fetch them. */
export interface DocumentLogo {
  data: Uint8Array;
  contentType: string;
}

export interface DocumentCompany {
  businessName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  logo: DocumentLogo | null;
}

export interface DocumentParty {
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
}

export interface DocumentProject {
  name: string;
  location: string | null;
}

/** One assembly's line on the client-facing summary. */
export interface EstimateGroupRow {
  label: string;
  amount: number;
}

/**
 * The client-facing bid: a grouped summary, one row per assembly, no unit prices.
 *
 * There is deliberately no tax field. Sales tax is computed per material line,
 * pre-markup, and folded into direct cost, so a subtotal → tax → total
 * presentation would double-count it. `taxNote` is the footnote that says so.
 */
export interface EstimateDocument {
  company: DocumentCompany;
  client: DocumentParty | null;
  project: DocumentProject;
  title: string;
  createdAt: string;
  groups: EstimateGroupRow[];
  total: number;
  taxNote: string;
}

/** One merged material row on a supplier order. */
export interface PartsOrderLine {
  description: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/**
 * The supplier-facing materials list.
 *
 * Shows COST, not marked-up price — correct for a supplier, and correct by
 * construction: a material line's `unitPrice` IS catalog cost, since markup only
 * ever happens in aggregate. `subtotal` is pre-tax (the supplier charges their
 * own) and delivery is noted separately rather than folded into unit prices.
 */
export interface PartsOrderDocument {
  company: DocumentCompany;
  project: DocumentProject;
  title: string;
  createdAt: string;
  lines: PartsOrderLine[];
  subtotal: number;
  deliveryTotal: number;
  total: number;
}

/**
 * The footnote that replaces a tax line. Sales tax is already inside every
 * figure on the document.
 */
export const TAX_NOTE = "Prices include applicable sales tax.";
