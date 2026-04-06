import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // pptx2json is a Node.js-only library that requires the built-in `fs`
      // module. Because `lib/extractTextFromFile.ts` is a client component,
      // Turbopack tries to bundle pptx2json for the browser and fails.
      // This alias replaces pptx2json with a browser-safe stub that throws a
      // descriptive error when called, preventing the build failure.
      pptx2json: "./lib/browser-stubs/pptx2json-stub.ts",
    },
  },
  webpack: (config) => {
    // `canvas` is a Node.js-only optional peer dep used by pdfjs-dist for
    // server-side rendering. Marking it as external prevents the
    // "Module not found: Can't resolve 'canvas'" build error when using
    // the Webpack bundler.
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      { canvas: "canvas" },
    ];
    return config;
  },
};

export default nextConfig;
