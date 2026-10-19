// Unica fuente de verdad de la version del panel admin (Fase 5 de v2.3) -
// separada de package.json/NEXT_PUBLIC_APP_VERSION a proposito: ese valor
// es compartido con la app publica de MIA (2.5.0 hoy) y describe otra cosa.
// El hash de build y el prefijo de entorno siguen viniendo de
// next.config.ts (ver layout.tsx) - aqui solo vive el numero del admin.
export const ADMIN_VERSION = "2.3.0";
