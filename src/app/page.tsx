import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-white px-6">
      <main className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <Image
          src="/logo/mia-logo.png"
          alt="mia"
          width={480}
          height={188}
          priority
          className="h-auto w-72 sm:w-80"
        />
        <p className="-mt-4 text-sm text-zinc-400">by Descuentos Inteligentes</p>
        <p className="text-2xl font-semibold leading-snug text-mia-ink">
          MIA encuentra, entre cientos de beneficios, los que sí son para ti.
        </p>
        <p className="max-w-md text-lg leading-8 text-zinc-600">
          Descuentos que de verdad te sirven, sin perder tiempo revisando
          cientos de promociones.
        </p>
        <p className="text-sm text-zinc-400">
          Estamos afinando los últimos detalles. Muy pronto podrás hablar con
          MIA aquí mismo.
        </p>
      </main>
    </div>
  );
}
