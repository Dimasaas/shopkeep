import { MessageFlags } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { carregarCatalogo } from "./produtos.js";
import { aoEscolherProduto, aoPublicarPainel, criarRoteador, type Deps } from "./handlers.js";

const deps: Deps = {
  catalogo: carregarCatalogo(),
  config: {
    token: "t", appId: "1", guildId: "2", categoriaTicketsId: "3", canalPainelId: "4", cargoEquipeId: "5",
    pagamentoProvedor: "falso", pagamentoFalsoAutoSegundos: 0,
  },
};

describe("handlers do painel", () => {
  it("escolher produto responde (só para quem clicou) com resumo e botão Comprar", async () => {
    const reply = vi.fn();
    await aoEscolherProduto({ values: ["plano-anual"], reply } as never, deps);
    const arg = reply.mock.calls[0]![0];
    expect(arg.flags).toBe(MessageFlags.Ephemeral);
    expect(arg.embeds[0].toJSON().title).toContain("Plano Anual");
    expect(arg.components[0].toJSON().components[0].custom_id).toBe("loja:comprar:plano-anual");
  });

  it("produto que não existe mais avisa em vez de quebrar", async () => {
    const reply = vi.fn();
    await aoEscolherProduto({ values: ["sumiu"], reply } as never, deps);
    expect(reply.mock.calls[0]![0].content).toMatch(/saiu da loja/);
  });

  it("/painel envia o painel ao canal e confirma de forma efêmera", async () => {
    const send = vi.fn();
    const reply = vi.fn();
    await aoPublicarPainel({ channel: { send }, reply } as never, deps);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0].components[0].toJSON().components[0].custom_id).toBe("loja:produto");
    expect(reply.mock.calls[0]![0].flags).toBe(MessageFlags.Ephemeral);
  });

  it("/painel fora de canal de texto não envia nada", async () => {
    const reply = vi.fn();
    await aoPublicarPainel({ channel: null, reply } as never, deps);
    expect(reply.mock.calls[0]![0].content).toMatch(/canal de texto/);
  });

  it("o roteador ignora interações de outros componentes", async () => {
    const reply = vi.fn();
    const rota = criarRoteador(deps);
    await rota({ isChatInputCommand: () => false, isStringSelectMenu: () => true, customId: "outro:x", reply } as never);
    expect(reply).not.toHaveBeenCalled();
  });
});
