import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { IDS } from "./ids.js";
import { formatarPreco, type Catalogo, type Produto } from "./produtos.js";

// Views = funções puras que devolvem o payload da mensagem. Fáceis de testar, sem cliente do Discord.

export const COR = { marca: 0x7c4dff, ok: 0x2ecc71, aviso: 0xf1c40f } as const;

export interface Payload {
  embeds?: EmbedBuilder[];
  components?: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
  content?: string;
}

export function painelLoja(catalogo: Catalogo, nomeLoja = "Shopkeep"): Payload {
  const embed = new EmbedBuilder()
    .setColor(COR.marca)
    .setTitle(`🛒 ${nomeLoja}`)
    .setDescription("Escolha um produto no menu abaixo para ver os detalhes e comprar.")
    .addFields(
      catalogo.produtos.map((p) => ({
        name: `${p.emoji ?? "•"} ${p.nome}`,
        value: `${p.descricao}\n**${formatarPreco(p.precoCentavos, catalogo.moeda)}**`,
        inline: true,
      })),
    )
    .setFooter({ text: "O pagamento acontece num ticket privado." });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(IDS.selectProduto)
    .setPlaceholder("Selecione um produto")
    .addOptions(
      catalogo.produtos.map((p) => ({
        label: p.nome.slice(0, 100),
        value: p.id,
        description: `${formatarPreco(p.precoCentavos, catalogo.moeda)} · ${p.descricao}`.slice(0, 100),
        ...(p.emoji ? { emoji: p.emoji } : {}),
      })),
    );
  return { embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
}

export function resumoProduto(p: Produto, moeda: string): Payload {
  const embed = new EmbedBuilder()
    .setColor(COR.marca)
    .setTitle(`${p.emoji ?? "🛍️"} ${p.nome}`)
    .setDescription(p.descricao)
    .addFields({ name: "Preço", value: formatarPreco(p.precoCentavos, moeda), inline: true });
  const comprar = new ButtonBuilder().setCustomId(IDS.comprar(p.id)).setLabel("Comprar").setEmoji("🛒").setStyle(ButtonStyle.Success);
  return { embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(comprar)] };
}

export function produtoIndisponivel(): { content: string } {
  return { content: "Esse produto saiu da loja. Abra o painel de novo para ver a lista atual." };
}

export function mensagemDoTicket(opcoes: {
  usuarioId: string;
  produto: Produto;
  moeda: string;
  pedidoId: string;
  cobranca: { codigo: string; expiraEm: Date };
  cargoEquipeId: string;
}): Payload & { allowedMentions: { users: string[]; roles: string[] } } {
  const unix = Math.floor(opcoes.cobranca.expiraEm.getTime() / 1000);
  const embed = new EmbedBuilder()
    .setColor(COR.aviso)
    .setTitle(`Pedido #${opcoes.pedidoId} · aguardando pagamento`)
    .addFields(
      { name: "Produto", value: opcoes.produto.nome, inline: true },
      { name: "Valor", value: formatarPreco(opcoes.produto.precoCentavos, opcoes.moeda), inline: true },
      { name: "Expira", value: `<t:${unix}:R>`, inline: true },
      { name: "Código de pagamento", value: `\`\`\`${opcoes.cobranca.codigo}\`\`\`` },
    )
    .setFooter({ text: "Depois de pagar, clique em Já paguei. A equipe entrega por aqui." });
  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IDS.jaPaguei(opcoes.pedidoId)).setLabel("Já paguei").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(IDS.cancelar(opcoes.pedidoId)).setLabel("Cancelar pedido").setStyle(ButtonStyle.Danger),
  );
  return {
    content: `<@${opcoes.usuarioId}> <@&${opcoes.cargoEquipeId}>`,
    embeds: [embed],
    components: [botoes],
    allowedMentions: { users: [opcoes.usuarioId], roles: [opcoes.cargoEquipeId] },
  };
}

export function pagamentoConfirmado(pedidoId: string): Payload {
  const embed = new EmbedBuilder()
    .setColor(COR.ok)
    .setTitle(`Pagamento confirmado · pedido #${pedidoId}`)
    .setDescription("Recebido. A equipe vai fazer a entrega neste canal em instantes.");
  return { embeds: [embed] };
}

export function entregaDoPedido(opcoes: { pedidoId: string; produto: string; mensagem: string; equipeNome: string }): Payload {
  const embed = new EmbedBuilder()
    .setColor(COR.ok)
    .setTitle(`📦 Pedido #${opcoes.pedidoId} entregue`)
    .setDescription(opcoes.mensagem.slice(0, 4000))
    .addFields({ name: "Produto", value: opcoes.produto, inline: true }, { name: "Entregue por", value: opcoes.equipeNome, inline: true })
    .setFooter({ text: "Qualquer dúvida, responda neste canal. A equipe fecha o ticket depois." });
  return { embeds: [embed] };
}

export function textoDeLog(linhas: Record<string, string>): string {
  return Object.entries(linhas).map(([k, v]) => `**${k}:** ${v}`).join("\n");
}
