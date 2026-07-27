import type { MetadataRoute } from "next";

/** PWA manifest — installable, offline-capable per the design principles. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finance OS",
    short_name: "Finance OS",
    description:
      "AI-powered personal finance operating system — budgets, goals, loans and net worth in one dashboard.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0a080f",
    theme_color: "#0a080f",
    orientation: "portrait",
    categories: ["finance", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
