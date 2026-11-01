# Encontros: pessoas, conversas, reuniões e chamadas na cidade

Com o servidor ligado, a cidade ganha o botão **Encontros**:

- **Contas** com nome, nick único, e-mail e senha. Dá para entrar com o e-mail ou com o nick.
- **Equipes** (página `/equipes.html`): criar equipe, adicionar pessoas pelo nick com busca, papéis de dono, admin e membro, passar a equipe adiante e sair. Cada equipe tem conversa e chamada próprias.
- **Pessoas**: quem tem conta, quem está online e quem está andando nesta cidade. Cada pessoa que anda pela cidade aparece como um boneco com o nome dela.
- **Conversas**: diretas entre duas pessoas e em grupo, com histórico, contador de não lidas e aviso de "digitando".
- **Agenda**: marcar reunião com data, duração, pauta e convidados. Cada convidado responde vou, talvez ou não vou, e a reunião tem a própria conversa. O botão "Entrar" aparece 10 minutos antes do início.
- **Chamadas** de voz e vídeo, com compartilhamento de tela, em qualquer conversa ou reunião. Quem é da conversa recebe o aviso de que há uma chamada acontecendo.
- **Transcrição e atas**: em qualquer chamada, o botão **Transcrever** passa tudo o que é dito para texto, com legendas ao vivo para quem está na chamada. No fim, o **Claude que roda na sua máquina** lê a transcrição e escreve uma ata em markdown com resumo, decisões, atividades (com responsável e prazo), **candidatos a ticket** e pendências. A ata pode ser baixada (`.md`), copiada ou mandada para alguém numa conversa direta.

## Rodar

```bash
cd servidor
npm install
npm start            # http://localhost:4400 — landing, login, equipes, a cidade (/cidade.html), a API e o tempo real no mesmo endereço
npm test             # testes de contas, conversas, reuniões, chamada e presença
```

Variáveis de ambiente:

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `PORTA` | `4400` | porta HTTP |
| `BANCO` | `servidor/dados/encontros.db` | arquivo SQLite (fica fora do git) |
| `ORIGENS` | todas | lista separada por vírgula dos endereços de onde a cidade pode ser aberta. Em produção, preencha. |
| `SEGURO` | — | `1` marca o cookie de sessão como `Secure`. Use atrás de HTTPS. |

## Na rede local, para os amigos entrarem

O navegador só libera câmera, microfone e transcrição em HTTPS (a exceção é `localhost`). Para quem entra de outro computador:

```bash
cd servidor
node certificado.mjs     # uma vez: gera dados/cert/ para localhost e os IPs desta máquina
npm start                # agora sobe em HTTPS e mostra os endereços da rede
```

Mande o endereço `https://<seu-ip>:4400` para quem está na mesma rede (Wi-Fi ou cabo). Na primeira vez, o navegador avisa que o certificado não é conhecido: é só clicar em **Avançado → Continuar**. Se o macOS perguntar se o `node` pode receber conexões, permita. Se a rede mudar de IP, rode `node certificado.mjs` de novo.

Para gente de fora da sua rede, o caminho é um túnel (Cloudflare Tunnel, Tailscale) ou hospedar o servidor.

## Transcrição e atas: como funciona

- Cada navegador transcreve **só o microfone da própria pessoa**, com a Web Speech API, e manda as frases ao servidor. Funciona no Chrome e no Edge. No Chrome, o reconhecimento de voz é feito pelos servidores do Google. Microfone mudo não transcreve.
- Quem liga a transcrição liga para a chamada toda, e todos veem o aviso. Ela desliga sozinha quando a chamada esvazia.
- A ata pega as falas que ainda não viraram ata naquela conversa. O servidor roda `claude -p` (Claude Code, sem nenhuma ferramenta ligada) com um pedido que o proíbe de inventar tarefas, responsáveis ou prazos. Leva de 30 segundos a 2 minutos.
- Os **candidatos a ticket** são sugestões numa tabela (título, tipo, prioridade, responsável, descrição): quem lê decide o que vira ticket.

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `SISTEMA_TICKETS` | `o sistema de tickets` | nome do seu sistema de tickets na ata (ex.: `Jira`) |
| `CLAUDE_CMD` | `claude` | caminho do Claude Code |
| `CLAUDE_MODELO` | o do Claude Code | fixar um modelo para as atas |
| `HTTPS` | ligado se houver certificado | `0` força HTTP |

Numa hospedagem estática (sem o servidor), o botão Encontros simplesmente não aparece, e o resto da cidade funciona igual.

## Como funciona

```
navegador ──HTTP /api──▶ servidor ── SQLite (contas, sessões, salas, mensagens, reuniões)
    │  ▲                   │
    └──┴──WebSocket /ws────┘   presença, mensagens novas, convites, sinais da chamada
    │
    └──── WebRTC ────▶ outro navegador   (áudio, vídeo e tela vão direto, sem passar pelo servidor)
```

- **Senhas** com scrypt e sal por usuário. A **sessão** fica num cookie `HttpOnly` e `SameSite=Lax`, que dura 30 dias.
- **Permissões**: só quem é membro lê ou escreve numa sala, entra na chamada dela ou troca sinais com outra pessoa da chamada.
- **Chamadas** em malha: cada par de pessoas tem a própria conexão. Funciona bem até umas 6 pessoas por chamada. Acima disso, o caminho é um SFU (por exemplo LiveKit ou mediasoup).
- **Redes corporativas** costumam bloquear a conexão direta. Para elas, configure um servidor TURN (por exemplo coturn) e informe na página, antes de `engine/encontros.js`:

```html
<script>window.SYSTEMCITY_ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:turn.minhaempresa.com:3478', username: '...', credential: '...' }];</script>
```

## API

| Rota | O que faz |
| --- | --- |
| `POST /api/cadastro` `{ email, nome, senha }` | cria a conta e já entra |
| `POST /api/entrar` `{ email, senha }` · `POST /api/sair` | sessão |
| `GET /api/eu` · `GET /api/pessoas` | quem sou e quem existe (com `online`) |
| `GET /api/salas` · `POST /api/salas` `{ nome, membros }` · `POST /api/diretas` `{ com }` | conversas |
| `GET /api/salas/:id/mensagens?antes=` · `POST /api/salas/:id/mensagens` `{ texto }` · `POST /api/salas/:id/lida` `{ ate }` | mensagens |
| `GET /api/salas/:id/transcricao` · `GET /api/salas/:id/atas` · `POST /api/salas/:id/atas` | transcrição ainda sem ata, atas da sala e gerar uma nova |
| `GET /api/atas/:id` · `GET /api/atas/:id.md` | a ata (JSON) e o arquivo `.md` para baixar |
| `PATCH /api/eu` `{ nome, nick }` · `GET /api/usuarios/busca?q=` | perfil e busca de pessoas por nick ou nome |
| `GET /api/equipes` · `POST /api/equipes` `{ nome }` · `GET`/`PATCH`/`DELETE /api/equipes/:id` | equipes |
| `POST /api/equipes/:id/membros` `{ nick }` · `PATCH /api/equipes/:id/membros/:u` `{ papel }` · `DELETE /api/equipes/:id/membros/:u` | membros: adicionar pelo nick, mudar papel (`admin`, `membro`, `dono` passa a equipe), remover ou sair |
| `GET /api/reunioes` · `POST /api/reunioes` `{ titulo, descricao, inicio, fim, convidados }` · `POST /api/reunioes/:id/resposta` `{ resposta }` | agenda |

As mensagens do tempo real estão descritas no topo de `servidor/tempo-real.mjs`.
