import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "cursor.com",
    "*.cursor.com",
    "**.cursor.com",
    "cursor.sh",
    "*.cursor.sh",
    "cursorusercontent.com",
    "*.cursorusercontent.com",
  ],
  serverExternalPackages: [
    "@huggingface/transformers",
    "onnxruntime-node",
    "sharp",
  ],
};

export default nextConfig;
