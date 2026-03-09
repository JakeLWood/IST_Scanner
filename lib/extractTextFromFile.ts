import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import PPTX2Json from "pptx2json";
import { createWorker } from "tesseract.js";

/**
 * Minimum character count for extracted PDF text before falling back to OCR.
 * PDFs that yield fewer characters than this are treated as image-based / scanned
 * and re-processed with Tesseract.js.
 */
const OCR_FALLBACK_THRESHOLD = 100;

/**
 * Extracts raw text from a {@link File}.
 *
 * Supported formats:
 * - **PDF** – uses `pdf-parse` for native text extraction; falls back to
 *   Tesseract.js OCR (via `pdfjs-dist` page rendering) when the extracted
 *   text is shorter than {@link OCR_FALLBACK_THRESHOLD} characters.
 * - **DOCX** – uses `mammoth`.
 * - **PPTX** – uses `pptx2json`.
 * - **Everything else** – treated as plain text and read with `File.text()`.
 *
 * @param file The file to extract text from.
 * @returns The raw extracted text string.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  switch (ext) {
    case "pdf":
      return extractFromPdf(file);
    case "docx":
      return extractFromDocx(file);
    case "pptx":
      return extractFromPptx(file);
    default:
      return file.text();
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function toBuffer(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}

/**
 * Attempts native PDF text extraction with `pdf-parse`, then falls back to
 * Tesseract.js OCR if the result is shorter than the threshold.
 */
async function extractFromPdf(file: File): Promise<string> {
  const buffer = await toBuffer(file);
  let extracted = "";

  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    extracted = result.text.trim();
  } catch {
    // Ignore parse errors – fall through to OCR
  }

  if (extracted.length >= OCR_FALLBACK_THRESHOLD) {
    return extracted;
  }

  return ocrPdf(buffer);
}

/**
 * Renders each page of a PDF to a canvas image using `pdfjs-dist`, then runs
 * Tesseract.js OCR on each rendered page.
 *
 * This path is taken when a PDF appears to be image-based (scanned) and
 * `pdf-parse` cannot extract meaningful text.
 */
async function ocrPdf(buffer: Buffer): Promise<string> {
  // Dynamic imports keep the heavy PDF/OCR libraries out of the initial bundle.
  const pdfjsLib = await import("pdfjs-dist");

  // Configure the worker source for browser environments.
  if (typeof window !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url,
    ).toString();
  }

  const pdfDoc = await pdfjsLib
    .getDocument({ data: new Uint8Array(buffer) })
    .promise;

  const ocrWorker = await createWorker("eng");
  const pageTexts: string[] = [];

  try {
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });

      // Render the page to a canvas element.
      const canvas = makeCanvas(viewport.width, viewport.height);

      await page.render({ canvas, viewport }).promise;

      const { data } = await ocrWorker.recognize(
        canvas as unknown as HTMLCanvasElement,
      );
      pageTexts.push(data.text);
    }
  } finally {
    await ocrWorker.terminate();
  }

  return pageTexts.join("\n").trim();
}

/**
 * Creates a canvas element that works in both browser and Node.js environments.
 * In the browser the native `document.createElement` is used; in Node.js the
 * optional `canvas` peer dependency is used as a drop-in replacement.
 */
function makeCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document !== "undefined") {
    const el = document.createElement("canvas");
    el.width = width;
    el.height = height;
    return el;
  }

  // Node.js path – requires the optional `canvas` peer dependency.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCanvas = require("canvas") as {
    createCanvas: (w: number, h: number) => HTMLCanvasElement;
  };
  return nodeCanvas.createCanvas(width, height);
}

/**
 * Extracts raw text from a DOCX buffer using `mammoth`.
 */
async function extractFromDocx(file: File): Promise<string> {
  const buffer = await toBuffer(file);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Extracts raw text from a PPTX buffer using `pptx2json`.
 * Parses slide XML files and collects all `<a:t>` (text run) nodes.
 */
async function extractFromPptx(file: File): Promise<string> {
  const buffer = await toBuffer(file);
  const pptx = new PPTX2Json();
  const json = await pptx.buffer2json(buffer);
  return collectPptxText(json as Record<string, unknown>);
}

/**
 * Recursively walks the JSON produced by `pptx2json` and gathers every `a:t`
 * text-run value found in the slide XML files.
 */
function collectPptxText(json: Record<string, unknown>): string {
  const texts: string[] = [];

  for (const key of Object.keys(json)) {
    // Only process slide XML files (skip layouts, masters, notes, etc.)
    if (/^ppt\/slides\/slide\d+\.xml$/.test(key)) {
      gatherTextNodes(json[key], texts);
    }
  }

  return texts.join("\n");
}

/**
 * Depth-first traversal of a parsed XML node tree.
 * Collects text from `a:t` (text run) nodes at any depth.
 * XML attribute nodes (`$`) are skipped to avoid capturing namespace strings.
 *
 * @param node The current node to traverse.
 * @param texts Accumulator for collected text strings.
 * @param inTextRun Whether we are currently inside an `a:t` element.
 */
function gatherTextNodes(
  node: unknown,
  texts: string[],
  inTextRun = false,
): void {
  if (typeof node === "string") {
    if (inTextRun) {
      const trimmed = node.trim();
      if (trimmed) texts.push(trimmed);
    }
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      gatherTextNodes(item, texts, inTextRun);
    }
    return;
  }

  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(
      node as Record<string, unknown>,
    )) {
      // Skip XML attribute bags to avoid capturing namespace URIs and other
      // attribute values that are not meaningful slide text.
      if (key === "$") continue;
      gatherTextNodes(value, texts, inTextRun || key === "a:t");
    }
  }
}
