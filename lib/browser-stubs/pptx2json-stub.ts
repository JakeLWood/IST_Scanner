/**
 * Browser stub for pptx2json.
 *
 * pptx2json is a Node.js-only library that requires the built-in `fs` module
 * and therefore cannot be bundled for browser environments.  Turbopack uses
 * this stub (configured via `turbopack.resolveAlias` in next.config.ts) so
 * that the `import PPTX2Json from "pptx2json"` in `lib/extractTextFromFile.ts`
 * resolves to a no-op class that throws a descriptive error at runtime.
 *
 * PPTX text extraction is not supported client-side; users should convert their
 * file to PDF or plain text before uploading.
 */
export default class PPTX2Json {
  async buffer2json(): Promise<never> {
    throw new Error(
      "PPTX extraction is not supported in the browser. Please convert your file to PDF or plain text before uploading.",
    );
  }
}
