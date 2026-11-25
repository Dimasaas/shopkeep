import { afterEach, describe, expect, it, vi } from "vitest";
import { criarProvedor } from "./index.js";
import { ProvedorFalso } from "./falso.js";

afterEach(() => vi.useRealTimers());

describe("provedor falso", () => {
  it("gera cobrança pendente e confirma uma única vez, avisando os ouvintes", async () => {
    const p = new ProvedorFalso();
    const ouvinte = vi.fn();
    p.aoPagar(ouvinte);
    const c = await p.criarCobranca({ pedidoId: "p1", descricao: "Plano", valorCentavos: 2990 });
    expect(c.codigo).toMatch(/^PAGAMENTO-FALSO-/);
    expect(await p.consultar(c.id)).toBe("pendente");
    expect(await p.confirmar(c.id)).toBe(true);
    expect(await p.confirmar(c.id)).toBe(false);
    expect(await p.consultar(c.id)).toBe("pago");
    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(ouvinte).toHaveBeenCalledWith(c.id);
  });

  it("confirma sozinho depois do tempo configurado", async () => {
    vi.useFakeTimers();
    const p = new ProvedorFalso(5);
    const ouvinte = vi.fn();
    p.aoPagar(ouvinte);
    const c = await p.criarCobranca({ pedidoId: "p1", descricao: "Plano", valorCentavos: 100 });
    await vi.advanceTimersByTimeAsync(4_900);
    expect(ouvinte).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(ouvinte).toHaveBeenCalledOnce();
  });

  it("cobrança cancelada não confirma; vencida vira expirada", async () => {
    vi.useFakeTimers();
    const p = new ProvedorFalso();
    const a = await p.criarCobranca({ pedidoId: "a", descricao: "", valorCentavos: 100 });
    await p.cancelar(a.id);
    expect(await p.confirmar(a.id)).toBe(false);
    const b = await p.criarCobranca({ pedidoId: "b", descricao: "", valorCentavos: 100 });
    vi.setSystemTime(Date.now() + 16 * 60_000);
    expect(await p.consultar(b.id)).toBe("expirado");
    expect(await p.consultar("inexistente")).toBe("cancelado");
  });

  it("fábrica: escolhe pelo nome e recusa provedor desconhecido", () => {
    expect(criarProvedor({ pagamentoProvedor: "falso", pagamentoFalsoAutoSegundos: 0 }).nome).toBe("falso");
    expect(() => criarProvedor({ pagamentoProvedor: "xpto", pagamentoFalsoAutoSegundos: 0 })).toThrow(/desconhecido/);
  });
});
