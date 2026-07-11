export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 dark:bg-mia-ink">
      <main className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <h1 className="text-6xl font-bold tracking-tight">
          <span className="mia-gradient-text">mia</span>
        </h1>
        <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-300">
          Descuentos que de verdad te sirven, sin perder tiempo revisando
          cientos de promociones.
        </p>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          El chat de MIA se conecta aquí próximamente.
        </p>
      </main>
    </div>
  );
}
