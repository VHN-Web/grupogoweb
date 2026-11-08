// Lançamento oficial da GoWeb: até esta data a página inicial mostra a contagem regressiva.
// ?preview=1 mostra o site completo (para revisar antes). Depois da data, tudo volta ao normal sozinho.
export const LAUNCH_AT = new Date("2026-11-12T00:00:00-03:00");
export const isPreLaunch = (now = Date.now()) => now < LAUNCH_AT.getTime();
