// Validações locais de dados bancários brasileiros.
// Foco em formato — a validação real ocorre na Pagar.me.

const BANK_CODE = /^\d{3}$/;
const BRANCH = /^\d{1,5}$/;
const ACCOUNT = /^\d{1,12}$/;
const DIGIT = /^[0-9Xx]$/;

export const validateBankCode = (v: string) =>
  BANK_CODE.test(v) || "Código do banco deve ter 3 dígitos.";

export const validateBranch = (v: string) => BRANCH.test(v) || "Agência inválida.";

export const validateBranchDigit = (v: string | undefined | null) =>
  !v || DIGIT.test(v) || "Dígito da agência inválido.";

export const validateAccount = (v: string) => ACCOUNT.test(v) || "Conta inválida.";

export const validateAccountDigit = (v: string) => DIGIT.test(v) || "Dígito da conta inválido.";

export const BANK_ACCOUNT_TYPES = [
  "checking",
  "checking_joint",
  "savings",
  "savings_joint",
] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];
