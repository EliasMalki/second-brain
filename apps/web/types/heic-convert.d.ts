// heic-convert ships no types. It decodes HEIC/HEIF via a pure-JS libheif
// (WASM) port, so it works in serverless without a native binary.
declare module "heic-convert" {
  type ConvertInput = Buffer | ArrayBuffer | Uint8Array;

  interface ConvertOptions {
    buffer: ConvertInput;
    format: "JPEG" | "PNG";
    /** JPEG compression quality, 0..1. Ignored for PNG. */
    quality?: number;
  }

  function convert(options: ConvertOptions): Promise<Buffer>;
  export = convert;
}
