import { describe, expect, it, vi } from "vitest";
import { canalFalso, clienteFalso, IDS_TESTE, membro, novasDeps } from "../test/helpers.js";
import { aoConfirmarPagamentoFalso, aoEntregar, aoFechar } from "./staff.js";

async function cenario(status: "aguardando" | "pago" = "pago") {
  const deps = novasDeps();
  const ticket = canalFalso();
  const { client, logs } = clienteFalso({ [ticket.id]: ticket });
  const cobranca = await deps.provedor.criarCobranca({ pedidoId: "x", descricao: "d", valorCentavos: 100 });
  const pedido = await deps.pedidos.criar({ produtoId: "plano-mensal", usuarioId: IDS_TESTE.comprador, canalId: ticket.id, cobrancaId: cobranca.id });
  if (status === "pago") await deps.pedidos.atualizar(pedido.id, { status: "pago" });
  const comando = (opcoes: { equipe?: boolean; texto?: string; canalId?: string } = {}) => {
    const reply = vi.fn();
    const editReply = vi.fn();
    return {
      reply,
      editReply,
      i: {
        member: membro({ equipe: opcoes.equipe ?? true, nome: "Atendente" }),
        user: { id: IDS_TESTE.atendente, tag: "atendente#0" },
        channelId: opcoes.canalId ?? ticket.id,
        channel: ticket,
        client,
        reply,
        deferReply: vi.fn(),
        editReply,
        options: { getString: (n: string) => (n === "mensagem" ? (opcoes.texto ?? "Acesso: link-fictício") : "cliente pediu") },
      },
    };
  };
  return { deps, ticket, logs, pedido, comando };
}

describe("comandos da equipe", () => {
  it("/entregar posta a entrega no ticket e marca como entregue", async () => {
    const c = await cenario();
    const cmd = c.comando({ texto: "Chave: ABC-123" });
    await aoEntregar(cmd.i as never, c.deps);
    const msg = c.ticket.send.mock.calls[0]![0] as { embeds: { toJSON(): { title: string; description: string } }[]; allowedMentions: unknown };
    expect(msg.embeds[0]!.toJSON().description).toBe("Chave: ABC-123");
    expect(msg.allowedMentions).toEqual({ parse: [] });
    expect((await c.deps.pedidos.obter(c.pedido.id))?.status).toBe("entregue");
    expect(c.logs.send).toHaveBeenCalledOnce();
  });

  it("/entregar recusa quem não é equipe, canal que não é ticket, pedido sem pagamento e entrega repetida", async () => {
    const c = await cenario();
    const naoEquipe = c.comando({ equipe: false });
    await aoEntregar(naoEquipe.i as never, c.deps);
    expect(naoEquipe.reply.mock.calls[0]![0].content).toMatch(/Só a equipe/);

    const fora = c.comando({ canalId: "123" });
    await aoEntregar(fora.i as never, c.deps);
    expect(fora.reply.mock.calls[0]![0].content).toMatch(/canal de ticket/);

    const aguardando = await cenario("aguardando");
    const a = aguardando.comando();
    await aoEntregar(a.i as never, aguardando.deps);
    expect(a.reply.mock.calls[0]![0].content).toMatch(/aguardando/);
    expect(aguardando.ticket.send).not.toHaveBeenCalled();

    await aoEntregar(c.comando().i as never, c.deps);
    const de_novo = c.comando();
    await aoEntregar(de_novo.i as never, c.deps);
    expect(de_novo.reply.mock.calls[0]![0].content).toMatch(/já foi entregue/);
  });

  it("/fechar registra o motivo no log e apaga o canal; pedido aguardando é cancelado", async () => {
    const c = await cenario("aguardando");
    const cmd = c.comando();
    await aoFechar(cmd.i as never, c.deps);
    expect(c.ticket.delete).toHaveBeenCalledOnce();
    expect((c.logs.send.mock.calls[0]![0] as { content: string }).content).toContain("cliente pediu");
    expect((await c.deps.pedidos.obter(c.pedido.id))?.status).toBe("cancelado");
    expect(await c.deps.provedor.consultar(c.pedido.cobrancaId)).toBe("cancelado");
  });

  it("/fechar não apaga nada se quem chamou não é equipe", async () => {
    const c = await cenario();
    await aoFechar(c.comando({ equipe: false }).i as never, c.deps);
    expect(c.ticket.delete).not.toHaveBeenCalled();
  });

  it("/confirmar aprova o pagamento falso pendente uma única vez", async () => {
    const c = await cenario("aguardando");
    const ouvinte = vi.fn();
    c.deps.provedor.aoPagar(ouvinte);
    const um = c.comando();
    await aoConfirmarPagamentoFalso(um.i as never, c.deps);
    expect(um.reply.mock.calls[0]![0].content).toMatch(/confirmado/);
    const dois = c.comando();
    await aoConfirmarPagamentoFalso(dois.i as never, c.deps);
    expect(dois.reply.mock.calls[0]![0].content).toMatch(/Nada a confirmar/);
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });
});
