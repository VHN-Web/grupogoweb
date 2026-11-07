// Aplica as preferências de acessibilidade antes de a página aparecer (evita "piscar" no tamanho/contraste).
const code = `try{var p=JSON.parse(localStorage.getItem("gw_a11y")||"{}"),h=document.documentElement;if(p.scale===1)h.classList.add("a11y-scale-1");if(p.scale===2)h.classList.add("a11y-scale-2");if(p.contrast)h.classList.add("a11y-contrast");if(p.motion)h.classList.add("a11y-motion");if(p.links)h.classList.add("a11y-links");if(p.spacing)h.classList.add("a11y-spacing")}catch(e){}`;

export function A11yBoot() {
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
