import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite probar el dev server desde un celular en la misma red local
  // (ej. http://192.168.1.11:3000) - sin esto Next.js bloquea los recursos
  // del bundler para cualquier origen que no sea localhost, y la app se ve
  // pero nunca hidrata (los botones quedan "muertos", sin React conectado).
  allowedDevOrigins: ["192.168.1.11"],
};

export default nextConfig;
