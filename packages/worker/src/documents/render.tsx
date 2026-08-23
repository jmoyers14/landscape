import { renderToBuffer } from "@react-pdf/renderer";
import type { EstimateDocument, PartsOrderDocument } from "@landscape/platform";
import { EstimatePdf } from "./templates/EstimatePdf.tsx";

/**
 * The only place the PDF engine is named. Takes a plain view model, returns
 * bytes — no repositories, no storage, no job knowledge. That narrowness is what
 * makes swapping the engine (react-pdf ↔ pdfmake) a two-file change.
 */
export async function renderEstimatePdf(
  doc: EstimateDocument,
): Promise<Uint8Array> {
  return new Uint8Array(await renderToBuffer(<EstimatePdf doc={doc} />));
}

export async function renderPartsOrderPdf(
  _doc: PartsOrderDocument,
): Promise<Uint8Array> {
  throw new Error("not implemented");
}
