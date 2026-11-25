import { MessageFlags } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { canalFalso, clienteFalso, IDS_TESTE, membro, novasDeps } from "../test/helpers.js";
import { aoCancelar, aoComprar, aoEscolherProduto, aoJaPaguei, aoPagamentoConfirmado, aoPublicarPainel, criarRoteador } from "./handlers.js";

describe("handlers do painel", () => {
  it("escolher produto responde (só para quem clicou) com resumo e botão Comprar", async () => {
    const reply = vi.fn();
    await aoEscolherProduto({ values: ["plano-anual"], reply } as never, novasDeps());
    const arg = reply.mock.calls[0]![0];
    expect(arg.flags).toBe(MessageFlags.Ephemeral);
    expect(arg.embeds[0].toJSON().title).toContain("Plano Anual");
    expect(arg.components[0].toJSON().components[0].custom_id).toBe("loja:comprar:plano-anual");
  });

  it("produto que não existe mais avisa em vez de quebrar", async () => {
    const reply = vi.fn();
    await aoEscolherProduto({ values: ["sumiu"], reply } as never, novasDeps());
    expect(reply.mock.calls[0]![0].content).toMatch(/saiu da loja/);
  });

  it("/painel envia o painel ao canal e confirma de forma efêmera", async () => {
    const send = vi.fn();
    const reply = vi.fn();
    await aoPublicarPainel({ channel: { send }, reply } as never, novasDeps());
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0].components[0].toJSON().components[0].custom_id).toBe("loja:produto");
    expect(reply.mock.calls[0]![0].flags).toBe(MessageFlags.Ephemeral);
  });

  it("/painel fora de canal de texto não envia nada", async () => {
    const reply = vi.fn();
    await aoPublicarPainel({ channel: null, reply } as never, novasDeps());
    expect(reply.mock.calls[0]![0].content).toMatch(/canal de texto/);
  });

  it("o roteador ignora interações de outros componentes", async () => {
    const reply = vi.fn();
    const rota = criarRoteador(novasDeps());
    await rota({ isChatInputCommand: () => false, isStringSelectMenu: () => true, customId: "outro:x", reply } as never);
    expect(reply).not.toHaveBeenCalled();
  });
});

/** Interação de botão do comprador, com guild e criação de canal mockados. */
function cliqueDoComprador(ticket = canalFalso()) {
  const { client, logs } = clienteFalso({ [ticket.id]: ticket });
  const create = vi.fn(async (opcoes: unknown) => ({ ...ticket, opcoes }));
  const channelsDelete = vi.fn(async () => ({}));
  const reply = vi.fn();
  const deferReply = vi.fn();
  const editReply = vi.fn();
  const i = {
    user: { id: IDS_TESTE.comprador, username: "comprador" },
    member: membro({ nome: "Maria Souza" }),
    client,
    guild: { id: IDS_TESTE.guild, client: { user: { id: IDS_TESTE.bot } }, channels: { create, delete: channelsDelete } },
    channel: ticket,
    reply,
    deferReply,
    editReply,
  };
  return { i, ticket, create, reply, editReply, logs, channelsDelete, client };
}

describe("compra", () => {
  it("Comprar cria o ticket privado, a cobrança e posta o pagamento no canal", async () => {
    const deps = novasDeps();
    const t = cliqueDoComprador();
    await aoComprar(t.i as never, "plano-mensal", deps);

    const opcoes = t.create.mock.calls[0]![0] as { name: string; parent: string; permissionOverwrites: { id: string }[] };
    expect(opcoes.name).toBe("ticket-maria-souza");
    expect(opcoes.parent).toBe(IDS_TESTE.categoria);
    expect(opcoes.permissionOverwrites.map((o) => o.id)).toEqual([IDS_TESTE.guild, IDS_TESTE.comprador, IDS_TESTE.equipe, IDS_TESTE.bot]);

    const msg = t.ticket.send.mock.calls[0]![0] as { embeds: { toJSON(): { title: string } }[]; components: { toJSON(): { components: { custom_id: string }[] } }[] };
    expect(msg.embeds[0]!.toJSON().title).toMatch(/aguardando pagamento/);
    expect(msg.components[0]!.toJSON().components.map((b) => b.custom_id.split(":")[1])).toEqual(["paguei", "cancelar"]);
    expect(t.editReply).toHaveBeenCalledWith(expect.stringContaining(`<#${t.ticket.id}>`));
    expect(t.logs.send).toHaveBeenCalledOnce();
    expect((await deps.pedidos.emAbertoDoUsuario(IDS_TESTE.comprador))?.canalId).toBe(t.ticket.id);
  });

  it("segundo clique do mesmo cliente aponta o ticket existente em vez de abrir outro", async () => {
    const deps = novasDeps();
    await aoComprar(cliqueDoComprador().i as never, "plano-mensal", deps);
    const outra = cliqueDoComprador(canalFalso("300000000000000009"));
    await aoComprar(outra.i as never, "plano-anual", deps);
    expect(outra.create).not.toHaveBeenCalled();
    expect(outra.reply.mock.calls[0]![0].content).toMatch(/já tem um pedido/);
  });

  it("se criar o canal falha, o pedido é cancelado e o cliente recebe aviso", async () => {
    const deps = novasDeps();
    const t = cliqueDoComprador();
    t.create.mockRejectedValueOnce(new Error("Missing Permissions"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await aoComprar(t.i as never, "plano-mensal", deps);
    expect(t.editReply).toHaveBeenCalledWith(expect.stringMatching(/Não consegui abrir/));
    expect(await deps.pedidos.emAbertoDoUsuario(IDS_TESTE.comprador)).toBeUndefined();
  });

  it("Já paguei: pendente avisa; depois de confirmado, marca como pago, avisa no canal e dá o cargo", async () => {
    const deps = novasDeps();
    const t = cliqueDoComprador();
    await aoComprar(t.i as never, "plano-mensal", deps);
    const pedido = (await deps.pedidos.emAbertoDoUsuario(IDS_TESTE.comprador))!;

    const r1 = vi.fn();
    await aoJaPaguei({ ...t.i, reply: r1 } as never, pedido.id, deps);
    expect(r1.mock.calls[0]![0].content).toMatch(/Ainda não recebemos/);

    // o provedor falso confirma; o ouvinte do bot (registrado no index) faria o resto
    deps.provedor.aoPagar((c) => aoPagamentoConfirmado(t.client as never, deps, c));
    const addRole = vi.fn(async () => ({}));
    (t.client.guilds.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ members: { fetch: async () => ({ roles: { add: addRole } }) } });
    const { ehSimulavel } = await import("./pagamento/index.js");
    expect(ehSimulavel(deps.provedor)).toBe(true);
    if (ehSimulavel(deps.provedor)) await deps.provedor.confirmar(pedido.cobrancaId);

    expect((await deps.pedidos.obter(pedido.id))?.status).toBe("pago");
    expect(t.ticket.send).toHaveBeenCalledTimes(2);
    expect(addRole).toHaveBeenCalledWith(IDS_TESTE.cliente);

    // confirmar de novo não repete nada (idempotente)
    await aoPagamentoConfirmado(t.client as never, deps, pedido.cobrancaId);
    expect(t.ticket.send).toHaveBeenCalledTimes(2);
  });

  it("Já paguei por outra pessoa (não equipe) é recusado", async () => {
    const deps = novasDeps();
    const t = cliqueDoComprador();
    await aoComprar(t.i as never, "plano-mensal", deps);
    const pedido = (await deps.pedidos.emAbertoDoUsuario(IDS_TESTE.comprador))!;
    const reply = vi.fn();
    await aoJaPaguei({ user: { id: "999999999999999999" }, member: membro(), reply } as never, pedido.id, deps);
    expect(reply.mock.calls[0]![0].content).toMatch(/Só quem fez o pedido/);
  });

  it("Cancelar antes do pagamento marca cancelado e apaga o canal", async () => {
    const deps = novasDeps();
    const t = cliqueDoComprador();
    await aoComprar(t.i as never, "plano-mensal", deps);
    const pedido = (await deps.pedidos.emAbertoDoUsuario(IDS_TESTE.comprador))!;
    await aoCancelar(t.i as never, pedido.id, deps);
    expect((await deps.pedidos.obter(pedido.id))?.status).toBe("cancelado");
    expect(t.ticket.delete).toHaveBeenCalledOnce();
    expect(await deps.provedor.consultar(pedido.cobrancaId)).toBe("cancelado");
  });
});
