"""
Builds a Discord server for a Roblox game from scratch: roles, categories,
text channels and voice channels, based on the ROLES and LAYOUT config below.

Usage:
    1. Create a bot at https://discord.com/developers/applications
    2. Invite it to an empty server with the Administrator permission
    3. Fill in the .env file (see .env.example)
    4. python setup_server.py            -> creates whatever is missing
       python setup_server.py --reset    -> deletes ALL channels and rebuilds everything
       python setup_server.py --dry-run  -> only prints what would be done
"""

import argparse
import logging
import os
import sys

import discord
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("setup")

REASON = "Automatic server setup"

# ---------------------------------------------------------------------------
# Server configuration - edit freely.
# ---------------------------------------------------------------------------

# Roles are created top to bottom (highest first).
# (name, hex colour, display separately, permissions)
ROLES = [
    ("Owner", 0xF1C40F, True, discord.Permissions(administrator=True)),
    ("Developer", 0x9B59B6, True, discord.Permissions(administrator=True)),
    ("Admin", 0xE74C3C, True, discord.Permissions(administrator=True)),
    ("Moderator", 0x3498DB, True, discord.Permissions(
        manage_messages=True, kick_members=True, ban_members=True,
        mute_members=True, move_members=True, moderate_members=True,
        manage_threads=True)),
    ("Tester", 0x1ABC9C, True, discord.Permissions.none()),
    ("Content Creator", 0xE91E63, True, discord.Permissions.none()),
    ("VIP", 0xE67E22, True, discord.Permissions.none()),
    ("Member", 0x2ECC71, False, discord.Permissions.none()),
]

# Roles allowed to post in read-only categories.
STAFF_ROLES = ["Owner", "Developer", "Admin", "Moderator"]

# Each category:
#   "text":  list of (name, topic)
#   "voice": list of (name, user limit; 0 = unlimited)
#   "read_only": everyone can read and react, only STAFF_ROLES can post
#   "private": only "allowed_roles" can see the category
LAYOUT = [
    {
        "category": "📌 INFORMATION",
        "read_only": True,
        "text": [
            ("📜rules", "Read the rules before chatting. Breaking them may lead to a ban."),
            ("📢announcements", "Official news about the game."),
            ("🆕updates", "Patch notes and changelogs for every game update."),
            ("👋welcome", "Welcome to the community!"),
            ("🔗game-link", "Play the game on Roblox - link and info here."),
            ("🎭roles", "Information about server roles and how to get them."),
        ],
        "voice": [],
    },
    {
        "category": "💬 COMMUNITY",
        "text": [
            ("💬general", "General chat. Keep it friendly!"),
            ("📸screenshots", "Share your in-game screenshots and clips."),
            ("😂memes", "Game memes and funny moments."),
            ("🗨️off-topic", "Talk about anything else."),
            ("🤖bot-commands", "Use bot commands here."),
        ],
        "voice": [
            ("🔊 Lounge", 0),
            ("🎵 Music", 0),
            ("☕ Chill", 10),
        ],
    },
    {
        "category": "🎮 GAME",
        "text": [
            ("🎮game-discussion", "Talk about the game, strategies and tips."),
            ("🤝looking-for-group", "Find people to play with. Share your server link here."),
            ("💰trading", "Trade in-game items. Scamming results in a ban."),
            ("🏆achievements", "Show off your wins, records and rare drops."),
            ("💡suggestions", "Suggest new features and improvements for the game."),
        ],
        "voice": [
            ("🎮 Squad 1", 4),
            ("🎮 Squad 2", 4),
            ("🎮 Squad 3", 4),
            ("👥 Duo", 2),
        ],
    },
    {
        "category": "🛠️ SUPPORT",
        "text": [
            ("🐛bug-reports", "Report bugs: what happened, steps to reproduce, device and screenshots."),
            ("❓help", "Questions about the game? Ask here."),
            ("🚨report-player", "Report exploiters or rule breakers with their username and proof."),
            ("⚖️ban-appeals", "Appeal a game or server ban."),
        ],
        "voice": [
            ("🎧 Support", 0),
        ],
    },
    {
        "category": "🎉 EVENTS",
        "text": [
            ("📅events", "Upcoming in-game and community events."),
            ("🎁giveaways", "Giveaways for Robux, items and game passes."),
        ],
        "voice": [
            ("🎤 Event Voice", 0),
        ],
    },
    {
        "category": "🧪 TESTING",
        "private": True,
        "allowed_roles": ["Owner", "Developer", "Admin", "Moderator", "Tester"],
        "text": [
            ("🧪test-builds", "Access to test places and new features before release."),
            ("📝tester-feedback", "Feedback on test builds."),
        ],
        "voice": [
            ("🧪 Testing Voice", 0),
        ],
    },
    {
        "category": "💻 DEVELOPMENT",
        "private": True,
        "allowed_roles": ["Owner", "Developer"],
        "text": [
            ("💻dev-chat", "Development team discussion."),
            ("📜scripting", "Luau scripting, systems and code review."),
            ("🏗️building", "Maps, models and builds."),
            ("🎨ui-design", "UI, icons and thumbnails."),
            ("📋todo", "Roadmap and task list."),
        ],
        "voice": [
            ("💻 Dev Meeting", 0),
        ],
    },
    {
        "category": "🛡️ STAFF",
        "private": True,
        "allowed_roles": ["Owner", "Developer", "Admin", "Moderator"],
        "text": [
            ("🛡️staff-chat", "Staff discussion."),
            ("📋mod-logs", "Moderation logs."),
        ],
        "voice": [
            ("🛡️ Staff Meeting", 0),
        ],
    },
]


# ---------------------------------------------------------------------------
async def create_roles(guild: discord.Guild, dry_run: bool) -> dict[str, discord.Role]:
    roles: dict[str, discord.Role] = {}
    for name, colour, hoist, perms in ROLES:
        existing = discord.utils.get(guild.roles, name=name)
        if existing:
            log.info("Role already exists: %s", name)
            roles[name] = existing
            continue
        log.info("Creating role: %s", name)
        if not dry_run:
            roles[name] = await guild.create_role(
                name=name, colour=discord.Colour(colour), hoist=hoist,
                permissions=perms, mentionable=True, reason=REASON,
            )
    return roles


def build_overwrites(guild: discord.Guild, cfg: dict, roles: dict[str, discord.Role]):
    everyone = guild.default_role
    overwrites: dict = {}
    if cfg.get("private"):
        overwrites[everyone] = discord.PermissionOverwrite(view_channel=False)
        for name in cfg.get("allowed_roles", []):
            if name in roles:
                overwrites[roles[name]] = discord.PermissionOverwrite(view_channel=True, connect=True)
        overwrites[guild.me] = discord.PermissionOverwrite(view_channel=True, manage_channels=True)
    elif cfg.get("read_only"):
        overwrites[everyone] = discord.PermissionOverwrite(
            send_messages=False, create_public_threads=False, add_reactions=True)
        overwrites[guild.me] = discord.PermissionOverwrite(send_messages=True)
        for name in STAFF_ROLES:
            if name in roles:
                overwrites[roles[name]] = discord.PermissionOverwrite(send_messages=True)
    return overwrites


async def delete_everything(guild: discord.Guild, dry_run: bool) -> None:
    log.warning("Deleting %d existing channels...", len(guild.channels))
    for channel in list(guild.channels):
        log.info("  deleting: %s", channel.name)
        if not dry_run:
            try:
                await channel.delete(reason=REASON + " (reset)")
            except discord.HTTPException as e:
                log.error("  could not delete %s: %s", channel.name, e)


async def build_server(guild: discord.Guild, reset: bool, dry_run: bool) -> None:
    log.info("Setting up server: %s (id %s)", guild.name, guild.id)
    if reset:
        await delete_everything(guild, dry_run)

    roles = await create_roles(guild, dry_run)

    for position, cfg in enumerate(LAYOUT):
        cat_name = cfg["category"]
        overwrites = build_overwrites(guild, cfg, roles) if not dry_run else {}

        category = None if reset else discord.utils.get(guild.categories, name=cat_name)
        if category:
            log.info("Category already exists: %s", cat_name)
        else:
            log.info("Creating category: %s", cat_name)
            if not dry_run:
                category = await guild.create_category(
                    cat_name, overwrites=overwrites, position=position, reason=REASON)

        existing = {c.name for c in category.channels} if category else set()

        for name, topic in cfg.get("text", []):
            if name in existing:
                log.info("  #%s already exists", name)
                continue
            log.info("  + text   #%s", name)
            if not dry_run:
                await category.create_text_channel(name, topic=topic, reason=REASON)

        for name, limit in cfg.get("voice", []):
            if name in existing:
                log.info("  🔊%s already exists", name)
                continue
            log.info("  + voice  🔊%s (limit: %s)", name, limit or "unlimited")
            if not dry_run:
                await category.create_voice_channel(name, user_limit=limit, reason=REASON)

    # Use #welcome as the server's system channel (join messages, boosts).
    if not dry_run:
        welcome = discord.utils.find(lambda c: "welcome" in c.name, guild.text_channels)
        if welcome:
            try:
                await guild.edit(system_channel=welcome, reason=REASON)
                log.info("System channel set to #%s", welcome.name)
            except discord.HTTPException as e:
                log.warning("Could not set the system channel: %s", e)

    log.info("✅ Server setup complete!")


# ---------------------------------------------------------------------------
class SetupClient(discord.Client):
    def __init__(self, guild_id: int, reset: bool, dry_run: bool):
        super().__init__(intents=discord.Intents.default())
        self.guild_id, self.reset, self.dry_run = guild_id, reset, dry_run
        self.ok = False

    async def on_ready(self):
        log.info("Logged in as %s", self.user)
        try:
            guild = self.get_guild(self.guild_id)
            if guild is None:
                log.error("The bot is not in server %s. Invite it first.", self.guild_id)
                return
            if not guild.me.guild_permissions.administrator:
                log.error("The bot needs the Administrator permission in this server.")
                return
            await build_server(guild, self.reset, self.dry_run)
            self.ok = True
        except Exception:
            log.exception("Error during setup")
        finally:
            await self.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Builds a Discord server for a Roblox game.")
    parser.add_argument("--reset", action="store_true",
                        help="DELETE all existing channels before building the layout")
    parser.add_argument("--dry-run", action="store_true",
                        help="Only print what would be done, without changing anything")
    args = parser.parse_args()

    load_dotenv()
    token = os.getenv("DISCORD_TOKEN")
    guild_id = os.getenv("GUILD_ID")
    if not token or not guild_id:
        log.error("Set DISCORD_TOKEN and GUILD_ID in the .env file (see .env.example).")
        return 1

    if args.reset and not args.dry_run:
        answer = input("⚠️  --reset will DELETE ALL channels in the server. Type 'yes' to continue: ")
        if answer.strip().lower() != "yes":
            log.info("Cancelled.")
            return 0

    client = SetupClient(int(guild_id), args.reset, args.dry_run)
    try:
        client.run(token, log_handler=None)
    except discord.LoginFailure:
        log.error("Invalid token. Check DISCORD_TOKEN.")
        return 1
    return 0 if client.ok else 1


if __name__ == "__main__":
    sys.exit(main())
