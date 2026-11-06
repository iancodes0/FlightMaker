# FlightMaker Discord Bot

A Discord bot that automatically welcomes members when they join a server.

The project website is available at
[iancodes0.github.io/FlightMaker](https://iancodes0.github.io/FlightMaker/).

The Turkish Airlines PTFS site includes a Discord sign-in flow, public flight
booking page, and staff-only flight management page. Configure
`DISCORD_CLIENT_SECRET` and `SESSION_SECRET` in the Railway service variables
before enabling bookings or staff access.

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and replace the placeholder with your bot token:

   ```env
   TURKISH_TOKEN=your-turkish-bot-token-here
   ```

   `DISCORD_TOKEN` is supported as a fallback for older deployments.

3. Enable the **Server Members Intent** for the bot in the Discord Developer Portal.

4. Invite the bot with permission to view and send messages in the channel where welcomes should be posted.
   Grant it **Manage Events** if you want it to create scheduled events with `/event`.

5. Start the bot:

   ```sh
   npm start
   ```

The bot posts welcome messages in channel `1568359911425974513`. New members
receive a Turkish Airlines-themed generated welcome card containing their
display name and current profile picture. The bot needs View
Channel, Send Messages, and Attach Files permissions in that channel. After
updating the bot, restart the running process so the new join handler is loaded.

### Customize the welcome card

The card's size, colors, text, and layout are configured in the `WELCOME_CARD`
object and `createWelcomeCard` function in
[`src/index.js`](src/index.js). The image is generated in memory and uploaded
as `welcome-card.png`; no profile pictures are stored by the bot.

## Commands

- `/about` — Explains Turkish Airlines PTFS and its goal of reflecting the spirit of the real airline.

The bot also maintains a support-ticket panel in Discord channel
`1567000517283020844`. Users can click **Create Support Ticket** to open one
private support channel, which includes a close button and an `@everyone`
notification identifying the user who created it.
Set `TICKET_PANEL_CHANNEL_ID` to a channel the bot can access if this default
channel is unavailable. The bot will still start and all other commands will
remain available when the panel channel cannot be accessed.

The commands are registered globally automatically when the bot connects, so
they are available in every server where the bot is installed. Discord may take
up to an hour to propagate newly registered global commands.

## Run continuously with systemd or `service`

For a 24/7 deployment, run the bot on an always-on Linux VPS or VM. A Codespace may
sleep or stop, so it cannot guarantee continuous uptime.

The repository includes a systemd service at
[`deploy/flightmaker.service`](deploy/flightmaker.service). The example below
installs the bot at `/opt/flightmaker` and runs it as a restricted `flightmaker`
user:

```sh
sudo useradd --system --home /opt/flightmaker --shell /usr/sbin/nologin flightmaker
sudo mkdir -p /opt/flightmaker /etc/flightmaker
sudo git clone https://github.com/iancodes0/FlightMaker.git /opt/flightmaker
sudo chown -R flightmaker:flightmaker /opt/flightmaker
sudo -u flightmaker npm --prefix /opt/flightmaker ci --omit=dev

sudo sh -c 'printf "DISCORD_TOKEN=%s\n" "your-bot-token-here" > /etc/flightmaker/flightmaker.env'
sudo chmod 600 /etc/flightmaker/flightmaker.env
sudo cp /opt/flightmaker/deploy/flightmaker.service /etc/systemd/system/flightmaker.service
sudo systemctl daemon-reload
sudo systemctl enable --now flightmaker
```

Check the service and follow its logs with:

```sh
systemctl status flightmaker
journalctl -u flightmaker -f
```

The service starts at boot and automatically restarts if the bot exits unexpectedly.
Keep the token in `/etc/flightmaker/flightmaker.env`; do not commit it to Git.

## Deploy with Railway

1. Create a Railway project from this repository.
2. Add the variable `TURKISH_TOKEN` in the service's **Variables** settings.
   `DISCORD_TOKEN` remains supported as a fallback for older deployments.
3. Deploy the service. Railway uses [`railway.json`](railway.json) and runs `npm start`.

The service is configured to restart after failed exits. Railway's local filesystem is
ephemeral, so use a Railway volume mounted at `/app/data` if flight records must
survive redeployments.

### Containers without systemd

If the host reports that systemd is not running, install the included SysV init
script and use `service` instead:

```sh
sudo cp /opt/flightmaker/deploy/flightmaker /etc/init.d/flightmaker
sudo chmod 755 /etc/init.d/flightmaker
sudo service flightmaker start
sudo service flightmaker status
```

Restart after deploying updates:

```sh
sudo service flightmaker restart
```

The init script writes bot output to `/var/log/flightmaker.log`. Unlike
systemd, a basic SysV init script does not restart the process after an
unexpected crash; use the container platform's restart policy for that.
A container still needs an external supervisor or an always-running host to
remain online after the container exits or the workspace sleeps.
