import { renderToBuffer } from "@react-pdf/renderer";
import type { EstimateDocument, PartsOrderDocument } from "@landscape/platform";
import { EstimatePdf } from "./templates/EstimatePdf.tsx";
import { PartsOrderPdf } from "./templates/PartsOrderPdf.tsx";

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
  doc: PartsOrderDocument,
): Promise<Uint8Array> {
  return new Uint8Array(await renderToBuffer(<PartsOrderPdf doc={doc} />));
}
