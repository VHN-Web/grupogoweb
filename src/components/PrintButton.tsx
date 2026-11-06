"use client";
export function PrintButton({ label = "Imprimir", className = "btn-ghost" }: { label?: string; className?: string }) {
  return (
    <button onClick={() => window.print()} className={`${className} no-print`}>
      {label}
    </button>
  );
}
