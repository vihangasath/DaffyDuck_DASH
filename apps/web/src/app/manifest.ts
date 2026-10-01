import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DASH Delivery Planning",
    short_name: "DASH",
    description: "Ordering, planning, loading and delivery for Waypoint Group.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7f9",
    theme_color: "#102447",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
