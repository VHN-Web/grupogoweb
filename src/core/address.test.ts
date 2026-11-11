import { describe, expect, it } from "vitest";
import {
  EMPTY_ADDRESS,
  addressReady,
  composeAddress,
  formatCep,
  geocodeQueries,
  isValidCep,
  mergeAddress,
  neighborhoodFromText,
  parseBrasilApi,
  parseNominatimReverse,
  parseNominatimSearch,
  parseViaCep,
} from "./address";

const casa = { ...EMPTY_ADDRESS, cep: "51020000", street: "Rua dos Navegantes", number: "123", complement: "apto 2", neighborhood: "Boa Viagem", city: "Recife", state: "PE", reference: "perto da padaria" };

describe("endereço de entrega", () => {
  it("CEP", () => {
    expect(isValidCep("51020-000")).toBe(true);
    expect(isValidCep("00000000")).toBe(false);
    expect(isValidCep("5102")).toBe(false);
    expect(formatCep("51020000")).toBe("51020-000");
    expect(formatCep("510")).toBe("510");
  });
  it("pronto para buscar: rua, número (ou sem número) e cidade/CEP", () => {
    expect(addressReady(casa, "BR")).toBe(true);
    expect(addressReady({ ...casa, number: "" }, "BR")).toBe(false);
    expect(addressReady({ ...casa, number: "", noNumber: true }, "BR")).toBe(true);
    expect(addressReady({ ...casa, city: "", cep: "" }, "BR")).toBe(false);
    expect(addressReady({ ...casa, cep: "", city: "", neighborhood: "Centro" }, "PY")).toBe(true);
  });
  it("texto do pedido com bairro em destaque", () => {
    expect(composeAddress(casa, "BR")).toBe("Rua dos Navegantes, 123, apto 2 - Boa Viagem - Recife/PE - CEP 51020-000 (Ref.: perto da padaria)");
    expect(composeAddress({ ...casa, noNumber: true, number: "", complement: "", reference: "", cep: "" }, "BR")).toBe("Rua dos Navegantes, S/N - Boa Viagem - Recife/PE");
    expect(neighborhoodFromText(composeAddress(casa, "BR"))).toBe("Boa Viagem");
    expect(neighborhoodFromText("Rua A, 10")).toBeNull();
  });
  it("buscas da mais precisa para a mais aproximada", () => {
    const q = geocodeQueries(casa, "BR");
    expect(q[0]).toEqual({ params: { street: "123 Rua dos Navegantes", city: "Recife", state: "PE", countrycodes: "br" }, precision: "exact" });
    expect(q.map((x) => x.precision)).toEqual(["exact", "street", "area", "area"]);
    expect(geocodeQueries({ ...EMPTY_ADDRESS, street: "Mcal. López", number: "100", city: "Asunción" }, "PY")[0].params.countrycodes).toBe("py");
  });
  it("lê ViaCEP, BrasilAPI e OpenStreetMap", () => {
    expect(parseViaCep({ cep: "51020-000", logradouro: "Rua dos Navegantes", bairro: "Boa Viagem", localidade: "Recife", uf: "PE" })).toEqual({ cep: "51020000", street: "Rua dos Navegantes", neighborhood: "Boa Viagem", city: "Recife", state: "PE" });
    expect(parseViaCep({ erro: true })).toBeNull();
    const b = parseBrasilApi({ cep: "51020000", street: "R. X", neighborhood: "Boa Viagem", city: "Recife", state: "PE", location: { coordinates: { latitude: "-8.12", longitude: "-34.9" } } });
    expect(b?.coords).toEqual({ lat: -8.12, lng: -34.9 });
    expect(parseBrasilApi({ city: "Recife", location: { coordinates: {} } })?.coords).toBeNull();
    expect(parseNominatimSearch([{ lat: "-8.1", lon: "-34.9" }])).toEqual({ lat: -8.1, lng: -34.9 });
    expect(parseNominatimSearch([])).toBeNull();
    expect(parseNominatimReverse({ address: { road: "Rua X", house_number: "5", suburb: "Boa Viagem", city: "Recife", "ISO3166-2-lvl4": "BR-PE", postcode: "51020-000" } })).toEqual({ street: "Rua X", number: "5", neighborhood: "Boa Viagem", city: "Recife", state: "PE", cep: "51020000" });
  });
  it("não apaga o que o cliente digitou", () => {
    const cur = { ...EMPTY_ADDRESS, number: "77", street: "Minha rua" };
    expect(mergeAddress(cur, { street: "Outra", city: "Recife", number: "1" })).toMatchObject({ street: "Minha rua", number: "77", city: "Recife" });
    expect(mergeAddress(cur, { street: "Outra" }, true).street).toBe("Outra");
  });
});
