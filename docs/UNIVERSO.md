# Universo, linha do tempo e agente de código

## Universo: vários repositórios num mapa só

Na página **Cidades**, em "Universo", dê um nome e cole os repositórios, um por linha. Cada repositório vira a cidade dele, e o universo põe todas lado a lado, com um marco alto com o nome do repositório na entrada de cada região. O Claude lê o resumo de cada uma e desenha as **ligações entre os repositórios**: o front que chama a API, o worker que lê a fila do outro serviço, a lib compartilhada. Elas viram ruas cor-de-rosa entre as regiões. Se ele não achar ligação, não inventa uma.

- **Abrir:** `cidade.html?u=<slug>`. Tudo da cidade funciona no universo: Perguntar, Tour, Apresentar, incidentes, Encontros e The Grid.
- **Repositório novo:** "+ repo" adiciona outro, e as ligações são redesenhadas. "Religar" redesenha as ligações sem regerar as cidades.
- **Limite:** até 12 repositórios por universo.

## Linha do tempo do git

O botão **Linha do tempo** busca os commits no GitHub e guarda no banco: na segunda vez, só os novos. Cada arquivo alterado é ligado ao bairro onde mora, pelas pastas que o Claude mapeou ao gerar a cidade. Ao tocar:

- **Nascimento:** cada bairro aparece no primeiro commit que mexe nele. A cidade nasce e cresce.
- **Crescimento:** as estações ficam mais altas conforme o volume de linhas mudadas.
- **Pulso:** os prédios do bairro tocado piscam a cada commit, e o cartão mostra a mensagem, o autor, o repositório, o sha e as linhas.
- **Gráfico:** mostra o ritmo do time, dia a dia.

**Limites do GitHub:** com o GitHub conectado (token de leitura), lê até 300 commits por repositório, com os arquivos de cada um. Sem token, o GitHub permite só 60 consultas por hora no total, e a leitura do repositório já gasta boa parte delas. **Conecte o GitHub.**

**Cidades antigas:** cidades geradas antes desta versão não têm as pastas mapeadas, e os commits delas ficam "fora dos bairros mapeados". Use **Regerar** na página Cidades.

## Agente de código

O botão **Agente** abre o painel. O dev escreve o pedido ("o frete fica errado quando muda o CEP; corrija e adicione um teste"), com o bairro que está apontando na cidade como contexto. No universo, escolhe também o repositório.

1. **O Claude explora sozinho:** lista pastas, lê arquivos e busca no código. Cada passo aparece ao vivo no painel, para todo mundo da equipe.
2. **Propõe, sem gravar:** as alterações vêm com o conteúdo completo de cada arquivo e ficam guardadas na sessão. Nada vai para o GitHub ainda. O dev abre o **diff** de cada arquivo e pode descartar o que não quer.
3. **Conversa:** o dev responde ("usa a função X", "falta o teste do caso Y") e o agente continua de onde parou. O botão **Parar** interrompe.
4. **O dev aprova:** "Abrir PR com estas alterações" cria a branch `systemcity/agente-<id>`, faz um commit só e abre o Pull Request, com a lista dos arquivos e de quem revisou. **A branch principal nunca é tocada.**

**O que precisa:**
- **`ANTHROPIC_API_KEY` no servidor:** o agente usa ferramentas e não roda pelo Claude Code local.
- **GitHub conectado por quem pede:** para trabalhar, o token só precisa de leitura. Para abrir o PR, precisa de permissão de escrita em **Contents** e **Pull requests** naquele repositório.
- **Limite de voltas:** o agente para depois de 30 voltas e pergunta se é para continuar. Os pedidos ao Claude contam no limite por hora de cada pessoa (`IA_POR_HORA`, padrão 60).
- **O agente não roda o código:** ele diz o que o dev deve rodar para conferir. Rode os testes antes de aprovar o PR.
