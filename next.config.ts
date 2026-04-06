import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // `canvas` is a Node.js-only optional peer dep used by pdfjs-dist for
    // server-side rendering. The browser code-path is guarded by
    // `typeof document !== "undefined"`, but the bundler still tries to
    // resolve the `require("canvas")` call.  Marking it as external prevents
    // the "Module not found: Can't resolve 'canvas'" build error.
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      { canvas: "canvas" },
    ];
    return config;
  },
};

export default nextConfig;
