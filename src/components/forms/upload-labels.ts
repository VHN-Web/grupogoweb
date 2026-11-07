// Textos do componente ImageUpload (fica fora do arquivo "use client" para poder ser chamado no servidor).
export function uploadLabels(T: (es: string, pt: string) => string) {
  return {
    choose: T("Elegir foto", "Escolher foto"),
    change: T("Cambiar", "Trocar"),
    drop: T("o arrastrá la imagen acá", "ou arraste a imagem aqui"),
    remove: T("Quitar", "Remover"),
    processing: T("Procesando…", "Processando…"),
    tooBig: T("La imagen supera 20 MB.", "A imagem passa de 20 MB."),
    invalid: T("No pudimos leer esta imagen. Probá con JPG o PNG.", "Não conseguimos ler esta imagem. Tente com JPG ou PNG."),
    hint: T("JPG, PNG, WEBP o foto del celular — la achicamos automáticamente", "JPG, PNG, WEBP ou foto do celular — reduzimos automaticamente"),
  };
}
