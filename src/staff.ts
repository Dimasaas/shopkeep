import { MessageFlags, type ChatInputCommandInteraction, type GuildMember, type TextChannel } from "discord.js";
import type { Deps } from "./handlers.js";
import { registrarLog } from "./logs.js";
import { ehSimulavel } from "./pagamento/index.js";
import { ehEquipe } from "./tickets.js";
import { entregaDoPedido, textoDeLog } from "./views.js";

const efemero = { flags: MessageFlags.Ephemeral } as const;

/** Barreira comum dos comandos da equipe: é equipe e está num canal de ticket. */
async function ticketDaEquipe(i: ChatInputCommandInteraction, deps: Deps) {
  if (!ehEquipe(i.member as GuildMember | null, deps.config)) {
    await i.reply({ content: "Só a equipe usa este comando.", ...efemero });
    return null;
  }
  const pedido = await deps.pedidos.porCanal(i.channelId);
  if (!pedido) {
    await i.reply({ content: "Use dentro de um canal de ticket.", ...efemero });
    return null;
  }
  return pedido;
}

/** /entregar: só com pagamento confirmado. Posta a entrega no ticket e marca o pedido como entregue. */
export async function aoEntregar(i: ChatInputCommandInteraction, deps: Deps) {
  const pedido = await ticketDaEquipe(i, deps);
  if (!pedido) return;
  if (pedido.status === "entregue") return i.reply({ content: "Este pedido já foi entregue.", ...efemero });
  if (pedido.status !== "pago") return i.reply({ content: `Não dá para entregar: o pedido está **${pedido.status}**.`, ...efemero });

  const produto = deps.catalogo.produtos.find((p) => p.id === pedido.produtoId);
  const equipeNome = (i.member as GuildMember | null)?.displayName ?? i.user.username;
  await i.deferReply(efemero);
  await (i.channel as TextChannel).send({
    ...entregaDoPedido({ pedidoId: pedido.id, produto: produto?.nome ?? pedido.produtoId, mensagem: i.options.getString("mensagem", true), equipeNome }),
    allowedMentions: { parse: [] },
  });
  await deps.pedidos.atualizar(pedido.id, { status: "entregue" });
  await registrarLog(i.client, deps.config, textoDeLog({ Evento: "pedido entregue", Pedido: pedido.id, Por: `<@${i.user.id}>` }));
  return i.editReply("Entrega registrada no ticket.");
}

/** /fechar: registra no log e apaga o canal. Pedido ainda aguardando é cancelado junto. */
export async function aoFechar(i: ChatInputCommandInteraction, deps: Deps) {
  const pedido = await ticketDaEquipe(i, deps);
  if (!pedido) return;
  const motivo = i.options.getString("motivo") ?? "sem motivo informado";
  if (pedido.status === "aguardando") {
    await deps.provedor.cancelar(pedido.cobrancaId);
    await deps.pedidos.atualizar(pedido.id, { status: "cancelado" });
  }
  await registrarLog(i.client, deps.config, textoDeLog({ Evento: "ticket fechado", Pedido: pedido.id, Por: `<@${i.user.id}>`, Motivo: motivo }));
  await i.reply({ content: "Fechando o ticket...", ...efemero });
  await i.channel!.delete(`Ticket fechado por ${i.user.tag}: ${motivo}`);
}

/** /confirmar (dev): simula a aprovação do pagamento no provedor falso. */
export async function aoConfirmarPagamentoFalso(i: ChatInputCommandInteraction, deps: Deps) {
  const pedido = await ticketDaEquipe(i, deps);
  if (!pedido) return;
  if (!ehSimulavel(deps.provedor)) return i.reply({ content: "O provedor atual não permite simular pagamento.", ...efemero });
  const ok = await deps.provedor.confirmar(pedido.cobrancaId);
  return i.reply({ content: ok ? "Pagamento falso confirmado." : "Nada a confirmar: a cobrança não está pendente.", ...efemero });
}
