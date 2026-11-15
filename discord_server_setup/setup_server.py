"""
Monta a estrutura de um servidor do Discord do zero: cargos, categorias,
canais de texto e canais de voz, a partir da configuração em ESTRUTURA.

Uso:
    1. Crie um bot em https://discord.com/developers/applications
    2. Convide-o para um servidor vazio com permissão de Administrador
    3. Preencha o arquivo .env (veja .env.example)
    4. python setup_server.py            -> cria o que estiver faltando
       python setup_server.py --reset    -> apaga TODOS os canais e recria tudo
       python setup_server.py --dry-run  -> só mostra o que seria feito
"""

import argparse
import asyncio
import logging
import os
import sys

import discord
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("setup")

# ---------------------------------------------------------------------------
# Configuração da estrutura do servidor — edite à vontade.
#   "texto": lista de canais de texto  -> (nome, tópico)
#   "voz":   lista de canais de voz    -> (nome, limite de usuários; 0 = sem limite)
#   "somente_leitura": membros comuns não podem enviar mensagens
#   "privada": só os cargos listados em "cargos_com_acesso" enxergam a categoria
# ---------------------------------------------------------------------------
CARGOS = [
    # (nome, cor hex, exibir separado, permissões)
    ("Admin", 0xE74C3C, True, discord.Permissions(administrator=True)),
    ("Moderador", 0x3498DB, True, discord.Permissions(
        manage_messages=True, kick_members=True, mute_members=True,
        move_members=True, moderate_members=True)),
    ("Membro", 0x2ECC71, False, discord.Permissions.none()),
]

ESTRUTURA = [
    {
        "categoria": "📌 INFORMAÇÕES",
        "somente_leitura": True,
        "texto": [
            ("📜regras", "Leia as regras antes de participar."),
            ("📢anúncios", "Novidades e avisos oficiais."),
            ("👋boas-vindas", "Seja bem-vindo(a) ao servidor!"),
        ],
        "voz": [],
    },
    {
        "categoria": "💬 COMUNIDADE",
        "texto": [
            ("💬geral", "Conversa livre."),
            ("🖼️mídia", "Compartilhe imagens, vídeos e memes."),
            ("🤖comandos", "Use os comandos de bots aqui."),
            ("💡sugestões", "Ideias para melhorar o servidor."),
        ],
        "voz": [
            ("🔊 Geral", 0),
            ("🎵 Música", 0),
            ("☕ Bate-papo", 10),
        ],
    },
    {
        "categoria": "🎮 JOGOS",
        "texto": [
            ("🎮jogos-geral", "Fale sobre qualquer jogo."),
            ("🤝procurando-grupo", "Encontre pessoas para jogar."),
        ],
        "voz": [
            ("🎮 Squad 1", 5),
            ("🎮 Squad 2", 5),
            ("🎮 Duo", 2),
        ],
    },
    {
        "categoria": "📚 ESTUDOS",
        "texto": [
            ("📚estudos-geral", "Dúvidas e materiais de estudo."),
            ("💻programação", "Código, projetos e ajuda técnica."),
        ],
        "voz": [
            ("📖 Sala de Estudos", 0),
            ("🔇 Foco Silencioso", 0),
        ],
    },
    {
        "categoria": "🛡️ STAFF",
        "privada": True,
        "cargos_com_acesso": ["Admin", "Moderador"],
        "texto": [
            ("🛡️staff-chat", "Conversa da equipe."),
            ("📋logs", "Registros de moderação."),
        ],
        "voz": [
            ("🛡️ Reunião Staff", 0),
        ],
    },
]


# ---------------------------------------------------------------------------
async def criar_cargos(guild: discord.Guild, dry_run: bool) -> dict[str, discord.Role]:
    cargos: dict[str, discord.Role] = {}
    for nome, cor, separado, perms in CARGOS:
        existente = discord.utils.get(guild.roles, name=nome)
        if existente:
            log.info("Cargo já existe: %s", nome)
            cargos[nome] = existente
            continue
        log.info("Criando cargo: %s", nome)
        if not dry_run:
            cargos[nome] = await guild.create_role(
                name=nome, colour=discord.Colour(cor), hoist=separado,
                permissions=perms, mentionable=True, reason="Setup automático",
            )
    return cargos


def montar_overwrites(guild: discord.Guild, cfg: dict, cargos: dict[str, discord.Role]):
    everyone = guild.default_role
    ow: dict = {}
    if cfg.get("privada"):
        ow[everyone] = discord.PermissionOverwrite(view_channel=False)
        for nome in cfg.get("cargos_com_acesso", []):
            if nome in cargos:
                ow[cargos[nome]] = discord.PermissionOverwrite(view_channel=True, connect=True)
        ow[guild.me] = discord.PermissionOverwrite(view_channel=True, manage_channels=True)
    elif cfg.get("somente_leitura"):
        ow[everyone] = discord.PermissionOverwrite(send_messages=False, add_reactions=True)
        ow[guild.me] = discord.PermissionOverwrite(send_messages=True)
        for nome in ("Admin", "Moderador"):
            if nome in cargos:
                ow[cargos[nome]] = discord.PermissionOverwrite(send_messages=True)
    return ow


async def apagar_tudo(guild: discord.Guild, dry_run: bool) -> None:
    log.warning("Apagando %d canais existentes...", len(guild.channels))
    for canal in list(guild.channels):
        log.info("  removendo: %s", canal.name)
        if not dry_run:
            try:
                await canal.delete(reason="Reset do setup automático")
            except discord.HTTPException as e:
                log.error("  não foi possível remover %s: %s", canal.name, e)


async def montar_servidor(guild: discord.Guild, reset: bool, dry_run: bool) -> None:
    log.info("Configurando servidor: %s (id %s)", guild.name, guild.id)
    if reset:
        await apagar_tudo(guild, dry_run)

    cargos = await criar_cargos(guild, dry_run)

    for posicao, cfg in enumerate(ESTRUTURA):
        nome_cat = cfg["categoria"]
        overwrites = montar_overwrites(guild, cfg, cargos) if not dry_run else {}

        categoria = None if reset else discord.utils.get(guild.categories, name=nome_cat)
        if categoria:
            log.info("Categoria já existe: %s", nome_cat)
        else:
            log.info("Criando categoria: %s", nome_cat)
            if not dry_run:
                categoria = await guild.create_category(
                    nome_cat, overwrites=overwrites, position=posicao,
                    reason="Setup automático",
                )

        existentes = {c.name for c in categoria.channels} if categoria else set()

        for nome, topico in cfg.get("texto", []):
            if nome in existentes:
                log.info("  #%s já existe", nome)
                continue
            log.info("  + texto  #%s", nome)
            if not dry_run:
                await categoria.create_text_channel(nome, topic=topico, reason="Setup automático")

        for nome, limite in cfg.get("voz", []):
            if nome in existentes:
                log.info("  🔊%s já existe", nome)
                continue
            log.info("  + voz    🔊%s (limite: %s)", nome, limite or "∞")
            if not dry_run:
                await categoria.create_voice_channel(nome, user_limit=limite, reason="Setup automático")

    # Define o canal de boas-vindas como canal de sistema do servidor
    if not dry_run:
        boas_vindas = discord.utils.find(lambda c: "boas-vindas" in c.name, guild.text_channels)
        if boas_vindas:
            try:
                await guild.edit(system_channel=boas_vindas, reason="Setup automático")
                log.info("Canal de sistema definido: #%s", boas_vindas.name)
            except discord.HTTPException as e:
                log.warning("Não foi possível definir o canal de sistema: %s", e)

    log.info("✅ Servidor configurado com sucesso!")


# ---------------------------------------------------------------------------
class SetupClient(discord.Client):
    def __init__(self, guild_id: int, reset: bool, dry_run: bool):
        intents = discord.Intents.default()
        intents.guilds = True
        super().__init__(intents=intents)
        self.guild_id, self.reset, self.dry_run = guild_id, reset, dry_run
        self.ok = False

    async def on_ready(self):
        log.info("Conectado como %s", self.user)
        try:
            guild = self.get_guild(self.guild_id)
            if guild is None:
                log.error("Bot não está no servidor %s. Convide-o primeiro.", self.guild_id)
                return
            if not guild.me.guild_permissions.administrator:
                log.error("O bot precisa da permissão de Administrador nesse servidor.")
                return
            await montar_servidor(guild, self.reset, self.dry_run)
            self.ok = True
        except Exception:
            log.exception("Erro durante a configuração")
        finally:
            await self.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Cria a estrutura de um servidor do Discord.")
    parser.add_argument("--reset", action="store_true",
                        help="APAGA todos os canais existentes antes de criar a estrutura")
    parser.add_argument("--dry-run", action="store_true",
                        help="Apenas mostra o que seria feito, sem alterar nada")
    args = parser.parse_args()

    load_dotenv()
    token = os.getenv("DISCORD_TOKEN")
    guild_id = os.getenv("GUILD_ID")
    if not token or not guild_id:
        log.error("Defina DISCORD_TOKEN e GUILD_ID no arquivo .env (veja .env.example).")
        return 1

    if args.reset and not args.dry_run:
        resp = input("⚠️  --reset vai APAGAR TODOS os canais do servidor. Digite 'sim' para continuar: ")
        if resp.strip().lower() != "sim":
            log.info("Cancelado.")
            return 0

    client = SetupClient(int(guild_id), args.reset, args.dry_run)
    try:
        client.run(token, log_handler=None)
    except discord.LoginFailure:
        log.error("Token inválido. Verifique DISCORD_TOKEN.")
        return 1
    return 0 if client.ok else 1


if __name__ == "__main__":
    sys.exit(main())
