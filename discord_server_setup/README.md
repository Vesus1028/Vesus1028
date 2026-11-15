# Setup automático de servidor Discord (discord.py)

Cria cargos, categorias, canais de texto e canais de voz organizados, a partir
da configuração no topo de `setup_server.py`.

## Estrutura criada

| Categoria | Texto | Voz |
|---|---|---|
| 📌 INFORMAÇÕES (só leitura) | regras, anúncios, boas-vindas | — |
| 💬 COMUNIDADE | geral, mídia, comandos, sugestões | Geral, Música, Bate-papo |
| 🎮 JOGOS | jogos-geral, procurando-grupo | Squad 1, Squad 2, Duo |
| 📚 ESTUDOS | estudos-geral, programação | Sala de Estudos, Foco Silencioso |
| 🛡️ STAFF (privada) | staff-chat, logs | Reunião Staff |

Cargos: **Admin**, **Moderador**, **Membro**.

## Como usar

1. Crie um servidor vazio no Discord (botão **+** → "Criar o meu").
   > A API do Discord não permite mais que bots criem servidores, então o bot
   > monta a estrutura dentro de um servidor que você já criou.
2. Em <https://discord.com/developers/applications> crie uma aplicação → **Bot** → copie o token.
3. Em **OAuth2 → URL Generator**, marque `bot` e a permissão `Administrator`, abra a URL e adicione o bot ao servidor.
4. Instale e configure:
   ```bash
   cd discord_server_setup
   pip install -r requirements.txt
   cp .env.example .env   # preencha DISCORD_TOKEN e GUILD_ID
   ```
5. Execute:
   ```bash
   python setup_server.py --dry-run   # pré-visualiza
   python setup_server.py             # cria o que falta (pode rodar várias vezes)
   python setup_server.py --reset     # apaga todos os canais e recria do zero
   ```

Para personalizar, edite as listas `CARGOS` e `ESTRUTURA` no início do script.
