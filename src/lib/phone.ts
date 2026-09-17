/**
 * Utilitários para normalização e formatação de telefones do WhatsApp no padrão brasileiro.
 */

export function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  // Remover @s.whatsapp.net ou outros sufixos de JID
  let cleaned = phone.replace(/@.*$/, '');
  // Manter apenas dígitos
  cleaned = cleaned.replace(/\D/g, '');

  // Se começar com 55 e tiver 12 ou 13 dígitos
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    // OK, já tem DDI
  } else if (cleaned.length === 10 || cleaned.length === 11) {
    // Adicionar DDI Brasil 55
    cleaned = '55' + cleaned;
  }

  return cleaned;
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = cleanPhoneNumber(phone);
  if (!cleaned) return '';

  // Exemplo: 5565999998888 (13 dígitos) -> +55 (65) 99999-8888
  if (cleaned.length === 13 && cleaned.startsWith('55')) {
    const ddd = cleaned.substring(2, 4);
    const part1 = cleaned.substring(4, 9);
    const part2 = cleaned.substring(9, 13);
    return `+55 (${ddd}) ${part1}-${part2}`;
  }

  // Exemplo: 556599998888 (12 dígitos - sem o 9) -> +55 (65) 9999-8888
  if (cleaned.length === 12 && cleaned.startsWith('55')) {
    const ddd = cleaned.substring(2, 4);
    const part1 = cleaned.substring(4, 8);
    const part2 = cleaned.substring(8, 12);
    return `+55 (${ddd}) ${part1}-${part2}`;
  }

  // Fallback
  return `+${cleaned}`;
}

/**
 * Cria variações de busca para encontrar o número mesmo com ou sem o 9º dígito
 */
export function getPhoneSearchVariants(phone: string): string[] {
  const cleaned = cleanPhoneNumber(phone);
  if (!cleaned) return [];

  const variants = new Set<string>();
  variants.add(cleaned);

  // Se for celular brasileiro com 55 + 2 dígitos DDD + 9 dígitos (total 13)
  if (cleaned.length === 13 && cleaned.startsWith('55')) {
    const ddd = cleaned.substring(2, 4);
    const ninth = cleaned[4];
    if (ninth === '9') {
      // Versão sem o 9º dígito
      const withoutNine = '55' + ddd + cleaned.substring(5);
      variants.add(withoutNine);
    }
  } else if (cleaned.length === 12 && cleaned.startsWith('55')) {
    // Versão com o 9º dígito adicionado
    const ddd = cleaned.substring(2, 4);
    const withNine = '55' + ddd + '9' + cleaned.substring(4);
    variants.add(withNine);
  }

  return Array.from(variants);
}
