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

export function painelLoja(catalogo: Catalogo, nomeLoja = "Loja"): Payload {
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
