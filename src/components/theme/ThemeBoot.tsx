// Aplica o tema (claro/escuro/sistema) antes de a página aparecer, para não "piscar".
// Preferência salva no aparelho em localStorage "gw_theme" ("light" | "dark" | "system"; padrão: sistema).
const code = `(function(){try{var m=localStorage.getItem("gw_theme")||"system",q=window.matchMedia("(prefers-color-scheme: dark)"),h=document.documentElement;function a(){var d=m==="dark"||(m==="system"&&q.matches);h.classList.toggle("dark",d);h.style.colorScheme=d?"dark":"light";h.dataset.themeMode=m}a();q.addEventListener&&q.addEventListener("change",function(){m=localStorage.getItem("gw_theme")||"system";a()})}catch(e){}})()`;

export function ThemeBoot() {
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
