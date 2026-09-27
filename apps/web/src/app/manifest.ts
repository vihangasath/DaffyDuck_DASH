import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Waypoint Delivery Planning",
    short_name: "Waypoint",
    description: "Ordering, planning, loading and delivery for Waypoint Group.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7f9",
    theme_color: "#0c1e2b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
