// EMV/BR Code (Pix) payload builder for static QR codes.
// Reference: https://www.bcb.gov.br/estabilidadefinanceira/pix

function tlv(id: string, value: string) {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitizeKey(key: string) {
  const trimmed = key.trim();
  // CPF/CNPJ/phone: keep digits only. Email/random: keep as is.
  if (/[a-zA-Z@]/.test(trimmed)) return trimmed;
  return trimmed.replace(/\D/g, "");
}

function normalizeText(s: string, max: number) {
  return (
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9 ]/g, "")
      .slice(0, max)
      .trim() || "NA"
  );
}

export function buildPixPayload(opts: {
  key: string;
  amount?: number | string;
  merchantName?: string;
  merchantCity?: string;
  txid?: string;
}) {
  const key = sanitizeKey(opts.key);
  const name = normalizeText(opts.merchantName || "", 25);
  const city = normalizeText(opts.merchantCity || "SAO PAULO", 15);
  const txid = normalizeText(opts.txid || "***", 25);

  const merchantAccount = tlv("00", "br.gov.bcb.pix") + tlv("01", key);

  let payload = tlv("00", "01") + tlv("26", merchantAccount) + tlv("52", "0000") + tlv("53", "986");

  const amountNum =
    typeof opts.amount === "string" ? parseFloat(opts.amount.replace(",", ".")) : opts.amount;
  if (amountNum && !Number.isNaN(amountNum) && amountNum > 0) {
    payload += tlv("54", amountNum.toFixed(2));
  }

  payload += tlv("58", "BR") + tlv("59", name) + tlv("60", city) + tlv("62", tlv("05", txid));

  const toCrc = payload + "6304";
  return toCrc + crc16(toCrc);
}
