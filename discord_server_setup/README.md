# Roblox Game Discord Server Setup (discord.py)

Builds a complete Discord server for a Roblox game: roles, categories, text
channels and voice channels, from the config at the top of `setup_server.py`.

## What gets created

| Category | Text channels | Voice channels |
|---|---|---|
| 📌 INFORMATION (read-only) | rules, announcements, updates, welcome, game-link, roles | — |
| 💬 COMMUNITY | general, screenshots, memes, off-topic, bot-commands | Lounge, Music, Chill (10) |
| 🎮 GAME | game-discussion, looking-for-group, trading, achievements, suggestions | Squad 1–3 (4 each), Duo (2) |
| 🛠️ SUPPORT | bug-reports, help, report-player, ban-appeals | Support |
| 🎉 EVENTS | events, giveaways | Event Voice |
| 🧪 TESTING (private: staff + Tester) | test-builds, tester-feedback | Testing Voice |
| 💻 DEVELOPMENT (private: Owner + Developer) | dev-chat, scripting, building, ui-design, todo | Dev Meeting |
| 🛡️ STAFF (private: Owner, Developer, Admin, Moderator) | staff-chat, mod-logs | Staff Meeting |

**Roles:** Owner, Developer, Admin, Moderator, Tester, Content Creator, VIP, Member.

`#welcome` is set as the server's system channel (join and boost messages).

## How to use

1. Create an empty Discord server (**+** button → "Create My Own").
   > Discord no longer lets bots create servers, so the bot builds the layout
   > inside a server you created.
2. At <https://discord.com/developers/applications> create an application → **Bot** → copy the token.
3. In **OAuth2 → URL Generator**, tick `bot` and the `Administrator` permission, open the URL and add the bot to your server.
4. Install and configure:
   ```bash
   cd discord_server_setup
   pip install -r requirements.txt
   cp .env.example .env   # fill in DISCORD_TOKEN and GUILD_ID
   ```
5. Run:
   ```bash
   python setup_server.py --dry-run   # preview
   python setup_server.py             # create whatever is missing (safe to re-run)
   python setup_server.py --reset     # delete every channel and rebuild from scratch
   ```

## Customising

Edit the `ROLES`, `STAFF_ROLES` and `LAYOUT` lists at the top of `setup_server.py`.
