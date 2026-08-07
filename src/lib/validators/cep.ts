const CEP = /^\d{5}-?\d{3}$/;
export const validateCEP = (v: string) => CEP.test(v) || "CEP inválido (formato 00000-000).";
export const onlyDigitsCEP = (v: string) => v.replace(/\D/g, "").slice(0, 8);
