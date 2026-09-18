/** @type {import('next').NextConfig} */
const nextConfig = {
  // Include template .docx files in Vercel serverless function bundle
  experimental: {
    outputFileTracingIncludes: {
      "/api/docs/generate": ["./src/templates/tokenized/**/*"],
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
