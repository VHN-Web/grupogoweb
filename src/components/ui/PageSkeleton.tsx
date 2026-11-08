/** Esqueleto mostrado na hora do clique enquanto a página carrega (loading.tsx). */
export function PageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="skel h-7 w-56" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skel h-20" />)}
      </div>
      <div className="skel h-10 w-full max-w-lg" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skel h-14" />)}
      </div>
    </div>
  );
}
