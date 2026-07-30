import { describe, it, expect } from "vitest";
import {
  calculatePixAmounts,
  calculateCardAmounts,
  calculateBoletoAmounts,
} from "../split.utils";

// Helper: garante que todos os campos monetários são inteiros (centavos).
function expectAllIntegers(a: object) {
  for (const [k, v] of Object.entries(a)) {
    expect(Number.isInteger(v), `${k} deve ser inteiro, recebeu ${v}`).toBe(true);
  }
}

// NOTA: os valores esperados aqui usam a fórmula de gross-up (a taxa
// percentual incide sobre o valor TOTAL cobrado do doador, que já inclui
// a própria taxa — não sobre a doação base). Ver o comentário em
// calculatePixAmounts() no split.utils.ts para a explicação completa.

describe("calculatePixAmounts", () => {
  it("R$100,00 → gross-up: fixos + 3,52% sobre o total", () => {
    const a = calculatePixAmounts(10_000);
    // totalAmount = round((10000 + 65) / (1 - 0.0352)) = round(10432.6) = 10432
    // tickettoFee = 10432 - 10000 - 65 = 367
    expect(a).toEqual({
      donationAmount: 10_000,
      tickettoFee: 367,
      pagarmeFee: 40,
      tk2OpFee: 25,
      transacaoFee: 28,
      splitPlatformAmount: 432, // 367 + 40 + 25
      totalAmount: 10_432,
    });
    expectAllIntegers(a);
  });

  it("R$1,00 — taxa fixa domina o valor pequeno", () => {
    const a = calculatePixAmounts(100);
    expect(a.tickettoFee).toBe(6);
    expect(a.splitPlatformAmount).toBe(6 + 40 + 25);
    expect(a.totalAmount).toBe(100 + a.splitPlatformAmount);
  });

  it("R$0,33 — valor bem pequeno", () => {
    const a = calculatePixAmounts(33);
    expect(a.tickettoFee).toBe(4);
  });

  it("R$10.000,00 — valor alto sem perda", () => {
    const a = calculatePixAmounts(1_000_000);
    expect(a.tickettoFee).toBe(36_487);
    expect(a.splitPlatformAmount).toBe(36_487 + 40 + 25);
    expect(a.totalAmount).toBe(1_000_000 + a.splitPlatformAmount);
  });

  it("conservação: total = doação + split plataforma", () => {
    for (const v of [50, 199, 1234, 9999, 50_000]) {
      const a = calculatePixAmounts(v);
      expect(a.totalAmount).toBe(a.donationAmount + a.splitPlatformAmount);
    }
  });

  it("rejeita valores inválidos", () => {
    expect(() => calculatePixAmounts(0)).toThrow();
    expect(() => calculatePixAmounts(-100)).toThrow();
    expect(() => calculatePixAmounts(10.5)).toThrow();
  });
});

describe("calculateCardAmounts", () => {
  it("Master/Visa à vista R$100,00", () => {
    const a = calculateCardAmounts(10_000, 1, "master_visa");
    expect(a).toEqual({
      donationAmount: 10_000,
      tickettoFee: 373,
      pagarmeFee: 0,
      tk2OpFee: 6,
      transacaoFee: 28,
      splitPlatformAmount: 599,
      totalAmount: 10_599,
    });
    expectAllIntegers(a);
  });

  it("Master/Visa 2x usa a mesma tabela do à vista hoje", () => {
    const a1 = calculateCardAmounts(10_000, 1, "master_visa");
    const a2 = calculateCardAmounts(10_000, 2, "master_visa");
    // adquirencia_avista_percent === adquirencia_2x_percent para
    // master_visa em fees.config.ts hoje — o teste confirma que os dois
    // caminhos de código rodam sem diferença inesperada.
    expect(a1.totalAmount).toBe(a2.totalAmount);
  });

  it("Ello/Hiper/Amex à vista R$100,00", () => {
    const a = calculateCardAmounts(10_000, 1, "ello_hiper_amex");
    expect(a).toEqual({
      donationAmount: 10_000,
      tickettoFee: 375,
      pagarmeFee: 0,
      tk2OpFee: 6,
      transacaoFee: 28,
      splitPlatformAmount: 646,
      totalAmount: 10_646,
    });
  });

  it("installments >= 2 sempre usa tabela de parcelado", () => {
    const a3 = calculateCardAmounts(10_000, 3, "master_visa");
    const a12 = calculateCardAmounts(10_000, 12, "master_visa");
    expect(a3.totalAmount).toBe(a12.totalAmount);
  });

  it("R$1,00 — valor pequeno", () => {
    const a = calculateCardAmounts(100, 1, "master_visa");
    expect(a.tickettoFee).toBe(4);
    expectAllIntegers(a);
  });

  it("conservação: total = doação + split plataforma", () => {
    for (const v of [200, 1500, 7777, 33_333]) {
      const a = calculateCardAmounts(v, 1, "master_visa");
      expect(a.totalAmount).toBe(a.donationAmount + a.splitPlatformAmount);
    }
  });

  it("aceita feeRow customizado (override vindo do banco)", () => {
    const customRow = {
      adm_percent: 0.05,
      adquirencia_fixa: null,
      adquirencia_avista_percent: 0.03,
      adquirencia_2x_percent: 0.03,
      tk2_operacional_fixo: null,
      tk2_op_percent: 0.02,
      transacao_fixa: 50,
    };
    const a = calculateCardAmounts(10_000, 1, "master_visa", undefined, customRow);
    const padrao = calculateCardAmounts(10_000, 1, "master_visa");
    // Com taxa maior (5% + 2%*5% + 3%) que o padrão (3,52%+0,0172*3,52%+2,07%),
    // o total cobrado deve ser maior.
    expect(a.totalAmount).toBeGreaterThan(padrao.totalAmount);
  });

  it("rejeita valores inválidos", () => {
    expect(() => calculateCardAmounts(0, 1, "master_visa")).toThrow();
    expect(() => calculateCardAmounts(-1, 1, "master_visa")).toThrow();
  });
});

describe("calculateBoletoAmounts", () => {
  it("R$100,00", () => {
    const a = calculateBoletoAmounts(10_000);
    expect(a).toEqual({
      donationAmount: 10_000,
      tickettoFee: 378,
      pagarmeFee: 100,
      tk2OpFee: 250,
      transacaoFee: 28,
      splitPlatformAmount: 728,
      totalAmount: 10_728,
    });
    expectAllIntegers(a);
  });

  it("conservação: total = doação + split plataforma", () => {
    for (const v of [500, 1234, 50_000, 250_000]) {
      const a = calculateBoletoAmounts(v);
      expect(a.totalAmount).toBe(a.donationAmount + a.splitPlatformAmount);
    }
  });

  it("R$0,50 — as taxas fixas dominam um valor bem pequeno", () => {
    const a = calculateBoletoAmounts(50);
    expect(a.tickettoFee).toBe(15);
  });

  it("aceita override de percentual (taxa de campanha customizada)", () => {
    const padrao = calculateBoletoAmounts(10_000);
    const custom = calculateBoletoAmounts(10_000, 0.10); // 10% em vez de 3,52%
    expect(custom.totalAmount).toBeGreaterThan(padrao.totalAmount);
  });

  it("rejeita valores inválidos", () => {
    expect(() => calculateBoletoAmounts(0)).toThrow();
    expect(() => calculateBoletoAmounts(-1)).toThrow();
  });
});
