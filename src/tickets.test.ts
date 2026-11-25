import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { IDS_TESTE, membro, novasDeps } from "../test/helpers.js";
import { ehEquipe, nomeDoCanal, permissoesDoTicket } from "./tickets.js";

describe("tickets", () => {
  it("nome do canal: sem acento, minúsculo, só a-z/0-9/hífen", () => {
    expect(nomeDoCanal("José da Conceição!")).toBe("ticket-jose-da-conceicao");
    expect(nomeDoCanal("😀😀")).toBe("ticket-cliente");
    expect(nomeDoCanal("x".repeat(200)).length).toBeLessThanOrEqual(87);
  });

  it("permissões: @everyone barrado; comprador, equipe e bot liberados", () => {
    const p = permissoesDoTicket({ guildId: IDS_TESTE.guild, usuarioId: IDS_TESTE.comprador, cargoEquipeId: IDS_TESTE.equipe, botId: IDS_TESTE.bot });
    const por = (id: string) => p.find((o) => o.id === id)!;
    expect(por(IDS_TESTE.guild).deny).toEqual([PermissionFlagsBits.ViewChannel]);
    expect(por(IDS_TESTE.guild).allow).toBeUndefined();
    expect(por(IDS_TESTE.comprador).allow).toContain(PermissionFlagsBits.SendMessages);
    expect(por(IDS_TESTE.equipe).allow).toContain(PermissionFlagsBits.ManageMessages);
    expect(por(IDS_TESTE.bot).allow).toContain(PermissionFlagsBits.ManageChannels);
  });

  it("equipe = cargo configurado ou ManageGuild", () => {
    const { config } = novasDeps();
    expect(ehEquipe(membro({ equipe: true }) as never, config)).toBe(true);
    expect(ehEquipe(membro() as never, config)).toBe(false);
    expect(ehEquipe({ ...membro(), permissions: { has: () => true } } as never, config)).toBe(true);
    expect(ehEquipe(null, config)).toBe(false);
  });
});
