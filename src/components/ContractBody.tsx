// Renderiza o texto do contrato (formato simples de src/core/contract.ts).
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-bold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function ContractBody({ body, className }: { body: string; className?: string }) {
  const lines = body.split("\n");
  return (
    <div className={`space-y-2 text-[13.5px] leading-relaxed ${className ?? ""}`}>
      {lines.map((l, i) =>
        l.startsWith("## ") ? (
          <h3 key={i} className="pt-3 text-[14.5px] font-bold">
            {l.slice(3)}
          </h3>
        ) : l.startsWith("• ") ? (
          <p key={i} className="pl-4">
            • {inline(l.slice(2))}
          </p>
        ) : l.trim() === "" ? null : (
          <p key={i}>{inline(l)}</p>
        ),
      )}
    </div>
  );
}
