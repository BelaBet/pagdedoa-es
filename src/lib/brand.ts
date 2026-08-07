/**
 * Identidade da plataforma — fonte única de verdade.
 *
 * Tudo que é "quem somos nós" mora aqui. Nada de nome, e-mail, telefone ou
 * domínio da plataforma hardcoded em componente ou função de negócio.
 *
 * IMPORTANTE — não confundir duas camadas:
 *   1. ESTA marca = a plataforma (nós, o SaaS).
 *   2. Marca do tenant = cada igreja, com cores próprias aplicadas em runtime
 *      pelo TenantThemeBridge (src/lib/theme). Não tem nada a ver com este arquivo.
 *
 * Ao batizar o produto, troque `name`, `domain` e os contatos abaixo.
 * O resto do código não precisa ser tocado.
 */

export const BRAND = {
  /** Nome comercial exibido ao usuário. */
  name: "Centro de Doações",

  /** Razão social, para documentos, recibos e rodapés legais. */
  legalName: "Ankor Trading Ltda",

  /** Frase curta de apoio ao nome. */
  tagline: "Plataforma de Gestão",

  /** Descrição usada em <meta description> e cartões de compartilhamento. */
  description: "Plataforma para gestão de comunidades religiosas — eventos, doações, mensagens.",

  /** Domínio raiz, sem protocolo e sem barra final. */
  domain: "meuhub.site",

  support: {
    email: "contato@meuhub.site",
    /** Formato de exibição, legível por humanos. */
    phone: "(81) 99288-1552",
    /** Formato E.164, para href="tel:". */
    phoneE164: "+5581992881552",
  },

  /**
   * E-mails técnicos enviados à Pagar.me. Precisam ser sintaticamente válidos
   * e ter domínio sob nosso controle — nunca são usados para contato real.
   */
  pagarme: {
    /** Fallback quando o contribuinte não informa e-mail. */
    fallbackCustomerEmail: "contribuinte@meuhub.site",
    /** Domínio dos e-mails gerados por tenant no cadastro de recipient. */
    recipientEmailDomain: "meuhub.site",
  },
} as const;

/** Título completo, para <title> e og:title. */
export const BRAND_TITLE = `${BRAND.name} — ${BRAND.tagline}`;

/** Descrição completa, prefixada com o nome. */
export const BRAND_DESCRIPTION = `${BRAND.name}: ${BRAND.description}`;

/** URL canônica com protocolo. */
export const BRAND_URL = `https://${BRAND.domain}`;
