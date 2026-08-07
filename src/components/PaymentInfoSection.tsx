import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, Check, Building2, MapPin, Phone, Mail, Landmark, KeyRound } from "lucide-react";
import { getPublicPaymentInfo } from "@/lib/tenant-payment-info.functions";

function Row({
  icon: Icon,
  label,
  value,
  copyable,
  accent,
}: {
  icon: typeof Building2;
  label: string;
  value: string | null | undefined;
  copyable?: boolean;
  accent: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = () => {
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: "10px 0",
        borderBottom: "1px solid #f0eee9",
      }}
    >
      <Icon size={18} style={{ color: accent, marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#888",
            fontWeight: 600,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 14, color: "#1a1a1a", marginTop: 2, wordBreak: "break-word" }}>
          {value}
        </div>
      </div>
      {copyable && (
        <button
          onClick={copy}
          aria-label={`Copiar ${label}`}
          style={{
            background: "transparent",
            border: "1px solid #e5e3dc",
            borderRadius: 6,
            padding: "4px 8px",
            cursor: "pointer",
            color: copied ? "#16a34a" : "#666",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      )}
    </div>
  );
}

export function PaymentInfoSection({
  slug,
  primary,
  accent,
}: {
  slug: string;
  primary: string;
  accent: string;
}) {
  const fetchFn = useServerFn(getPublicPaymentInfo);
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-payment-info", slug],
    queryFn: () => fetchFn({ data: { slug } }),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <section style={{ padding: "48px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center", color: "#888" }}>
          Carregando dados de pagamento…
        </div>
      </section>
    );
  }

  if (error || !data) return null;

  const r = data.recipient;
  const addr = r?.address;
  const fullAddress = addr
    ? [
        [addr.street, addr.number].filter(Boolean).join(", "),
        addr.complement,
        addr.neighborhood,
        [addr.city, addr.state].filter(Boolean).join(" - "),
        addr.zipCode ? `CEP ${addr.zipCode}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const bankLine = r?.bankAccount
    ? `${r.bankAccount.bank ?? ""} · Ag. ${r.bankAccount.branch ?? "—"} · CC ${r.bankAccount.account ?? "—"}${
        r.bankAccount.accountDigit ? "-" + r.bankAccount.accountDigit : ""
      }`
    : null;

  return (
    <section style={{ padding: "56px 24px", background: "#fff", borderTop: "1px solid #f0eee9" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 28,
            color: primary,
            margin: "0 0 8px",
            textAlign: "center",
          }}
        >
          Dados de Pagamento
        </h2>
        <p style={{ color: "#666", textAlign: "center", margin: "0 0 32px", fontSize: 14 }}>
          Informações oficiais para contribuições, transferências e emissão de recibos.
        </p>

        <div
          style={{
            background: "#fafaf7",
            border: "1px solid #f0eee9",
            borderRadius: 14,
            padding: "20px 24px",
          }}
        >
          <Row
            icon={Building2}
            label="Razão Social"
            value={r?.legalName ?? data.tenantName}
            accent={accent}
          />
          {r?.tradingName && r.tradingName !== r.legalName && (
            <Row icon={Building2} label="Nome Fantasia" value={r.tradingName} accent={accent} />
          )}
          <Row
            icon={Building2}
            label={r?.documentType === "cpf" ? "CPF" : "CNPJ"}
            value={r?.document}
            copyable
            accent={accent}
          />
          <Row icon={KeyRound} label="Chave PIX" value={data.pixKey} copyable accent={accent} />
          <Row icon={Landmark} label="Conta bancária" value={bankLine} accent={accent} />
          {r?.bankAccount?.holderName && (
            <Row
              icon={Building2}
              label="Titular da conta"
              value={r.bankAccount.holderName}
              accent={accent}
            />
          )}
          <Row icon={MapPin} label="Endereço" value={fullAddress} accent={accent} />
          <Row icon={Phone} label="Telefone" value={r?.phone} accent={accent} />
          <Row icon={Mail} label="E-mail" value={r?.email} accent={accent} />
        </div>

        <p style={{ fontSize: 11, color: "#aaa", textAlign: "center", marginTop: 16 }}>
          Dados sincronizados via Pagar.me · Recebimento processado em ambiente seguro.
        </p>
      </div>
    </section>
  );
}
