import { ILLUSTRATIONS, isIllustration } from "@/core/illustrations";

export function Illustration({ name, size, className }: { name: string | null | undefined; size: number; className?: string }) {
  if (!isIllustration(name)) return null;
  const it = ILLUSTRATIONS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: it.svg }}
    />
  );
}
