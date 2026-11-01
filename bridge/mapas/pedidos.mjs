// Mapa da coleta "pedidos_recentes": cada pedido vira um operário no bairro Pedidos, com o tipo certo de capacete.
const TIPO = { simples: 'pd-t-simples', grande: 'pd-t-grande', b2b: 'pd-t-b2b' };

export default (pedidos) => (Array.isArray(pedidos) ? pedidos : []).map(p => ({ bairro: 'pedidos', tipo: TIPO[p.tipo] }));
