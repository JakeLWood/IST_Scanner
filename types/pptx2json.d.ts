declare module "pptx2json" {
  interface PPTX2JsonOptions {
    jszipBinary?: string;
    jszipGenerateType?: string;
  }

  class PPTX2Json {
    constructor(options?: PPTX2JsonOptions);
    /** Parse a PowerPoint file path to JSON. */
    toJson(file: string): Promise<Record<string, unknown>>;
    /** Parse a PowerPoint buffer to JSON. */
    buffer2json(buffer: Buffer): Promise<Record<string, unknown>>;
  }

  export = PPTX2Json;
}
