import { cpf, cnpj } from "cpf-cnpj-validator";

export const validateCPF = (value: string) => cpf.isValid(value) || "CPF inválido";

export const validateCNPJ = (value: string) => cnpj.isValid(value) || "CNPJ inválido";
