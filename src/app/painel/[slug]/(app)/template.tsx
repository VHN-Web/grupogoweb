// Cada troca de página no painel entra com uma transição suave.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
