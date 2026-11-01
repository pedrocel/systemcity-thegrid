# Recursos com IA, incidentes, replay e planos

Tudo aqui precisa do servidor (`servidor/`) e de conta. O Claude roda de dois jeitos:

- **Com `ANTHROPIC_API_KEY` no ambiente** (o caso do servidor online), pela API da Anthropic, com o modelo de `CLAUDE_MODELO` (padrão `claude-opus-5-5`).
- **Sem a chave** (o caso da máquina de quem desenvolve), pelo Claude Code instalado (`claude -p`, sem nenhuma ferramenta ligada).

## Cidade gerada do GitHub

Na página **Cidades** (`/cidades.html`), informe `dono/nome` ou a URL do repositório. O servidor lê a árvore, o README, os manifestos (`package.json`, `docker-compose`, `requirements.txt`…), até 28 arquivos de código e os markdowns. Depois pede ao Claude a cidade: bairros, estações, desvios, sistemas de fora e as ruas entre eles. Em 1 a 3 minutos a cidade abre em `cidade.html?c=<slug>`, com a torre de documentos de cada bairro montada dos markdowns do repositório.

- **Repositórios privados:** clique em "Conectar GitHub" e cole um token fine-grained só com leitura de conteúdo.
- **Modelos prontos:** e-commerce, fintech e SaaS B2B, em `cities/modelos/*.json`. Cada um é um JSON no mesmo formato que o Claude gera.
- **Quem vê a cidade:** quem a criou e, se ela for de uma equipe, todos da equipe.

## Pergunte para a cidade

O botão **Perguntar** abre um chat. O navegador manda o mapa como está agora: bairros, prédios, filas, incidentes e obras. O servidor junta os documentos da cidade e as últimas atas da equipe, e o Claude responde. Se a resposta fala de um lugar, a câmera voa até ele.

## Ata vira tickets e obras

- **Atividades com bairro:** a ata agora marca em cada atividade o bairro que ela afeta.
- **Obras na cidade:** cada atividade aparece como uma **obra** (guindaste e tapume) no bairro. Clicar na obra mostra o responsável e o prazo, e "Marcar como feita" termina a obra.
- **Sem integração ligada:** cada atividade tem uma caixa de "feita" e o botão **Abrir ticket**. Com `TICKETS_NOVO_URL` no servidor (ex.: `https://github.com/dono/repo/issues/new?title={titulo}&body={corpo}`), o formulário do seu sistema de tickets abre já preenchido. Sem ela, o texto do ticket vai para a área de transferência. O link do ticket fica guardado na atividade.

## Incidentes e sala de guerra

- **Abrir:** pelo botão **Incidentes**, escolhendo o prédio e a severidade, ou por um alerta de fora:

```bash
curl -X POST https://<servidor>/api/incidentes/webhook -H 'content-type: application/json' -H "x-systemcity-token: $INCIDENTES_TOKEN" \
  -d '{"cidade":"<slug>","predio":"pg-autoriza","titulo":"Pagamentos recusando tudo","severidade":"critica","origem":"sentry"}'
```

- **O que acontece:** o prédio pega fogo, a equipe da cidade recebe o chamado e ganha uma sala de guerra, com conversa e chamada (que pode ser transcrita).
- **Resolver:** o Claude escreve o **post-mortem** com a linha do tempo da sala. As ações para não repetir viram obras nos bairros.
- **Configuração:** `INCIDENTES_TOKEN` no servidor liga o webhook. Sem ele, só dá para abrir por dentro.

## The Grid como ritual

- **Daily guiada:** ao criar a corrida, marque "Daily guiada" e o tempo de fala de cada pessoa. Na largada, a vez de falar passa de piloto em piloto, com cronômetro e as três perguntas da daily. A pessoa da vez e quem criou a corrida podem passar a vez antes do tempo.
- **Temporadas:** o placar abre na temporada do mês, com a opção "de sempre". Conquistas: 🏆 campeão da temporada, ⚡ volta mais rápida, 🥇 3 vitórias, 🎖 5 pódios, 🔁 10 dailys.
- **Ata da daily:** na tela de resultado, o botão "Ata da daily" abre as atas da sala da corrida.

## Tour e modo apresentação

- **Tour:** a câmera passa por cada bairro com uma legenda (e voz, no botão "Voz"), e no fim faz um quiz de 3 perguntas tiradas da cidade.
- **Apresentar:** tela cheia e limpa, com avanço automático.
- **Roteiro pelo Claude:** troca o texto padrão por uma narração escrita a partir da cidade e dos documentos.
- **Compartilhar:** "Copiar link" gera `?tour=1` ou `?apresentar=1`, que já abre tocando.

## Replay

Enquanto alguém está com a cidade aberta, ela grava a cada ~10 s quantos itens há em cada prédio e guarda 7 dias. O botão **Replay** abre uma linha do tempo de 1 a 48 horas, com o gráfico do total de itens e os incidentes marcados em vermelho. Dá para arrastar ou tocar a 20×, 60× ou 300×. Durante o replay, os prédios crescem com a fila gravada e os incidentes daquele momento pegam fogo.

## Conversa de corredor e áudio espacial

- **Conversa de corredor:** andando pela cidade, quando outra pessoa está a poucos passos, aparece o convite "está bem aqui, conversar?", que abre uma chamada direta compacta.
- **Áudio espacial:** numa chamada, o volume de cada pessoa cai com a distância entre os bonecos na cidade.

## Planos

A página `/precos.html` mostra os planos Grátis, Time e Empresa. Os preços são provisórios.

- **Limites:** só valem com `PLANOS=1` no servidor, e por padrão estão desligados. São três: pessoas por equipe, cidades do GitHub por mês e perguntas por dia à cidade.
- **Mudar o plano de uma equipe:** `node servidor/planos.mjs <id da equipe> time`.

## Custos de IA

Toda chamada ao Claude fica registrada em `uso_ia`, com quem pediu, o tipo (cidade, auditoria, juntar projetos, ata, pergunta, incidente, agente), os tokens, o custo em dólar e o tempo:

- **Pela API:** o custo é calculado pelos tokens. Os preços por milhão de tokens podem ser trocados com `CUSTO_ENTRADA`, `CUSTO_SAIDA`, `CUSTO_CACHE_LEITURA` e `CUSTO_CACHE_ESCRITA`.
- **Pelo Claude Code local:** o custo vem do próprio CLI.

Os e-mails em `ADMINS` veem `/admin.html`. Lá ficam o custo total, o custo por dia, por tipo e por pessoa (em dólar e em reais), as assinaturas ativas e a receita menos o custo.

Com `PLANOS=1`, cada plano também tem um teto de custo de IA por pessoa no mês: US$ 1 no Grátis, US$ 4 no Pro e US$ 8 no Time. Esse teto protege a conta de quem usa muito acima da média.

## Testes de navegador

`e2e/` tem testes com Playwright. Eles sobem o servidor com um banco descartável e usam o site como uma pessoa usaria: cadastro, equipe, convite pelo nick, a cidade desenhando e o layout no celular. No CI, eles rodam a cada push, e o deploy só acontece se passarem. Para rodar local: `cd e2e && npm install && npx playwright install chromium && npx playwright test`.
