import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import pkg from "./package.json";

// Hash corto del commit que se esta construyendo. En Netlify viene dado por
// COMMIT_REF (build-time); en build local (sin Netlify) se cae a git
// directamente, y si tampoco hay repo git disponible, a "local".
function shortBuildHash(): string {
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "local";
  }
}

// Netlify setea CONTEXT en build time: "production", "deploy-preview",
// "branch-deploy" o "dev". Solo el contexto "production" real (rama main)
// va sin prefijo - cualquier otro contexto (o build local) se marca "dev-"
// para diferenciar reportes de soporte entre ambientes.
const isProduction = process.env.CONTEXT === "production";

const nextConfig: NextConfig = {
  // Permite probar el dev server desde un celular en la misma red local
  // (ej. http://192.168.1.11:3000) - sin esto Next.js bloquea los recursos
  // del bundler para cualquier origen que no sea localhost, y la app se ve
  // pero nunca hidrata (los botones quedan "muertos", sin React conectado).
  allowedDevOrigins: ["192.168.1.11"],
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_HASH: shortBuildHash(),
    NEXT_PUBLIC_ENV_PREFIX: isProduction ? "" : "dev-",
  },
};

export default nextConfig;
