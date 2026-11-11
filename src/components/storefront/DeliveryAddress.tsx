"use client";
// Endereço de entrega no checkout: CEP com preenchimento automático (Brasil), número da casa (ou "sem número"),
// bairro, complemento e referência — e o botão de compartilhar a localização, que já preenche a rua e o bairro.
// Com o endereço digitado, o servidor acha a coordenada (adapters/geocoding) para calcular a entrega e guiar o motoboy.
import { useEffect, useRef, useState } from "react";
import { EMPTY_ADDRESS, addressReady, composeAddress, formatCep, isValidCep, mergeAddress, onlyDigits, type AddressParts } from "@/core/address";

export type Quote = { state: "idle" } | { state: "loading" } | { state: "ok"; feePyg: number; distanceKm?: number; free?: boolean } | { state: "error"; message: string };

export type DeliveryValue = {
  address: string;
  neighborhood: string;
  parts: AddressParts;
  coords: { lat: number; lng: number } | null;
  quote: Quote;
};

type Props = {
  slug: string;
  country: string;
  subtotal: number;
  T: (es: string, pt: string) => string;
  money: (v: number) => string;
  ghostBtn: string;
  onChange: (v: DeliveryValue) => void;
};

export function DeliveryAddress({ slug, country, subtotal, T, money, ghostBtn, onChange }: Props) {
  const br = country === "BR";
  const [p, setP] = useState<AddressParts>(EMPTY_ADDRESS);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [precision, setPrecision] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote>({ state: "idle" });
  const [cepMsg, setCepMsg] = useState<string | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof AddressParts, v: string | boolean) => setP((cur) => ({ ...cur, [k]: v }));

  // avisa o checkout
  useEffect(() => {
    onChange({ address: addressReady(p, country) ? composeAddress(p, country) : "", neighborhood: p.neighborhood.trim(), parts: p, coords, quote });
  }, [p, coords, quote, country, onChange]);

  // CEP completo → rua, bairro, cidade e UF
  useEffect(() => {
    if (!br || !isValidCep(p.cep)) return;
    let cancel = false;
    setCepMsg(T("Buscando…", "Buscando CEP…"));
    fetch(`/api/endereco/cep?cep=${onlyDigits(p.cep)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j.ok) return setCepMsg(T("No encontramos este CEP. Completá a mano.", "CEP não encontrado. Preencha à mão."));
        setCepMsg(null);
        setP((cur) => mergeAddress(cur, j, true));
        setTimeout(() => numberRef.current?.focus(), 50);
      })
      .catch(() => !cancel && setCepMsg(T("Sin conexión para buscar el CEP. Completá a mano.", "Sem conexão para buscar o CEP. Preencha à mão.")));
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [br, p.cep]);

  // taxa de entrega: pela localização compartilhada ou, sem ela, pelo endereço digitado (o servidor acha a casa)
  const ready = addressReady(p, country);
  const key = gps ? `gps:${gps.lat},${gps.lng}` : ready ? `addr:${composeAddress(p, country)}` : "";
  useEffect(() => {
    if (!key) {
      setQuote({ state: "idle" });
      setCoords(gps);
      return;
    }
    let cancel = false;
    setQuote({ state: "loading" });
    const run = setTimeout(() => {
      fetch("/api/delivery-quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, subtotalPyg: subtotal, ...(gps ? gps : { address: p }) }),
      })
        .then((r) => r.json())
        .then((q) => {
          if (cancel) return;
          if (q.lat != null && q.lng != null) setCoords({ lat: q.lat, lng: q.lng });
          setPrecision(q.precision ?? null);
          if (q.ok) setQuote({ state: "ok", feePyg: q.feePyg, distanceKm: q.distanceKm, free: q.free });
          else if (q.reason === "NO_STORE_LOCATION") setQuote({ state: "ok", feePyg: q.baseFeePyg ?? 0 });
          else if (q.reason === "ADDRESS_NOT_FOUND") {
            setCoords(null);
            setQuote({ state: "error", message: T("No encontramos esta dirección. Revisá la calle y el número, o tocá “Usar mi ubicación”.", "Não achamos este endereço. Confira a rua e o número, ou toque em “Usar minha localização”.") });
          } else setQuote({ state: "error", message: q.reason === "OUT_OF_RANGE" ? T(`Fuera del área de delivery (${q.distanceKm} km)`, `Fora da área de entrega (${q.distanceKm} km)`) : T("No se pudo calcular", "Não foi possível calcular") });
        })
        .catch(() => !cancel && setQuote({ state: "error", message: T("No se pudo calcular", "Não foi possível calcular") }));
    }, gps ? 0 : 800);
    return () => {
      cancel = true;
      clearTimeout(run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, subtotal, slug]);

  const locate = () => {
    setLocMsg(null);
    if (!navigator.geolocation) return setLocMsg(T("Tu navegador no comparte ubicación.", "Seu navegador não compartilha localização."));
    setLocMsg(T("Buscando tu ubicación…", "Buscando sua localização…"));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGps(c);
        setLocMsg(null);
        // já preenche rua, bairro e cidade; o cliente confere e põe o número
        fetch("/api/endereco/reverso", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) })
          .then((r) => r.json())
          .then((j) => {
            if (!j.ok) return;
            setP((cur) => mergeAddress(cur, j));
            setTimeout(() => numberRef.current?.focus(), 50);
          })
          .catch(() => null);
      },
      () => setLocMsg(T("Permití el acceso a la ubicación o completá la dirección.", "Permita o acesso à localização ou preencha o endereço.")),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  return (
    <div className="space-y-3">
      <p className="label !mb-0">{T("Dirección de entrega", "Endereço de entrega")}</p>
      <button type="button" onClick={locate} className={`${ghostBtn} w-full py-3`}>
        <span className="inline-flex items-center justify-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
          {gps ? T("Ubicación compartida — actualizar", "Localização compartilhada — atualizar") : T("Usar mi ubicación (más preciso)", "Usar minha localização (mais preciso)")}
        </span>
      </button>
      {locMsg && <p className="th-muted text-[13px]">{locMsg}</p>}

      <div className="grid grid-cols-6 gap-2">
        {br && (
          <div className="col-span-3">
            <label className="label" htmlFor="cep">CEP</label>
            <input id="cep" className="input" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={formatCep(p.cep)} onChange={(e) => set("cep", onlyDigits(e.target.value).slice(0, 8))} />
          </div>
        )}
        {br && (
          <div className="col-span-3 flex items-end">
            <a className="th-muted pb-3 text-[12.5px] underline" href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener noreferrer">{T("No sé mi CEP", "Não sei meu CEP")}</a>
          </div>
        )}
        {cepMsg && <p className="th-muted col-span-6 text-[13px]">{cepMsg}</p>}
        <div className="col-span-6">
          <label className="label" htmlFor="street">{T("Calle", "Rua / avenida")}</label>
          <input id="street" className="input" autoComplete="address-line1" value={p.street} onChange={(e) => set("street", e.target.value)} placeholder={T("Ej.: Av. Mcal. López", "Ex.: Rua dos Navegantes")} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="num">{T("Número", "Número")}</label>
          <input id="num" ref={numberRef} className="input" inputMode="numeric" autoComplete="address-line2" value={p.noNumber ? "" : p.number} disabled={p.noNumber} onChange={(e) => set("number", e.target.value.slice(0, 12))} placeholder="123" />
        </div>
        <div className="col-span-4">
          <label className="label" htmlFor="compl">{T("Depto / complemento", "Complemento")}</label>
          <input id="compl" className="input" value={p.complement} onChange={(e) => set("complement", e.target.value)} placeholder={T("Depto, bloque…", "Apto, bloco, casa 2…")} />
        </div>
        <label className="col-span-6 flex items-center gap-2 text-[13px]">
          <input type="checkbox" className="h-4 w-4" checked={p.noNumber} onChange={(e) => set("noNumber", e.target.checked)} /> {T("Sin número", "Sem número")}
        </label>
        <div className="col-span-6 sm:col-span-3">
          <label className="label" htmlFor="bairro">{T("Barrio", "Bairro")}</label>
          <input id="bairro" className="input" value={p.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} />
        </div>
        <div className={br ? "col-span-4 sm:col-span-2" : "col-span-6 sm:col-span-3"}>
          <label className="label" htmlFor="city">{T("Ciudad", "Cidade")}</label>
          <input id="city" className="input" autoComplete="address-level2" value={p.city} onChange={(e) => set("city", e.target.value)} />
        </div>
        {br && (
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="uf">UF</label>
            <input id="uf" className="input uppercase" maxLength={2} autoComplete="address-level1" value={p.state} onChange={(e) => set("state", e.target.value.replace(/[^a-z]/gi, "").toUpperCase())} />
          </div>
        )}
        <div className="col-span-6">
          <label className="label" htmlFor="ref">{T("Referencia (opcional)", "Ponto de referência (opcional)")}</label>
          <input id="ref" className="input" value={p.reference} onChange={(e) => set("reference", e.target.value)} placeholder={T("Ej.: portón verde, al lado de la farmacia", "Ex.: portão verde, ao lado da farmácia")} />
        </div>
      </div>

      {!ready && !gps && <p className="th-muted text-[13px]">{T("Completá calle, número y ciudad para calcular el delivery.", "Preencha rua, número e cidade para calcular a entrega.")}</p>}
      {quote.state === "loading" && <p className="th-muted text-[13px]">{T("Buscando la dirección y calculando el delivery…", "Localizando o endereço e calculando a entrega…")}</p>}
      {quote.state === "error" && <p className="text-[13px] text-red-500">{quote.message}</p>}
      {quote.state === "ok" && (
        <p className="th-muted text-[13px]">
          {T("Delivery", "Entrega")}: <b style={{ color: "var(--fg)" }}>{quote.free ? T("Gratis", "Grátis") : money(quote.feePyg)}</b>
          {quote.distanceKm != null && ` · ${quote.distanceKm} km`}
          {precision === "area" && ` · ${T("ubicación aproximada (barrio/CEP): para más precisión, usá tu ubicación", "localização aproximada (bairro/CEP): para mais precisão, use sua localização")}`}
        </p>
      )}
    </div>
  );
}
