(window.CIDADE_TEXTOS = window.CIDADE_TEXTOS || {})['pedidos'] = {
  'docs/checkout.md': '# Checkout\n\nStatus: aprovada\n\n## Regras\n\n- **RN-01** O frete é recalculado sempre que o endereço muda.\n- **RN-02** O estoque é reservado por 15 minutos.\n- **RN-03** Sem pagamento aprovado em 15 minutos, a reserva cai.\n',
  'docs/adr-001.md': '# ADR 001 — Reserva de estoque no checkout\n\nStatus: aceita\n\n## Decisão\n\nReservar o estoque no checkout, e não no carrinho, para não prender produto de quem só está olhando.\n',
};
