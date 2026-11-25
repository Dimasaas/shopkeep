import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type GuildMember,
  type Interaction,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { Config } from "./config.js";
import { NOMES } from "./commands.js";
import { analisarId } from "./ids.js";
import { registrarLog } from "./logs.js";
import type { ProvedorDePagamento } from "./pagamento/index.js";
import type { RepositorioDePedidos } from "./pedidos.js";
import type { Catalogo } from "./produtos.js";
import { aoConfirmarPagamentoFalso, aoEntregar, aoFechar } from "./staff.js";
import { criarCanalDeTicket, ehEquipe } from "./tickets.js";
import { mensagemDoTicket, pagamentoConfirmado, painelLoja, produtoIndisponivel, resumoProduto, textoDeLog } from "./views.js";

export interface Deps {
  config: Config;
  catalogo: Catalogo;
  provedor: ProvedorDePagamento;
  pedidos: RepositorioDePedidos;
}

export const efemero = { flags: MessageFlags.Ephemeral } as const;

/** Menu de produtos: mostra o resumo e o botão Comprar, só para quem clicou. */
export async function aoEscolherProduto(i: StringSelectMenuInteraction, deps: Deps) {
  const produto = deps.catalogo.produtos.find((p) => p.id === i.values[0]);
  if (!produto) return i.reply({ ...produtoIndisponivel(), ...efemero });
  return i.reply({ ...resumoProduto(produto, deps.catalogo.moeda), ...efemero });
}

/** /painel: publica o painel no canal atual. */
export async function aoPublicarPainel(i: ChatInputCommandInteraction, deps: Deps) {
  const canal = i.channel;
  if (!canal || !("send" in canal)) return i.reply({ content: "Use em um canal de texto.", ...efemero });
  await canal.send(painelLoja(deps.catalogo));
  return i.reply({ content: "Painel publicado.", ...efemero });
}

/** Botão Comprar: abre o ticket privado, gera a cobrança e posta tudo no canal novo. */
export async function aoComprar(i: ButtonInteraction, produtoId: string, deps: Deps) {
  const produto = deps.catalogo.produtos.find((p) => p.id === produtoId);
  if (!produto) return i.reply({ ...produtoIndisponivel(), ...efemero });
  if (!i.guild) return i.reply({ content: "Só funciona dentro do servidor.", ...efemero });

  const aberto = await deps.pedidos.emAbertoDoUsuario(i.user.id);
  if (aberto) return i.reply({ content: `Você já tem um pedido em andamento: <#${aberto.canalId}>.`, ...efemero });

  await i.deferReply(efemero);
  // O pedido nasce primeiro (o ID vai no nome/tópico do canal); canal e cobrança completam depois.
  const pedido = await deps.pedidos.criar({ produtoId, usuarioId: i.user.id, canalId: "", cobrancaId: "" });
  let canalId = "";
  try {
    const nome = (i.member as GuildMember | null)?.displayName ?? i.user.username;
    const canal = await criarCanalDeTicket(i.guild, { id: i.user.id, nome }, deps.config, pedido.id);
    canalId = canal.id;
    const cobranca = await deps.provedor.criarCobranca({ pedidoId: pedido.id, descricao: produto.nome, valorCentavos: produto.precoCentavos });
    await deps.pedidos.atualizar(pedido.id, { canalId: canal.id, cobrancaId: cobranca.id });
    await canal.send(
      mensagemDoTicket({ usuarioId: i.user.id, produto, moeda: deps.catalogo.moeda, pedidoId: pedido.id, cobranca, cargoEquipeId: deps.config.cargoEquipeId }),
    );
    await registrarLog(i.client, deps.config, textoDeLog({ Evento: "pedido aberto", Pedido: pedido.id, Produto: produto.nome, Cliente: `<@${i.user.id}>` }));
    return i.editReply(`Seu ticket está pronto: <#${canal.id}>`);
  } catch (e) {
    console.error("[comprar] falhou:", e);
    await deps.pedidos.atualizar(pedido.id, { status: "cancelado" });
    if (canalId) await i.guild.channels.delete(canalId).catch(() => undefined);
    return i.editReply("Não consegui abrir o ticket agora. Tente de novo em instantes ou chame a equipe.");
  }
}

/** Botão Já paguei: confere no provedor. Só o comprador clica. */
export async function aoJaPaguei(i: ButtonInteraction, pedidoId: string, deps: Deps) {
  const pedido = await deps.pedidos.obter(pedidoId);
  if (!pedido) return i.reply({ content: "Pedido não encontrado.", ...efemero });
  if (i.user.id !== pedido.usuarioId && !ehEquipe(i.member as GuildMember | null, deps.config)) return i.reply({ content: "Só quem fez o pedido pode conferir o pagamento.", ...efemero });
  if (pedido.status !== "aguardando") return i.reply({ content: `Este pedido já está **${pedido.status}**.`, ...efemero });
  const status = await deps.provedor.consultar(pedido.cobrancaId);
  if (status === "pago") {
    await aoPagamentoConfirmado(i.client, deps, pedido.cobrancaId);
    return i.reply({ content: "Pagamento confirmado.", ...efemero });
  }
  const texto = status === "pendente" ? "Ainda não recebemos o pagamento. Pode levar alguns instantes." : `A cobrança está **${status}**. Cancele e abra um novo pedido.`;
  return i.reply({ content: texto, ...efemero });
}

/** Botão Cancelar: comprador ou equipe; só enquanto aguarda pagamento. Apaga o ticket. */
export async function aoCancelar(i: ButtonInteraction, pedidoId: string, deps: Deps) {
  const pedido = await deps.pedidos.obter(pedidoId);
  if (!pedido) return i.reply({ content: "Pedido não encontrado.", ...efemero });
  if (i.user.id !== pedido.usuarioId && !ehEquipe(i.member as GuildMember | null, deps.config)) return i.reply({ content: "Só quem fez o pedido ou a equipe pode cancelar.", ...efemero });
  if (pedido.status !== "aguardando") return i.reply({ content: "Só dá para cancelar antes do pagamento. Chame a equipe.", ...efemero });
  await deps.provedor.cancelar(pedido.cobrancaId);
  await deps.pedidos.atualizar(pedido.id, { status: "cancelado" });
  await registrarLog(i.client, deps.config, textoDeLog({ Evento: "pedido cancelado", Pedido: pedido.id, Cliente: `<@${pedido.usuarioId}>` }));
  await i.reply({ content: "Pedido cancelado. Este canal será apagado.", ...efemero });
  await i.channel?.delete("Pedido cancelado").catch(() => undefined);
}

/**
 * Chamado pelo provedor (webhook/timer/consulta) quando um pagamento é confirmado.
 * Idempotente: só age se o pedido ainda estava aguardando.
 */
export async function aoPagamentoConfirmado(client: Client, deps: Deps, cobrancaId: string) {
  const pedido = await deps.pedidos.porCobranca(cobrancaId);
  if (!pedido || pedido.status !== "aguardando") return;
  await deps.pedidos.atualizar(pedido.id, { status: "pago" });
  const canal = await client.channels.fetch(pedido.canalId).catch(() => null);
  if (canal?.isSendable()) await canal.send(pagamentoConfirmado(pedido.id));
  if (deps.config.cargoClienteId) {
    const guild = await client.guilds.fetch(deps.config.guildId).catch(() => null);
    const membro = await guild?.members.fetch(pedido.usuarioId).catch(() => null);
    await membro?.roles.add(deps.config.cargoClienteId).catch((e) => console.error("[cargo] falhou:", e));
  }
  await registrarLog(client, deps.config, textoDeLog({ Evento: "pagamento confirmado", Pedido: pedido.id, Cliente: `<@${pedido.usuarioId}>` }));
}

export function criarRoteador(deps: Deps) {
  return async function aoInteragir(i: Interaction): Promise<void> {
    if (i.isChatInputCommand()) {
      switch (i.commandName) {
        case NOMES.painel:
          return void (await aoPublicarPainel(i, deps));
        case NOMES.entregar:
          return void (await aoEntregar(i, deps));
        case NOMES.fechar:
          return void (await aoFechar(i, deps));
        case NOMES.confirmar:
          return void (await aoConfirmarPagamentoFalso(i, deps));
      }
      return;
    }
    const id = analisarId("customId" in i ? i.customId : "");
    if (!id) return;
    if (i.isStringSelectMenu() && id.acao === "produto") return void (await aoEscolherProduto(i, deps));
    if (i.isButton() && id.valor) {
      if (id.acao === "comprar") return void (await aoComprar(i, id.valor, deps));
      if (id.acao === "paguei") return void (await aoJaPaguei(i, id.valor, deps));
      if (id.acao === "cancelar") return void (await aoCancelar(i, id.valor, deps));
    }
  };
}
