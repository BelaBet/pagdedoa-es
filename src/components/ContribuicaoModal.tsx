import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Loader2, Lock, Star, X, QrCode, CheckCircle2 } from "lucide-react";
import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import { useServerFn } from "@tanstack/react-start";
import { useTenant } from "@/lib/tenant-context";
import { createBoletoPayment } from "@/lib/boleto.functions";
import { createPixPayment, createCreditCardPayment, pollPixCharge } from "@/lib/payments.functions";
import { calculateAmounts } from "@/lib/split.utils";

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type ContribMethod = {
  key: "pix" | "boleto" | "fatura" | "mais" | "custom";
  label: string;
};

export type CostCenterOption = {
  id: string;
  name: string;
  slug: string;
  allows_installments: boolean;
  max_installments: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (valor: number) => void;
  method?: ContribMethod;
  costCenter?: CostCenterOption | null;
};

const PRESETS = [10, 25, 50, 100, 200];

const METHOD_COPY: Record<ContribMethod["key"], { title: string; subtitle: string; cta: string }> =
  {
    pix: {
      title: "Contribuir via Pix",
      subtitle: "Sua contribuição é processada com segurança. Não é necessário criar conta.",
      cta: "Gerar QR Code PIX",
    },
    boleto: {
      title: "Gerar Boleto",
      subtitle: "Preencha seus dados para emissão do comprovante. Não é necessário criar conta.",
      cta: "Gerar boleto",
    },
    fatura: {
      title: "Contribuir com Cartão",
      subtitle: "Preencha seus dados para emissão do comprovante. Não é necessário criar conta.",
      cta: "Confirmar doação",
    },
    mais: {
      title: "Escolher forma de pagamento",
      subtitle: "Qual valor você quer contribuir?",
      cta: "Continuar",
    },
    custom: { title: "Contribuir", subtitle: "Qual valor você quer contribuir?", cta: "Continuar" },
  };

function generateBoletoCode(valor: number) {
  // mock formatted "linha digitável" 47-digit boleto
  const cents = String(Math.round(valor * 100)).padStart(10, "0");
  const rnd = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
  return `${rnd(5)}.${rnd(5)} ${rnd(5)}.${rnd(6)} ${rnd(5)}.${rnd(6)} ${rnd(1)} ${rnd(4)}${cents}`;
}

import Holidays from "date-holidays";

const holidaysCache = new Map<string, Holidays>();
function getHolidays(country: string, state?: string) {
  const key = `${country}:${state ?? ""}`;
  let h = holidaysCache.get(key);
  if (!h) {
    h = state ? new Holidays(country, state) : new Holidays(country);
    holidaysCache.set(key, h);
  }
  return h;
}

function isHoliday(date: Date, country: string, state?: string) {
  const hits = getHolidays(country, state).isHoliday(date);
  if (!hits) return false;
  // Only count public/bank holidays — ignore observance / optional
  const list = Array.isArray(hits) ? hits : [hits];
  return list.some((h) => h.type === "public" || h.type === "bank");
}

function addBusinessDays(date: Date, days: number, country = "BR", state?: string) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day === 0 || day === 6) continue;
    if (isHoliday(d, country, state)) continue;
    added++;
  }
  return d;
}

function formatCPF(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  // CNPJ: 00.000.000/0000-00
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function isValidCPF(raw: string) {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

function isValidCNPJ(raw: string) {
  const cnpj = raw.replace(/\D/g, "");
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const weights =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

function isValidDoc(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return isValidCPF(d);
  if (d.length === 14) return isValidCNPJ(d);
  return false;
}

export function ContribuicaoModal({ isOpen, onClose, onConfirm, method, costCenter }: Props) {
  const { tenant } = useTenant();
  const createBoleto = useServerFn(createBoletoPayment);
  const createPix = useServerFn(createPixPayment);
  const pollPix = useServerFn(pollPixCharge);
  const createCard = useServerFn(createCreditCardPayment);
  const [selected, setSelected] = useState<number | "custom">(25);
  const [value, setValue] = useState<string>("25");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [payerCpf, setPayerCpf] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  // Card-only fields
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardExp, setCardExp] = useState(""); // MM/AA
  const [cardCvv, setCardCvv] = useState("");
  const [installments, setInstallments] = useState(1);
  const [addrLine, setAddrLine] = useState("");
  const [addrZip, setAddrZip] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrState, setAddrState] = useState("");
  // Endereço do pagador (boleto)
  const [boletoAddrLine, setBoletoAddrLine] = useState("");
  const [boletoAddrZip, setBoletoAddrZip] = useState("");
  const [boletoAddrCity, setBoletoAddrCity] = useState("");
  const [boletoAddrState, setBoletoAddrState] = useState("");
  const [boletoAddrNeighborhood, setBoletoAddrNeighborhood] = useState("");

  const [boleto, setBoleto] = useState<{
    code: string;
    due: Date;
    valor: number;
    paymentId?: string;
    donationId?: string;
    pdfUrl?: string;
  } | null>(null);
  const [pix, setPix] = useState<{
    code: string;
    qrUrl: string;
    valor: number;
    expiresAt: Date;
    paymentId?: string;
    gatewayId?: string;
    status?: "pending" | "paid" | "failed";
    waiting?: boolean;
  } | null>(null);
  const [cardResult, setCardResult] = useState<{
    status: "pending" | "confirmed" | "failed";
    valor: number;
    paymentId?: string;
    message?: string | null;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const copy = METHOD_COPY[method?.key ?? "custom"];
  const isBoleto = method?.key === "boleto";
  const isPix = method?.key === "pix";
  const isCard = method?.key === "fatura";
  const needsPayer = isBoleto || isPix || isCard;

  useEffect(() => {
    if (isOpen) {
      setSelected(25);
      setValue("25");
      setPayerName("");
      setPayerEmail("");
      setPayerCpf("");
      setPayerPhone("");
      setCardNumber("");
      setCardHolder("");
      setCardExp("");
      setCardCvv("");
      setInstallments(1);
      setAddrLine("");
      setAddrZip("");
      setAddrCity("");
      setAddrState("");
      setBoletoAddrLine("");
      setBoletoAddrZip("");
      setBoletoAddrCity("");
      setBoletoAddrState("");
      setBoletoAddrNeighborhood("");
      setBoleto(null);
      setPix(null);
      setCardResult(null);
      setCopied(false);
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  // Polling do PIX: quando temos gatewayId e ainda falta o QR Code (ou status pendente),
  // consultamos a Pagar.me a cada 3s até obter o código ou confirmação de pagamento.
  useEffect(() => {
    if (!pix?.gatewayId) return;
    if (pix.status && pix.status !== "pending") return;
    if (pix.code && !pix.waiting) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40; // ~2 minutos

    const tick = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const r = await pollPix({ data: { gatewayId: pix.gatewayId! } });
        if (cancelled) return;
        const paid = r.chargeStatus === "paid";
        const failed = r.chargeStatus === "failed" || r.chargeStatus === "refused";
        setPix((prev) =>
          prev
            ? {
                ...prev,
                code: r.qrCode || prev.code,
                qrUrl: r.qrCodeUrl || prev.qrUrl,
                expiresAt: r.expiresAt ? new Date(r.expiresAt) : prev.expiresAt,
                waiting: !r.qrCode && !paid,
                status: paid ? "paid" : failed ? "failed" : "pending",
              }
            : prev,
        );
        if (paid || failed) return;
      } catch {
        /* tenta de novo */
      }
      if (attempts < maxAttempts && !cancelled) {
        setTimeout(tick, 3000);
      }
    };

    const t = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pix?.gatewayId, pix?.code, pix?.waiting, pix?.status, pollPix]);

  if (!isOpen) return null;

  const pickPreset = (v: number) => {
    setSelected(v);
    setValue(String(v));
  };

  const pickCustom = () => {
    setSelected("custom");
    setValue("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleInput = (raw: string) => {
    const cleaned = raw.replace(/[^\d]/g, "");
    setValue(cleaned);
    const num = Number(cleaned);
    setSelected(PRESETS.includes(num) ? num : "custom");
  };

  const validatePayer = (): { name: string; email: string; cpf: string; phone: string } | null => {
    const name = payerName.trim();
    const email = payerEmail.trim();
    const cpfDigits = payerCpf.replace(/\D/g, "");
    const phoneDigits = payerPhone.replace(/\D/g, "");

    if (!name) {
      setError("Informe seu nome");
      return null;
    }
    if (!email) {
      setError("Informe seu e-mail");
      return null;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Informe um e-mail válido.");
      return null;
    }
    if (!cpfDigits) {
      setError("Informe seu CPF ou CNPJ");
      return null;
    }
    if (cpfDigits.length !== 11 && cpfDigits.length !== 14) {
      setError("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)");
      return null;
    }
    if (cpfDigits.length === 11 && !isValidCPF(cpfDigits)) {
      setError("CPF inválido. Verifique os números e tente novamente");
      return null;
    }
    if (cpfDigits.length === 14 && !isValidCNPJ(cpfDigits)) {
      setError("CNPJ inválido. Verifique os números e tente novamente");
      return null;
    }
    if (!phoneDigits) {
      setError("Informe seu celular");
      return null;
    }
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      setError("Informe um celular válido com DDD.");
      return null;
    }
    return { name, email, cpf: cpfDigits, phone: phoneDigits };
  };

  const handleConfirm = async (override?: number) => {
    const num = override ?? Number(value);
    if (!num || num <= 0) return;
    if (!needsPayer) {
      onConfirm?.(num);
      onClose();
      return;
    }
    if (!tenant?.id) {
      setError("Não foi possível identificar a instituição.");
      return;
    }
    const payer = validatePayer();
    if (!payer) return;

    setSubmitting(true);
    setError(null);
    try {
      if (isBoleto) {
        const addrLineTrim = boletoAddrLine.trim();
        const addrZipDigits = boletoAddrZip.replace(/\D/g, "");
        const addrCityTrim = boletoAddrCity.trim();
        const addrStateTrim = boletoAddrState.trim().toUpperCase();
        if (addrLineTrim.length < 3) {
          setError("Informe a rua e número (mín. 3 caracteres).");
          setSubmitting(false);
          return;
        }
        if (addrZipDigits.length !== 8) {
          setError("Informe um CEP válido com 8 dígitos.");
          setSubmitting(false);
          return;
        }
        if (addrCityTrim.length < 2) {
          setError("Informe a cidade.");
          setSubmitting(false);
          return;
        }
        if (!/^[A-Z]{2}$/.test(addrStateTrim)) {
          setError("Informe a UF com 2 letras (ex.: SP).");
          setSubmitting(false);
          return;
        }
        const result = await createBoleto({
          data: {
            tenantId: tenant.id,
            donationAmount: Math.round(num * 100),
            customerName: payer.name,
            customerEmail: payer.email,
            customerDocument: payer.cpf,
            customerPhone: payer.phone,
            customerAddressLine1: addrLineTrim,
            customerAddressZip: addrZipDigits,
            customerAddressCity: addrCityTrim,
            customerAddressState: addrStateTrim,
            customerAddressNeighborhood: boletoAddrNeighborhood.trim() || undefined,
          },
        });
        const due = result.dueAt ? new Date(result.dueAt) : addBusinessDays(new Date(), 3);
        setBoleto({
          code: result.line || generateBoletoCode(num),
          due,
          valor: num,
          paymentId: result.paymentId,
          donationId: result.donationId,
          pdfUrl: result.pdfUrl,
        });
      } else if (isPix) {
        const result = await createPix({
          data: {
            tenantId: tenant.id,
            donationAmount: Math.round(num * 100),
            ...(costCenter?.id ? { costCenterId: costCenter.id } : {}),
            ...(payer.name ? { customerName: payer.name } : {}),
            ...(payer.email ? { customerEmail: payer.email } : {}),
            ...(payer.cpf ? { customerDocument: payer.cpf } : {}),
            ...(payer.phone ? { customerPhone: payer.phone } : {}),
          },
        });

        console.log("[pix] createPix result", result);
        if (!result.gatewayId) throw new Error("Pagar.me não retornou identificador do pedido.");
        setPix({
          code: result.qrCode || "",
          qrUrl: result.qrCodeUrl || "",
          valor: (result.totalAmount ?? Math.round(num * 100)) / 100,
          expiresAt: new Date(result.expiresAt || Date.now() + 60 * 60 * 1000),
          paymentId: result.paymentId,
          gatewayId: result.gatewayId,
          status: "pending",
          waiting: !result.qrCode,
        });
      } else if (isCard) {
        // Validate card
        const digits = cardNumber.replace(/\s/g, "");
        if (digits.length < 13) return setError("Número de cartão inválido.");
        if (cardHolder.trim().length < 2) return setError("Informe o nome impresso no cartão.");
        const [mm, yy] = cardExp.split("/").map((s) => s?.trim());
        const expMonth = Number(mm);
        const expYear = yy?.length === 2 ? 2000 + Number(yy) : Number(yy);
        if (!expMonth || expMonth < 1 || expMonth > 12)
          return setError("Validade inválida (MM/AA).");
        if (!expYear || expYear < new Date().getFullYear())
          return setError("Validade inválida (MM/AA).");
        if (cardCvv.length < 3) return setError("CVV inválido.");
        if (addrLine.trim().length < 3) return setError("Informe o endereço de cobrança.");
        if (addrZip.replace(/\D/g, "").length !== 8) return setError("CEP inválido.");
        if (addrCity.trim().length < 2) return setError("Informe a cidade.");
        if (addrState.trim().length !== 2) return setError("UF inválida (2 letras).");

        const allowsInst = costCenter ? costCenter.allows_installments : true;
        const maxInst = costCenter ? Math.max(1, Math.min(2, costCenter.max_installments)) : 2;
        const effInstallments = allowsInst ? Math.min(installments, maxInst) : 1;
        const detectedBrand = detectCardBrand(cardNumber);
        const brand: "master_visa" | "ello_hiper_amex" =
          detectedBrand === "elo" || detectedBrand === "hiper" || detectedBrand === "amex"
            ? "ello_hiper_amex"
            : "master_visa";
        const result = await createCard({
          data: {
            tenantId: tenant.id,
            donationAmount: Math.round(num * 100),
            installments: effInstallments,
            brand,
            ...(costCenter?.id ? { costCenterId: costCenter.id } : {}),
            customerName: payer.name,
            customerEmail: payer.email,
            customerDocument: payer.cpf,
            customerPhone: payer.phone,
            card: {
              number: digits,
              holderName: cardHolder.trim(),
              expMonth,
              expYear,
              cvv: cardCvv,
            },
            billingAddress: {
              line1: addrLine.trim(),
              zipCode: addrZip,
              city: addrCity.trim(),
              state: addrState.trim().toUpperCase(),
              country: "BR",
            },
          },
        });
        setCardResult({
          status: result.status,
          valor: num,
          paymentId: result.paymentId,
          message: result.acquirerMessage,
        });
      }
      onConfirm?.(num);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao processar pagamento");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!boleto) return;
    try {
      await navigator.clipboard.writeText(boleto.code.replace(/\s|\./g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  const handleDownloadPdf = () => {
    if (!boleto) return;
    if (boleto.pdfUrl) {
      window.open(boleto.pdfUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const beneficiario = tenant?.name ?? "Beneficiário";
    const valorFmt = `R$ ${boleto.valor.toFixed(2).replace(".", ",")}`;
    const venc = boleto.due.toLocaleDateString("pt-BR");
    const docNum = `${Date.now()}`.slice(-9);
    const nossoNum = `${Date.now()}`.slice(-11);
    const linha = boleto.code;
    // 44-digit barcode (mock derived from linha digitável)
    const barcode = linha.replace(/[^\d]/g, "").slice(0, 44).padEnd(44, "0");

    // Render barcode (Interleaved 2 of 5 — padrão FEBRABAN)
    const canvas = document.createElement("canvas");
    try {
      JsBarcode(canvas, barcode, {
        format: "ITF",
        width: 1.2,
        height: 50,
        displayValue: false,
        margin: 0,
      });
    } catch {
      /* fallback: blank canvas */
    }
    const barcodeDataUrl = canvas.toDataURL("image/png");

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210;
    let y = 12;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("BOLETO DE CONTRIBUIÇÃO", W / 2, y, { align: "center" });
    y += 4;
    doc.setLineWidth(0.3);
    doc.line(10, y, W - 10, y);
    y += 6;

    // Beneficiário / Cedente
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("BENEFICIÁRIO (CEDENTE)", 12, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(beneficiario, 12, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    if (tenant?.slug) doc.text(`Identificador: ${tenant.slug}`, 12, y + 10);
    y += 16;

    doc.setDrawColor(180);
    doc.line(10, y, W - 10, y);
    y += 5;

    // Pagador
    doc.setFontSize(8);
    doc.text("PAGADOR", 12, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Contribuinte", 12, y + 5);
    doc.setFont("helvetica", "normal");
    y += 12;

    doc.line(10, y, W - 10, y);
    y += 5;

    // Grid: vencimento / valor / doc / nosso número
    const col = (x: number, label: string, val: string, bold = false) => {
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(label, x, y);
      doc.setFontSize(bold ? 12 : 10);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.text(val, x, y + 5);
    };
    col(12, "VENCIMENTO", venc, true);
    col(70, "VALOR DO DOCUMENTO", valorFmt, true);
    col(130, "Nº DOCUMENTO", docNum);
    col(170, "NOSSO NÚMERO", nossoNum);
    y += 12;

    doc.setDrawColor(180);
    doc.line(10, y, W - 10, y);
    y += 5;

    // Linha digitável
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("LINHA DIGITÁVEL", 12, y);
    doc.setFont("courier", "bold");
    doc.setFontSize(11);
    doc.text(linha, W / 2, y + 6, { align: "center" });
    y += 12;

    // Instruções
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("INSTRUÇÕES", 12, y);
    y += 4;
    doc.setFontSize(9);
    const instr = [
      `• Válido por 3 dias úteis. Vencimento em ${venc}.`,
      "• Pagável em qualquer banco, app bancário ou casa lotérica até o vencimento.",
      "• Após o vencimento, o boleto perde a validade — gere um novo na plataforma.",
      "• Em caso de dúvidas, entre em contato com o beneficiário.",
    ];
    instr.forEach((line) => {
      doc.text(line, 12, y);
      y += 5;
    });
    y += 4;

    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(10, y, W - 10, y);
    y += 6;

    // Código de barras
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("CÓDIGO DE BARRAS", 12, y);
    y += 2;
    if (barcodeDataUrl) {
      doc.addImage(barcodeDataUrl, "PNG", 12, y, 110, 18);
    }
    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    doc.text(barcode, 12, y + 22);

    // Footer
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(`Documento gerado em ${new Date().toLocaleString("pt-BR")}`, W / 2, 285, {
      align: "center",
    });

    // Gera blob e abre em nova aba (funciona em iframe e Safari iOS,
    // onde doc.save() é bloqueado silenciosamente).
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      // Pop-up bloqueado: força download via link
      const a = document.createElement("a");
      a.href = url;
      a.download = `boleto-${docNum}.pdf`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 p-3 sm:items-center sm:p-4"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="relative my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-8"
        style={{ zIndex: 10000, maxHeight: "calc(100dvh - 1.5rem)", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">
          Centro de Doações
        </div>

        {pix ? (
          <>
            {pix.status === "paid" ? (
              <div className="mt-1 flex flex-col items-center text-center">
                <CheckCircle2 className="h-14 w-14 text-emerald-500" />
                <h2 className="mt-3 text-[24px] font-bold text-[#111827]">Pagamento confirmado</h2>
                <p className="mt-1 text-sm text-[#6B7280]">
                  Recebemos sua contribuição de R$ {pix.valor.toFixed(2).replace(".", ",")}.
                </p>
                <button
                  onClick={onClose}
                  className="mt-6 flex h-[48px] w-full items-center justify-center rounded-full bg-[#7C3AED] text-sm font-semibold text-white hover:bg-[#6D28D9]"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <>
                <h2 className="mt-1 text-[24px] font-bold leading-tight text-[#111827]">
                  {pix.waiting ? "Gerando seu PIX…" : "PIX gerado"}
                </h2>
                <p className="mt-1 text-sm text-[#6B7280]">
                  {pix.waiting
                    ? "Aguardando a Pagar.me liberar o QR Code. Isso costuma levar alguns segundos."
                    : "Abra o app do seu banco, escolha pagar com PIX e escaneie o QR Code ou cole o código."}
                </p>

                <div className="mt-5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                    Expira em
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-[#111827]">
                    {pix.expiresAt.toLocaleString("pt-BR")}
                  </div>
                </div>

                {pix.waiting ? (
                  <div className="mt-4 flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]">
                    <Loader2 className="h-8 w-8 animate-spin text-[#7C3AED]" />
                    <p className="text-xs">Aguardando confirmação da Pagar.me…</p>
                  </div>
                ) : pix.qrUrl ? (
                  <div className="mt-4 flex justify-center">
                    <img
                      src={pix.qrUrl}
                      alt="QR Code PIX"
                      className="h-56 w-56 rounded-xl border border-[#E5E7EB] bg-white p-2"
                    />
                  </div>
                ) : null}

                {pix.code && (
                  <div className="mt-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                      PIX Copia e Cola
                    </div>
                    <div className="mt-1 break-all rounded-xl border border-[#E5E7EB] bg-white p-3 font-mono text-[12px] text-[#111827]">
                      {pix.code}
                    </div>
                  </div>
                )}

                {pix.code && (
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(pix.code);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {
                        /* noop */
                      }
                    }}
                    className="mt-3 flex h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#7C3AED] text-sm font-semibold text-white transition hover:bg-[#6D28D9]"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Código copiado" : "Copiar código PIX"}
                  </button>
                )}

                {pix.status === "failed" && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    A cobrança foi recusada pela operadora. Tente novamente.
                  </div>
                )}

                <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-[#6B7280]">
                  <Lock className="h-3.5 w-3.5" /> Pagamento 100% seguro
                </div>
              </>
            )}
          </>
        ) : cardResult ? (
          <>
            <div className="mt-1 flex flex-col items-center text-center">
              {cardResult.status === "confirmed" ? (
                <>
                  <CheckCircle2 className="h-14 w-14 text-emerald-500" />
                  <h2 className="mt-3 text-[24px] font-bold text-[#111827]">Pagamento aprovado</h2>
                  <p className="mt-1 text-sm text-[#6B7280]">
                    Sua contribuição de R$ {cardResult.valor.toFixed(2).replace(".", ",")} foi
                    confirmada.
                  </p>
                </>
              ) : cardResult.status === "pending" ? (
                <>
                  <Loader2 className="h-14 w-14 animate-spin text-[#7C3AED]" />
                  <h2 className="mt-3 text-[24px] font-bold text-[#111827]">
                    Processando pagamento
                  </h2>
                  <p className="mt-1 text-sm text-[#6B7280]">
                    Aguardando confirmação da operadora.
                  </p>
                </>
              ) : (
                <>
                  <X className="h-14 w-14 rounded-full bg-red-100 p-3 text-red-600" />
                  <h2 className="mt-3 text-[24px] font-bold text-[#111827]">Pagamento recusado</h2>
                  <p className="mt-1 text-sm text-[#6B7280]">
                    {cardResult.message ?? "Verifique os dados do cartão e tente novamente."}
                  </p>
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="mt-6 flex h-[48px] w-full items-center justify-center rounded-full bg-[#7C3AED] text-sm font-semibold text-white hover:bg-[#6D28D9]"
            >
              Fechar
            </button>
          </>
        ) : boleto ? (
          <>
            <h2 className="mt-1 text-[24px] font-bold leading-tight text-[#111827]">
              Boleto gerado
            </h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              Pague no app do seu banco usando o código abaixo.
            </p>

            <div className="mt-5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                Valor
              </div>
              <div className="mt-0.5 text-2xl font-bold text-[#111827]">
                R$ {boleto.valor.toFixed(2).replace(".", ",")}
              </div>
              <div className="mt-3 text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                Vencimento
              </div>
              <div className="mt-0.5 text-sm font-semibold text-[#111827]">
                {boleto.due.toLocaleDateString("pt-BR")} · válido por 3 dias úteis
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                Instituição beneficiária
              </div>
              <div className="mt-0.5 text-sm font-semibold text-[#111827]">
                {tenant?.name ?? "—"}
              </div>
              {tenant?.slug && <div className="text-xs text-[#6B7280]">@{tenant.slug}</div>}
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
                <div>
                  <div className="font-medium uppercase tracking-wide text-[#6B7280]">
                    ID do pagamento
                  </div>
                  <div className="break-all font-mono text-[#111827]">
                    {boleto.paymentId ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="font-medium uppercase tracking-wide text-[#6B7280]">
                    ID da doação
                  </div>
                  <div className="break-all font-mono text-[#111827]">
                    {boleto.donationId ?? "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                Linha digitável
              </div>
              <div className="mt-1 break-all rounded-xl border border-[#E5E7EB] bg-white p-3 font-mono text-[13px] text-[#111827]">
                {boleto.code}
              </div>
            </div>

            <button
              onClick={handleCopy}
              className="mt-3 flex h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#7C3AED] text-sm font-semibold text-white transition hover:bg-[#6D28D9]"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Código copiado" : "Copiar código"}
            </button>

            <button
              onClick={handleDownloadPdf}
              className="mt-2 flex h-[48px] w-full items-center justify-center gap-2 rounded-full border border-[#E5E7EB] bg-white text-sm font-semibold text-[#111827] transition hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              Baixar PDF do Boleto
            </button>

            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-[#6B7280]">
              <Lock className="h-3.5 w-3.5" />
              Pagamento 100% seguro
            </div>
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#EDE9FE] px-3 py-1 text-xs font-medium text-[#7C3AED]">
              <Star className="h-3.5 w-3.5 fill-[#7C3AED]" />
              Valor mais escolhido
            </div>

            <h2 className="mt-4 text-[28px] font-bold leading-tight text-[#111827]">
              {copy.title}
            </h2>
            <p className="mt-1 text-sm text-[#6B7280]">{copy.subtitle}</p>

            <div className="mt-5 flex items-center rounded-xl border-2 border-[#7C3AED] px-4 py-3">
              <span className="text-2xl font-semibold text-[#111827]">R$</span>
              <input
                ref={inputRef}
                inputMode="numeric"
                value={value}
                onChange={(e) => handleInput(e.target.value)}
                placeholder="0"
                className="ml-2 w-full bg-transparent text-3xl font-bold text-[#7C3AED] outline-none placeholder:text-[#7C3AED]/30"
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {PRESETS.map((v) => {
                const active = selected === v;
                return (
                  <button
                    key={v}
                    onClick={() => pickPreset(v)}
                    className={`flex flex-col items-center justify-center rounded-xl border px-2 py-3 text-sm font-semibold transition ${
                      active
                        ? "border-[#7C3AED] bg-[#7C3AED] text-white"
                        : "border-[#E5E7EB] bg-white text-[#111827] hover:border-gray-300"
                    }`}
                  >
                    <span>R${v}</span>
                    {v === 25 && active && (
                      <span className="mt-0.5 text-[10px] font-normal opacity-90">
                        Mais escolhido
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                onClick={pickCustom}
                className={`rounded-xl border px-2 py-3 text-sm font-semibold transition ${
                  selected === "custom"
                    ? "border-[#7C3AED] bg-[#7C3AED] text-white"
                    : "border-[#E5E7EB] bg-white text-[#111827] hover:border-gray-300"
                }`}
              >
                Outro valor
              </button>
            </div>

            {needsPayer && (
              <div className="mt-5 space-y-2.5">
                <div>
                  <label className="text-xs font-medium text-[#6B7280]">Seu nome *</label>
                  <input
                    type="text"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    maxLength={120}
                    placeholder="Nome completo"
                    className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6B7280]">Seu e-mail *</label>
                  <input
                    type="email"
                    value={payerEmail}
                    onChange={(e) => setPayerEmail(e.target.value)}
                    maxLength={255}
                    placeholder="email@exemplo.com"
                    className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6B7280]">CPF ou CNPJ *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={payerCpf}
                    onChange={(e) => setPayerCpf(formatCPF(e.target.value))}
                    placeholder="000.000.000-00 ou 00.000.000/0001-00"
                    className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                  />
                  <p className="mt-1 text-xs text-[#6B7280]">
                    Necessário para identificar sua contribuição
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6B7280]">Celular *</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={payerPhone}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, "").slice(0, 11);
                      const formatted =
                        d.length > 10
                          ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
                          : d.length > 6
                            ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
                            : d.length > 2
                              ? `(${d.slice(0, 2)}) ${d.slice(2)}`
                              : d;
                      setPayerPhone(formatted);
                    }}
                    placeholder="(00) 00000-0000"
                    className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                  />
                  <p className="mt-1 text-[11px] text-[#6B7280]">
                    Obrigatório para confirmação do pagamento
                  </p>
                </div>
              </div>
            )}

            {isBoleto && (
              <div className="mt-4 space-y-2.5 border-t border-[#E5E7EB] pt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                  Endereço do pagador
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6B7280]">Rua e número *</label>
                  <input
                    type="text"
                    value={boletoAddrLine}
                    onChange={(e) => setBoletoAddrLine(e.target.value)}
                    maxLength={200}
                    placeholder="Rua Exemplo, 123"
                    className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6B7280]">Bairro</label>
                  <input
                    type="text"
                    value={boletoAddrNeighborhood}
                    onChange={(e) => setBoletoAddrNeighborhood(e.target.value)}
                    maxLength={100}
                    placeholder="Bairro (opcional)"
                    className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                  />
                </div>
                <div className="grid grid-cols-[1fr_80px] gap-2">
                  <div>
                    <label className="text-xs font-medium text-[#6B7280]">CEP *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={boletoAddrZip}
                      onChange={(e) => {
                        const d = e.target.value.replace(/\D/g, "").slice(0, 8);
                        const formatted = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
                        setBoletoAddrZip(formatted);
                      }}
                      placeholder="00000-000"
                      className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#6B7280]">UF *</label>
                    <input
                      type="text"
                      value={boletoAddrState}
                      onChange={(e) =>
                        setBoletoAddrState(
                          e.target.value
                            .replace(/[^a-zA-Z]/g, "")
                            .slice(0, 2)
                            .toUpperCase(),
                        )
                      }
                      placeholder="SP"
                      className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm uppercase text-[#111827] outline-none focus:border-[#7C3AED]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6B7280]">Cidade *</label>
                  <input
                    type="text"
                    value={boletoAddrCity}
                    onChange={(e) => setBoletoAddrCity(e.target.value)}
                    maxLength={80}
                    placeholder="Cidade"
                    className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                  />
                </div>
              </div>
            )}

            {isCard && (
              <div className="mt-4 space-y-2.5 border-t border-[#E5E7EB] pt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                  Dados do cartão
                </div>
                {/* Número — com bandeiras */}
                <div>
                  <label className="text-xs font-medium text-[#6B7280]">Número do cartão</label>
                  <div className="relative mt-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cardNumber}
                      onChange={(e) => {
                        const d = e.target.value.replace(/\D/g, "").slice(0, 19);
                        setCardNumber(d.replace(/(\d{4})(?=\d)/g, "$1 "));
                      }}
                      placeholder="0000 0000 0000 0000"
                      className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white pr-[148px] pl-3 font-mono text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                    />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {(() => {
                        const brand = detectCardBrand(cardNumber);
                        const flags: Array<{
                          key: "visa" | "master" | "elo" | "hiper" | "amex";
                          Comp: React.FC<{ active: boolean; dim: boolean }>;
                        }> = [
                          { key: "visa", Comp: CardFlagVisa },
                          { key: "master", Comp: CardFlagMaster },
                          { key: "elo", Comp: CardFlagElo },
                          { key: "hiper", Comp: CardFlagHiper },
                          { key: "amex", Comp: CardFlagAmex },
                        ];
                        return flags.map(({ key, Comp }) => (
                          <Comp
                            key={key}
                            active={brand === key}
                            dim={brand !== null && brand !== key}
                          />
                        ));
                      })()}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6B7280]">
                    Nome impresso no cartão
                  </label>
                  <input
                    type="text"
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                    maxLength={120}
                    placeholder="NOME COMO NO CARTÃO"
                    className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm uppercase text-[#111827] outline-none focus:border-[#7C3AED]"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-[#6B7280]">Validade</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cardExp}
                      onChange={(e) => {
                        const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                        setCardExp(d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                      }}
                      placeholder="MM/AA"
                      className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 font-mono text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#6B7280]">CVV</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="123"
                      className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 font-mono text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                    />
                  </div>
                </div>
                {(() => {
                  const allowsInst = costCenter ? costCenter.allows_installments : true;
                  const maxInst = costCenter
                    ? Math.max(1, Math.min(2, costCenter.max_installments))
                    : 2;
                  if (!allowsInst) return null;
                  return (
                    <div>
                      <label className="text-xs font-medium text-[#6B7280]">Parcelas</label>
                      <select
                        value={Math.min(installments, maxInst)}
                        onChange={(e) => setInstallments(Number(e.target.value))}
                        className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                      >
                        {Array.from({ length: maxInst }, (_, i) => i + 1).map((n) => {
                          const cents =
                            Number(value || 0) > 0
                              ? calculateAmounts(Math.round(Number(value) * 100)).totalAmount
                              : 0;
                          return (
                            <option key={n} value={n}>
                              {n}x de R$ {formatBRL(Math.round(cents / n))}
                              {n === 1 ? " (à vista)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  );
                })()}

                <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                  Endereço de cobrança
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6B7280]">Endereço (rua, nº)</label>
                  <input
                    type="text"
                    value={addrLine}
                    onChange={(e) => setAddrLine(e.target.value)}
                    maxLength={200}
                    placeholder="Rua Exemplo, 123"
                    className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-medium text-[#6B7280]">CEP</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={addrZip}
                      onChange={(e) => {
                        const d = e.target.value.replace(/\D/g, "").slice(0, 8);
                        setAddrZip(d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d);
                      }}
                      placeholder="00000-000"
                      className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 font-mono text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#6B7280]">UF</label>
                    <input
                      type="text"
                      value={addrState}
                      onChange={(e) => setAddrState(e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="SP"
                      className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm uppercase text-[#111827] outline-none focus:border-[#7C3AED]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6B7280]">Cidade</label>
                  <input
                    type="text"
                    value={addrCity}
                    onChange={(e) => setAddrCity(e.target.value)}
                    maxLength={80}
                    placeholder="São Paulo"
                    className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] outline-none focus:border-[#7C3AED]"
                  />
                </div>
              </div>
            )}

            {Number(value) > 0 &&
              (() => {
                const methodForCalc: import("@/lib/split.utils").PaymentMethod = isPix
                  ? "pix"
                  : isCard
                    ? "credit_card"
                    : "boleto";
                const { totalAmount } = calculateAmounts(
                  Math.round(Number(value) * 100),
                  methodForCalc,
                );
                return (
                  <div className="mt-5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-sm">
                    <div className="flex items-center justify-between text-[#6B7280]">
                      <span>Valor da contribuição</span>
                      <span className="font-medium text-[#111827]">
                        R$ {formatBRL(Math.round(Number(value) * 100))}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[#6B7280]">
                      <span>Taxa de Administrativa</span>
                    </div>
                    <div className="mt-2 border-t border-[#E5E7EB] pt-2 flex items-center justify-between">
                      <span className="font-semibold text-[#111827]">Total cobrado</span>
                      <span className="text-base font-bold text-[#7C3AED]">
                        R$ {formatBRL(totalAmount)}
                      </span>
                    </div>
                  </div>
                );
              })()}

            <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-[#6B7280]">
              <Lock className="h-3.5 w-3.5" />
              Pagamento 100% seguro
            </div>

            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={() => handleConfirm()}
              className="mt-4 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#7C3AED] text-base font-semibold text-white transition hover:bg-[#6D28D9] disabled:opacity-50"
              disabled={!Number(value) || submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? (isCard ? "Processando..." : "Gerando...") : copy.cta}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function detectCardBrand(num: string): "visa" | "master" | "elo" | "hiper" | "amex" | null {
  const d = num.replace(/\s/g, "");
  if (
    /^4011|^4312|^4389|^4514|^4573|^5041|^5066|^5067|^509|^6277|^6362|^6363|^650|^6516|^6550/.test(
      d,
    )
  )
    return "elo";
  if (/^(606282|3841)/.test(d)) return "hiper";
  if (/^3[47]/.test(d)) return "amex";
  if (/^5[1-5]|^2(2[2-9]|[3-6]\d|7[01])/.test(d)) return "master";
  if (/^4/.test(d)) return "visa";
  return null;
}

function CardFlagVisa({ active, dim }: { active: boolean; dim: boolean }) {
  const opacity = dim ? 0.12 : active ? 1 : 0.22;
  const scale = active ? "scale(1.08)" : "scale(0.9)";
  return (
    <svg
      viewBox="0 0 36 24"
      width={36}
      height={24}
      style={{
        borderRadius: 4,
        opacity,
        transform: scale,
        transition: "opacity .2s, transform .2s",
      }}
    >
      <rect width="36" height="24" rx="4" fill="#1A1F71" />
      <text
        x="18"
        y="16"
        textAnchor="middle"
        fontFamily="Arial,sans-serif"
        fontSize="10"
        fontWeight="bold"
        fill="#F7A600"
        letterSpacing="0.5"
      >
        VISA
      </text>
    </svg>
  );
}

function CardFlagMaster({ active, dim }: { active: boolean; dim: boolean }) {
  const opacity = dim ? 0.12 : active ? 1 : 0.22;
  const scale = active ? "scale(1.08)" : "scale(0.9)";
  return (
    <svg
      viewBox="0 0 36 24"
      width={36}
      height={24}
      style={{
        borderRadius: 4,
        opacity,
        transform: scale,
        transition: "opacity .2s, transform .2s",
      }}
    >
      <rect width="36" height="24" rx="4" fill="#252525" />
      <circle cx="14" cy="12" r="7" fill="#EB001B" />
      <circle cx="22" cy="12" r="7" fill="#F79E1B" />
      <path d="M18 6.8a7 7 0 0 1 0 10.4A7 7 0 0 1 18 6.8z" fill="#FF5F00" />
    </svg>
  );
}

function CardFlagElo({ active, dim }: { active: boolean; dim: boolean }) {
  const opacity = dim ? 0.12 : active ? 1 : 0.22;
  const scale = active ? "scale(1.08)" : "scale(0.9)";
  return (
    <svg
      viewBox="0 0 36 24"
      width={36}
      height={24}
      style={{
        borderRadius: 4,
        opacity,
        transform: scale,
        transition: "opacity .2s, transform .2s",
      }}
    >
      <rect width="36" height="24" rx="4" fill="#FFD100" />
      <text
        x="18"
        y="16"
        textAnchor="middle"
        fontFamily="Arial,sans-serif"
        fontSize="9"
        fontWeight="bold"
        fill="#00A4E0"
      >
        elo
      </text>
    </svg>
  );
}

function CardFlagHiper({ active, dim }: { active: boolean; dim: boolean }) {
  const opacity = dim ? 0.12 : active ? 1 : 0.22;
  const scale = active ? "scale(1.08)" : "scale(0.9)";
  return (
    <svg
      viewBox="0 0 36 24"
      width={36}
      height={24}
      style={{
        borderRadius: 4,
        opacity,
        transform: scale,
        transition: "opacity .2s, transform .2s",
      }}
    >
      <rect width="36" height="24" rx="4" fill="#F08000" />
      <text
        x="18"
        y="10"
        textAnchor="middle"
        fontFamily="Arial,sans-serif"
        fontSize="6"
        fontWeight="bold"
        fill="white"
      >
        HIPER
      </text>
      <text
        x="18"
        y="18"
        textAnchor="middle"
        fontFamily="Arial,sans-serif"
        fontSize="6"
        fontWeight="bold"
        fill="white"
      >
        CARD
      </text>
    </svg>
  );
}

function CardFlagAmex({ active, dim }: { active: boolean; dim: boolean }) {
  const opacity = dim ? 0.12 : active ? 1 : 0.22;
  const scale = active ? "scale(1.08)" : "scale(0.9)";
  return (
    <svg
      viewBox="0 0 36 24"
      width={36}
      height={24}
      style={{
        borderRadius: 4,
        opacity,
        transform: scale,
        transition: "opacity .2s, transform .2s",
      }}
    >
      <rect width="36" height="24" rx="4" fill="#007BC1" />
      <text
        x="18"
        y="10"
        textAnchor="middle"
        fontFamily="Arial,sans-serif"
        fontSize="5.5"
        fontWeight="bold"
        fill="white"
      >
        AMERICAN
      </text>
      <text
        x="18"
        y="18"
        textAnchor="middle"
        fontFamily="Arial,sans-serif"
        fontSize="5.5"
        fontWeight="bold"
        fill="white"
      >
        EXPRESS
      </text>
    </svg>
  );
}

export default ContribuicaoModal;
