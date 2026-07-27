"use client";

import { useState } from "react";
import { colorForString } from "@/lib/mia/colorPalette";

type BenefitThumbnailProps = {
  imageUrl?: string | null;
  title: string;
  /** Tamano/bordes del marco - varia segun donde se usa (carrusel vs detalle), este componente no los fija. */
  className: string;
};

/**
 * Miniatura de un beneficio, unica para el carrusel (Fase 1 exploracion por
 * categoria, Caso Aplicado #1 buscador de negocio) y el detalle (Paso 7) -
 * antes cada uno tenia su propio manejo de imagen/fallback por separado.
 *
 * Sin foto (o imagen rota - ver onError) usa un color solido deterministico
 * por titulo (mismo beneficio, mismo color siempre) con el titulo mismo
 * como contenido, en vez de un espacio vacio o icono roto.
 *
 * Con foto, evita deformar o recortar mal fotos que no calzan con el marco
 * (logos cuadrados de Comfenalco/USB Cali, capturas de pantalla): un fondo
 * de la misma imagen desenfocado cubre todo el marco, y la imagen real va
 * completa encima sin recortar (object-contain), en vez de forzar un
 * object-cover que le come los bordes.
 */
export default function BenefitThumbnail({ imageUrl, title, className }: BenefitThumbnailProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showFallback = !imageUrl || imageFailed;

  if (showFallback) {
    return (
      <div
        className={`flex items-center justify-center px-2 text-center ${className}`}
        style={{ background: colorForString(title) }}
      >
        <span className="line-clamp-3 text-sm font-bold leading-tight text-white">{title}</span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-lg"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={title}
        onError={() => setImageFailed(true)}
        className="relative h-full w-full object-contain"
      />
    </div>
  );
}
