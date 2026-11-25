import { describe, expect, it } from "vitest";
import { carregarCatalogo, formatarPreco, validarCatalogo } from "./produtos.js";

describe("catálogo", () => {
  it("carrega o config/produtos.json com os três produtos fictícios", () => {
    const c = carregarCatalogo();
    expect(c.produtos.map((p) => p.nome)).toEqual(["Plano Mensal", "Plano Anual", "Suporte Premium"]);
  });

  it("formata preço em reais", () => {
    expect(formatarPreco(2990)).toMatch(/^R\$\s29,90$/);
  });

  it("rejeita lista vazia, id repetido, id inválido e preço inválido", () => {
    expect(() => validarCatalogo({ produtos: [] })).toThrow(/vazia/);
    const p = { id: "a", nome: "A", descricao: "", precoCentavos: 100 };
    expect(() => validarCatalogo({ produtos: [p, p] })).toThrow(/repetido/);
    expect(() => validarCatalogo({ produtos: [{ ...p, id: "A B" }] })).toThrow(/id inválido/);
    expect(() => validarCatalogo({ produtos: [{ ...p, precoCentavos: 1.5 }] })).toThrow(/precoCentavos/);
  });

  it("limita a 25 produtos (select do Discord)", () => {
    const muitos = Array.from({ length: 26 }, (_, i) => ({ id: `p${i}`, nome: "x", descricao: "", precoCentavos: 100 }));
    expect(() => validarCatalogo({ produtos: muitos })).toThrow(/25/);
  });
});
