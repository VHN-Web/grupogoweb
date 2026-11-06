export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <p className={`mb-4 rounded-xl px-4 py-3 text-sm ${err ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{err ?? ok}</p>
  );
}
