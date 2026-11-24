/** @type {import('next').NextConfig} */
const nextConfig = {
  // Include template .docx files in Vercel serverless function bundle
  experimental: {
    // pdf.js is loaded with require() inside the deal extractor, including its
    // worker file. Leave the package on disk instead of bundling it.
    serverComponentsExternalPackages: ["pdfjs-dist"],
    outputFileTracingIncludes: {
      "/api/docs/generate": [
        "./src/templates/tokenized/**/*",
        // Letterhead PNG read from disk while embedding the LOI watermark.
        "./src/templates/assets/**/*",
      ],
      // The staff assistant reads this guide from disk for its instructions.
      "/api/assistant/chat": ["./docs/HOW-CRE8-WORKS.md"],
      // Standard fonts and cmaps are read from disk while extracting PDF text.
      "/api/flow/deals/extract": [
        "./node_modules/pdfjs-dist/package.json",
        "./node_modules/pdfjs-dist/legacy/build/pdf.js",
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.js",
        "./node_modules/pdfjs-dist/standard_fonts/**/*",
        "./node_modules/pdfjs-dist/cmaps/**/*",
      ],
    },
  },
  // pdfjs-dist optionally requires 'canvas' (Node-only). Stub it out for the browser build.
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  async headers() {
    return [
      {
        source: "/api/email/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
