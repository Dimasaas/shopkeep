import { describe, expect, it } from "vitest";
import { carregarConfig } from "./config.js";

const base = { DISCORD_TOKEN: "token-de-teste", DISCORD_APP_ID: "111111111111111111", DISCORD_GUILD_ID: "222222222222222222" };
const completo = { ...base, CATEGORIA_TICKETS_ID: "333333333333333333", CANAL_PAINEL_ID: "444444444444444444", CARGO_EQUIPE_ID: "555555555555555555" };

describe("carregarConfig", () => {
  it("aceita o ambiente completo e aplica os padrões", () => {
    const c = carregarConfig(completo);
    expect(c.pagamentoProvedor).toBe("falso");
    expect(c.pagamentoFalsoAutoSegundos).toBe(0);
    expect(c.canalLogsId).toBeUndefined();
  });

  it("lista tudo o que falta de uma vez", () => {
    expect(() => carregarConfig({})).toThrow(/DISCORD_TOKEN[\s\S]*CARGO_EQUIPE_ID/);
  });

  it("para o /setup só exige token, app e servidor", () => {
    expect(carregarConfig(base, { exigirSetup: false }).guildId).toBe("222222222222222222");
  });

  it("recusa ID que não é snowflake e tempo negativo", () => {
    expect(() => carregarConfig({ ...completo, CARGO_EQUIPE_ID: "abc" })).toThrow(/CARGO_EQUIPE_ID/);
    expect(() => carregarConfig({ ...completo, PAGAMENTO_FALSO_AUTO_SEGUNDOS: "-1" })).toThrow(/AUTO_SEGUNDOS/);
  });
});
