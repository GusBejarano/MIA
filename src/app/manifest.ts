import type { MetadataRoute } from "next";

// Web App Manifest - lo que Android/Chrome usa para el nombre corto bajo
// el icono al "Agregar a pantalla de inicio" (Chrome ignora el <title> de
// la pagina y el meta apple-mobile-web-app-title cuando hay un manifest
// real; sin este archivo caia de vuelta al <title> completo y lo truncaba,
// igual que le pasaba a iOS sin apple-mobile-web-app-title). `short_name`
// es lo que se ve bajo el icono; `name` es la version larga (instalar app,
// splash screen).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MIA — Descuentos Inteligentes",
    short_name: "MIA",
    description:
      "MIA te muestra los descuentos que de verdad te sirven, sin perder tiempo revisando cientos de promociones.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#6C4CF1",
    icons: [
      {
        src: "/logo/mia-icon.png",
        sizes: "500x500",
        type: "image/png",
      },
    ],
  };
}
