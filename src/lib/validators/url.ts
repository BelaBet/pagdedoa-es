import { z } from "zod";

// URL externa de evento: bilheteria de terceiro, formulário ou site próprio.
// Genérica de propósito — a plataforma não se prende a nenhum parceiro.
export const externalEventUrlSchema = z
  .string()
  .trim()
  .min(1, "Informe a URL do evento")
  .max(2048, "URL muito longa")
  .url("URL inválida")
  .refine((u) => /^https?:\/\//i.test(u), "Use http:// ou https://");

/** Valor inicial do campo, para o usuário completar. */
export const EXTERNAL_URL_PLACEHOLDER = "https://";
