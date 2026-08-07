import { BRAND } from "@/lib/brand";
// Nenhuma consulta de sessão/perfil aqui de propósito — ver nota em
// resolveCustomer() abaixo sobre por que isso nunca deve ser reintroduzido.

function parseBrPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return { country_code: "55", area_code: local.slice(0, 2), number: local.slice(2) };
}

export type ResolvedCustomer = {
  name: string | null;
  email: string | null;
  document: string | null;
  documentType: "CPF" | "CNPJ" | null;
  phone: string | null;
};

/**
 * Usa exclusivamente o que o doador digitou no modal. Todos os campos são
 * obrigatórios no formulário, então não existe caso legítimo de precisar
 * complementar com dado de outra fonte (ex: perfil da sessão logada) — e
 * fazer isso foi exatamente o bug que trocava o nome do doador pelo nome
 * de quem estivesse autenticado no navegador ao acessar a página pública.
 * Nunca reintroduzir um fallback de perfil aqui.
 */
export async function resolveCustomer(input: {
  customerName?: string;
  customerEmail?: string;
  customerDocument?: string;
  customerPhone?: string;
}): Promise<ResolvedCustomer> {
  const name = input.customerName ?? null;
  const email = input.customerEmail ?? null;
  const docDigits = input.customerDocument ? input.customerDocument.replace(/\D/g, "") : "";
  const document = docDigits || null;
  const documentType: "CPF" | "CNPJ" | null = document
    ? document.length === 14
      ? "CNPJ"
      : "CPF"
    : null;
  const phone = input.customerPhone ? input.customerPhone.replace(/\D/g, "") : null;
  return { name, email, document, documentType, phone };
}

/** Valida CPF (11) ou CNPJ (14) pelos dígitos verificadores. */
export function validateDocument(raw: string | null | undefined): boolean {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    const calc = (len: number) => {
      let sum = 0;
      for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
      const r = (sum * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;
    const calc = (len: number) => {
      const weights =
        len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let sum = 0;
      for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  return false;
}

/** Constrói o objeto `customer` no formato esperado pela Pagar.me. */
export function buildPagarmeCustomer(c: ResolvedCustomer) {
  const docType = c.documentType ?? "CPF";
  const obj: Record<string, unknown> = {
    name: c.name ?? "Contribuinte",
    email: c.email ?? BRAND.pagarme.fallbackCustomerEmail,
    type: docType === "CNPJ" ? "company" : "individual",
    document: c.document ?? "",
    document_type: docType,
  };
  if (c.phone && c.phone.length >= 10) {
    obj.phones = { mobile_phone: parseBrPhone(c.phone) };
  }
  return obj;
}
