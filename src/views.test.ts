import { describe, expect, it } from "vitest";
import { analisarId, IDS } from "./ids.js";
import { carregarCatalogo } from "./produtos.js";
import { painelLoja, resumoProduto } from "./views.js";

const catalogo = carregarCatalogo();

describe("views", () => {
  it("painel: um campo e uma opção por produto, com o custom_id do select", () => {
    const p = painelLoja(catalogo);
    expect(p.embeds![0]!.toJSON().fields).toHaveLength(3);
    const menu = p.components![0]!.toJSON().components[0] as { custom_id: string; options: { value: string; description: string }[] };
    expect(menu.custom_id).toBe(IDS.selectProduto);
    expect(menu.options.map((o) => o.value)).toEqual(["plano-mensal", "plano-anual", "suporte-premium"]);
    expect(menu.options.every((o) => o.description.length <= 100)).toBe(true);
  });

  it("resumo: mostra o preço formatado e o botão de compra do produto", () => {
    const r = resumoProduto(catalogo.produtos[0]!, "BRL");
    expect(r.embeds![0]!.toJSON().fields![0]!.value).toMatch(/R\$\s29,90/);
    expect(r.components![0]!.toJSON().components[0]).toMatchObject({ custom_id: "loja:comprar:plano-mensal", style: 3 });
  });

  it("ids: ida e volta, e ids de fora são ignorados", () => {
    expect(analisarId(IDS.comprar("x"))).toEqual({ acao: "comprar", valor: "x" });
    expect(analisarId(IDS.jaPaguei("p1"))).toEqual({ acao: "paguei", valor: "p1" });
    expect(analisarId("loja:comprar")).toBeNull();
    expect(analisarId("outro:comprar:x")).toBeNull();
  });
});
