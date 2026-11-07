require("dotenv").config();
require("./web-api");

const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const {
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ChannelType,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  PermissionsBitField,
  SlashCommandBuilder,
  ActionRowBuilder,
  ModalBuilder,
  Partials,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const token = process.env.TURKISH_TOKEN;
const expectedApplicationId = process.env.DISCORD_CLIENT_ID || "1568375825445822654";

if (!token) {
  console.error("Missing TURKISH_TOKEN. Add the Turkish bot token to the service variables before starting the bot.");
  process.exit(1);
}

const FLIGHTS_FILE = path.join(__dirname, "..", "data", "flights.json");
const PILOTS_FILE = path.join(__dirname, "..", "data", "pilots.json");
const WELCOME_CHANNEL_ID = "1568359911425974513";
const MOD_LOG_CHANNEL_ID = "1568381814064545792";
const TICKET_PANEL_CHANNEL_ID = process.env.TICKET_PANEL_CHANNEL_ID || "1567000517283020844";
const WELCOME_LOGO_FILE = path.join(
  __dirname,
  "..",
  "docs",
  "assets",
  "turkishairwaysptfs-logo.webp"
);

const loadFlights = () => {
  try {
    return JSON.parse(fs.readFileSync(FLIGHTS_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
};

const saveFlights = (flights) => {
  fs.mkdirSync(path.dirname(FLIGHTS_FILE), { recursive: true });
  fs.writeFileSync(FLIGHTS_FILE, `${JSON.stringify(flights, null, 2)}\n`);
};

const flights = loadFlights();

const loadPilots = () => {
  try {
    return JSON.parse(fs.readFileSync(PILOTS_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
};

const savePilots = (pilots) => {
  fs.mkdirSync(path.dirname(PILOTS_FILE), { recursive: true });
  fs.writeFileSync(PILOTS_FILE, `${JSON.stringify(pilots, null, 2)}\n`);
};

const pilots = loadPilots();

const generatePilotCode = () => {
  let code;
  do {
    code = `TA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  } while (Object.values(pilots).some((pilot) => pilot.activePlan?.code === code));
  return code;
};

const generateFlightCode = () => {
  let code;
  do {
    code = `UA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  } while (flights[code]);
  return code;
};

const WELCOME_CARD = {
  width: 1200,
  height: 400,
  background: "#f7f7f7",
  accent: "#c8102e",
  text: "#171717",
  mutedText: "#5b5b5b",
  title: "TURKISH AIRLINES PTFS",
};

const roundedRect = (context, x, y, width, height, radius) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
};

const loadMemberAvatar = async (member) => {
  const response = await fetch(
    member.displayAvatarURL({ extension: "png", forceStatic: true, size: 256 })
  );
  if (!response.ok) {
    throw new Error(`Avatar request failed with status ${response.status}`);
  }
  return loadImage(Buffer.from(await response.arrayBuffer()));
};

const createWelcomeCard = async (member) => {
  const canvas = createCanvas(WELCOME_CARD.width, WELCOME_CARD.height);
  const context = canvas.getContext("2d");
  const background = context.createLinearGradient(0, 0, WELCOME_CARD.width, WELCOME_CARD.height);
  background.addColorStop(0, WELCOME_CARD.background);
  background.addColorStop(1, "#e8e8e8");
  context.fillStyle = background;
  context.fillRect(0, 0, WELCOME_CARD.width, WELCOME_CARD.height);

  context.fillStyle = WELCOME_CARD.accent;
  context.fillRect(0, 0, 18, WELCOME_CARD.height);
  context.fillStyle = "#ffffff";
  roundedRect(context, 36, 36, WELCOME_CARD.width - 72, WELCOME_CARD.height - 72, 26);

  try {
    const logo = await loadImage(fs.readFileSync(WELCOME_LOGO_FILE));
    context.drawImage(logo, 925, 72, 180, 180);
  } catch (error) {
    console.error("Failed to load the Turkish Airlines welcome logo:", error);
  }

  const avatarSize = 220;
  const avatarX = 88;
  const avatarY = (WELCOME_CARD.height - avatarSize) / 2;
  context.save();
  context.beginPath();
  context.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  context.clip();
  try {
    const avatar = await loadMemberAvatar(member);
    context.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  } catch (error) {
    console.error(`Failed to load avatar for ${member.user.tag}; using fallback:`, error);
    context.fillStyle = WELCOME_CARD.accent;
    context.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    context.fillStyle = WELCOME_CARD.text;
    context.font = "bold 84px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(member.displayName.slice(0, 1).toUpperCase(), avatarX + avatarSize / 2, avatarY + avatarSize / 2);
    context.textAlign = "start";
    context.textBaseline = "alphabetic";
  }
  context.restore();

  context.strokeStyle = WELCOME_CARD.text;
  context.lineWidth = 10;
  context.beginPath();
  context.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  context.stroke();

  const name = member.displayName;
  context.fillStyle = WELCOME_CARD.mutedText;
  context.font = "32px sans-serif";
  context.fillText(WELCOME_CARD.title, 410, 145);
  context.fillStyle = WELCOME_CARD.text;
  context.font = "bold 58px sans-serif";
  context.fillText(name.slice(0, 24), 410, 220);
  context.fillStyle = WELCOME_CARD.mutedText;
  context.font = "28px sans-serif";
  context.fillText(`@${member.user.username}`, 410, 270);

  return canvas.encode("png");
};

const ptfsAircraft = [
  { name: "CRJ-700", value: "CRJ-700" },
  { name: "Boeing 737", value: "Boeing 737" },
  { name: "Airbus A320", value: "Airbus A320" },
  { name: "Boeing 757", value: "Boeing 757" },
  { name: "Boeing 767", value: "Boeing 767" },
  { name: "Boeing 777", value: "Boeing 777" },
  { name: "Boeing 787", value: "Boeing 787" },
  { name: "Douglas DC-8", value: "Douglas DC-8" },
  { name: "Boeing 727", value: "Boeing 727" },
  { name: "Boeing 747", value: "Boeing 747" },
  { name: "DC-10", value: "DC-10" },
  { name: "L-1011", value: "L-1011" },
];

const projectFlightAircraft = [
  { name: "Airbus A319", value: "Airbus A319" },
  { name: "Boeing 727", value: "Boeing 727" },
  { name: "Q400", value: "Q400" },
  { name: "Boeing 737-800", value: "Boeing 737-800" },
  { name: "Airbus A320", value: "Airbus A320" },
  { name: "Boeing 757-200", value: "Boeing 757-200" },
  { name: "Boeing 777-300ER", value: "Boeing 777-300ER" },
  { name: "Boeing 787-9", value: "Boeing 787-9" },
];

const addAnnouncementOptions = (command, aircraftChoices) =>
  command
    .addStringOption((option) =>
      option.setName("departing_destination").setDescription("The departure destination.").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("arrival_destination").setDescription("The arrival destination.").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("flight_number").setDescription("The flight number.").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("aircraft_type")
        .setDescription("Select the aircraft type.")
        .addChoices(...aircraftChoices)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("boarding_time").setDescription("The boarding time.").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("departure_time").setDescription("The departure time.").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("estimated_flight_time").setDescription("The estimated flight time (EFT).").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("captain_pilot").setDescription("The captain or pilot.").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("first_officer").setDescription("The first officer or co-pilot.").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("ground_crew").setDescription("The ground crew.").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("air_traffic_control").setDescription("The air traffic control (ATC) team.").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("flight_attendants").setDescription("The flight attendants.").setRequired(true)
    );

const announceCommand = addAnnouncementOptions(
  new SlashCommandBuilder().setName("announce").setDescription("Announce an upcoming PTFS flight."),
  ptfsAircraft
);

const announce2Command = addAnnouncementOptions(
  new SlashCommandBuilder().setName("announce2").setDescription("Announce a Project Flight."),
  projectFlightAircraft
);

const announce3Command = new SlashCommandBuilder()
  .setName("announce3")
  .setDescription("Send a normal announcement.")
  .addRoleOption((option) =>
    option
      .setName("role")
      .setDescription("What role would you like to ping?")
      .setRequired(false)
  );

const editFlightCommand = new SlashCommandBuilder()
  .setName("editflight")
  .setDescription("Edit an existing flight announcement.")
  .addStringOption((option) =>
    option
      .setName("code")
      .setDescription("The code of the flight to edit.")
      .setRequired(true)
  );

const removeFlightCommand = new SlashCommandBuilder()
  .setName("removeflight")
  .setDescription("Remove an existing flight announcement.")
  .addStringOption((option) =>
    option
      .setName("code")
      .setDescription("The code of the flight to remove.")
      .setRequired(true)
  );

const eventCommand = new SlashCommandBuilder()
  .setName("event")
  .setDescription("Open an easy form to create a Discord scheduled event.")
  .addStringOption((option) =>
    option
      .setName("image")
      .setDescription("Optional public image URL for the event cover.")
      .setRequired(false)
  );

const giveRoleCommand = new SlashCommandBuilder()
  .setName("giverole")
  .setDescription("Give a role to a server member.")
  .addUserOption((option) =>
    option.setName("user").setDescription("The member who should receive the role.").setRequired(true)
  )
  .addRoleOption((option) =>
    option.setName("role").setDescription("The role to give.").setRequired(true)
  );

const flightPlanCommand = new SlashCommandBuilder()
  .setName("flightplan")
  .setDescription("Create a flight plan.")
  .addStringOption((option) =>
    option.setName("departure_airport").setDescription("The departure airport.").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("arrival_airport").setDescription("The arrival airport.").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("aircraft").setDescription("The aircraft type.").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("callsign").setDescription("The flight callsign.").setRequired(true)
  );

const logFlightCommand = new SlashCommandBuilder()
  .setName("logflight")
  .setDescription("Log a completed flight from your active flight plan.")
  .addStringOption((option) =>
    option.setName("code").setDescription("The code from your flight plan.").setRequired(true)
  )
  .addAttachmentOption((option) =>
    option.setName("picture").setDescription("A picture proving the completed flight.").setRequired(true)
  )
  .addIntegerOption((option) =>
    option.setName("hours").setDescription("Completed flight hours.").setMinValue(0).setMaxValue(999).setRequired(true)
  )
  .addIntegerOption((option) =>
    option.setName("minutes").setDescription("Additional flight minutes.").setMinValue(0).setMaxValue(59).setRequired(true)
  );

const pilotCommand = new SlashCommandBuilder()
  .setName("pilot")
  .setDescription("Show your recent flights and total flight time.");

const removePilotFlightCommand = new SlashCommandBuilder()
  .setName("removeflight")
  .setDescription("Cancel your active flight plan.")
  .addStringOption((option) =>
    option.setName("code").setDescription("The code from your flight plan.").setRequired(true)
  );

const TURKISH_COMMANDS = [
  new SlashCommandBuilder()
    .setName("about")
    .setDescription("Learn about Turkish Airlines PTFS."),
  flightPlanCommand,
  logFlightCommand,
  pilotCommand,
  removePilotFlightCommand,
];
const TURKISH_COMMAND_NAMES = new Set(TURKISH_COMMANDS.map((command) => command.name));

const ROLE_COMMAND_AUTHORIZED_USER_IDS = new Set([
  "1420191498988814377",
  "1388554248144293919",
]);

const TICKET_PANEL_CUSTOM_ID = "ticket:create";
const TICKET_CLOSE_CUSTOM_ID = "ticket:close";
const pendingEventImages = new Map();

const rulesEmbed = () =>
  new EmbedBuilder()
    .setColor(0x00d9ff)
    .setTitle("🇺🇸 United Airlines PTFS — Rules")
    .setDescription(
      [
        "1. Treat all members, passengers, pilots, and staff with respect.",
        "2. Follow the instructions of United Airlines PTFS staff and flight crew.",
        "3. Use realistic aviation procedures and appropriate in-game radio communication.",
        "4. Do not troll, grief, spam, exploit, or intentionally disrupt flights.",
        "5. Do not impersonate United Airlines staff, pilots, or other members.",
        "6. Keep all announcements, roleplay, and chat appropriate and family-friendly.",
        "7. Do not advertise other servers or services without staff permission.",
        "8. Respect airport traffic, boarding queues, ATC instructions, and other ongoing operations.",
        "9. Report issues or rule violations privately to a moderator instead of starting arguments.",
        "10. Staff may take action, including warnings, kicks, or bans, when necessary.",
      ].join("\n\n")
    )
    .setFooter({ text: "By participating, you agree to follow these rules. Have fun and fly safe! ✈️" });

const ticketPanel = () => ({
  embeds: [
    new EmbedBuilder()
      .setColor(0x00d9ff)
      .setTitle("🎫 United Airlines Support")
      .setDescription(
        "Need help? Click the button below to create a private support ticket. " +
          "Please explain your request clearly so the support team can assist you."
      )
      .setFooter({ text: "One open ticket per user • United Airlines PTFS" }),
  ],
  components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(TICKET_PANEL_CUSTOM_ID)
        .setLabel("Create Support Ticket")
        .setEmoji("🎫")
        .setStyle(ButtonStyle.Primary)
    ),
  ],
});

const ensureTicketPanel = async () => {
  const channel = await client.channels.fetch(TICKET_PANEL_CHANNEL_ID).catch((error) => {
    if (error.code === 50001 || error.code === 10003) {
      console.warn(
        `Skipping ticket panel: the bot cannot access channel ${TICKET_PANEL_CHANNEL_ID}.`
      );
      return null;
    }
    throw error;
  });
  if (!channel) {
    return;
  }
  if (!channel?.isTextBased() || !channel.messages) {
    throw new Error(`Ticket panel channel ${TICKET_PANEL_CHANNEL_ID} is not a text channel.`);
  }
  const messages = await channel.messages.fetch({ limit: 50 });
  const panelMessage = messages.find(
    (message) =>
      message.author.id === client.user.id &&
      message.embeds.some((embed) => embed.title === "🎫 United Airlines Support")
  );
  if (panelMessage) {
    await panelMessage.edit(ticketPanel());
  } else {
    await channel.send(ticketPanel());
  }
};

const flightEmbed = (flight) => {
  const value = (field) => flight[field] || "Not provided";
  const announcement = new EmbedBuilder()
    .setColor(flight.announcementType === "project" ? 0x7b61ff : 0x005daa)
    .setTitle(flight.announcementType === "project" ? "✈️ Project Flight" : "✈️ United Airlines Flight Announcement")
    .setDescription(
      `Flight **${value("flightNumber")}** is scheduled from **${value("departingDestination")}** ` +
        `to **${value("arrivalDestination")}**.`
    )
    .addFields(
      { name: "🛫 Departing Destination", value: value("departingDestination"), inline: true },
      { name: "🛬 Arrival Destination", value: value("arrivalDestination"), inline: true },
      { name: "🛩️ Aircraft Type", value: value("aircraftType"), inline: true },
      { name: "📋 Flight Number", value: value("flightNumber"), inline: true },
      { name: "🕒 Boarding Time", value: value("boardingTime"), inline: true },
      { name: "🛫 Departure Time", value: value("departureTime"), inline: true },
      { name: "⏱️ Estimated Flight Time (EFT)", value: value("estimatedFlightTime"), inline: true },
      { name: "👨‍✈️ Captain / Pilot", value: value("captainPilot"), inline: true },
      { name: "🧑‍✈️ First Officer / Co-Pilot", value: value("firstOfficer"), inline: true },
      { name: "🛬 Ground Crew", value: value("groundCrew"), inline: true },
      { name: "🗼 Air Traffic Control (ATC)", value: value("airTrafficControl"), inline: true },
      { name: "🧑‍✈️ Flight Attendants", value: value("flightAttendants"), inline: true }
    )
    .setFooter({ text: `Flight code: ${flight.code} • Announced by ${flight.announcedBy}` })
    .setTimestamp(new Date(flight.updatedAt));
  return announcement;
};

const fetchEventImage = async (imageUrl) => {
  let url;
  try {
    url = new URL(imageUrl);
  } catch {
    throw new Error("The image must be a valid URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("The image URL must use HTTP or HTTPS.");
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(`The image request failed with status ${response.status}.`);
  }
  if (!response.headers.get("content-type")?.startsWith("image/")) {
    throw new Error("The image URL must point to an image.");
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 8 * 1024 * 1024) {
    throw new Error("The image must be 8 MB or smaller.");
  }
  const image = Buffer.from(await response.arrayBuffer());
  if (image.length > 8 * 1024 * 1024) {
    throw new Error("The image must be 8 MB or smaller.");
  }
  return image;
};

const parseEventDateTime = (input) => {
  const match =
    /^(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{4})\s+(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i.exec(
      input.trim()
    );
  if (!match) {
    return null;
  }

  const [, month, day, year, hourInput, minuteInput, periodInput] = match;
  let hour = Number(hourInput);
  const minute = Number(minuteInput);
  const period = periodInput.toUpperCase();
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), hour, minute));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return date;
};

const eventModal = () =>
  new ModalBuilder()
    .setCustomId("event:create")
    .setTitle("Create Scheduled Event")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Event title")
          .setPlaceholder("United Airlines Flight Training")
          .setMaxLength(100)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description")
          .setPlaceholder("Tell members what this event is about")
          .setMaxLength(1000)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("location")
          .setLabel("Location")
          .setPlaceholder("Roblox PTFS or Discord voice channel")
          .setMaxLength(100)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("start")
          .setLabel("Starts (UTC)")
          .setPlaceholder("12/01/2026 7:00 PM")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("end")
          .setLabel("Ends (UTC)")
          .setPlaceholder("12/01/2026 9:00 PM")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const moderationLog = async (guild, title, description, color = 0xc8102e) => {
  if (!guild) return;
  try {
    const channel = await client.channels.fetch(MOD_LOG_CHANNEL_ID);
    if (!channel?.isTextBased()) {
      throw new Error(`Moderation log channel ${MOD_LOG_CHANNEL_ID} is not text-based.`);
    }
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setTitle(title)
          .setDescription(description.slice(0, 4000))
          .setFooter({ text: guild.name })
          .setTimestamp(),
      ],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error(`Failed to write moderation log for ${guild.name}:`, error);
  }
};

const createTicket = async (interaction) => {
  if (!interaction.guild) {
    await interaction.reply({ content: "Tickets can only be created in a server.", ephemeral: true });
    return;
  }

  const existingTicket = interaction.guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildText &&
      channel.topic === `support-ticket:${interaction.user.id}`
  );
  if (existingTicket) {
    await interaction.reply({
      content: `You already have an open ticket: ${existingTicket}`,
      ephemeral: true,
    });
    return;
  }

  try {
    const ticketChannel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90),
      type: ChannelType.GuildText,
      topic: `support-ticket:${interaction.user.id}`,
      permissionOverwrites: [
        {
          id: interaction.guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.ManageMessages,
          ],
        },
      ],
    });

    await ticketChannel.send({
      content: `@everyone ${interaction.user} created a support ticket.`,
      allowedMentions: { parse: ["everyone"], users: [interaction.user.id] },
      embeds: [
        new EmbedBuilder()
          .setColor(0x00d9ff)
          .setTitle("🎫 Support Ticket")
          .setDescription(
            `${interaction.user}, please describe what you need help with. A staff member will assist you soon.`
          ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(TICKET_CLOSE_CUSTOM_ID)
            .setLabel("Close Ticket")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger)
        ),
      ],
    });
    await interaction.reply({ content: `Your support ticket is ready: ${ticketChannel}`, ephemeral: true });
  } catch (error) {
    console.error(`Failed to create a support ticket for ${interaction.user.tag}:`, error);
    await interaction.reply({
      content: "I could not create your ticket. Please contact a server administrator.",
      ephemeral: true,
    });
  }
};

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  if (readyClient.user.id !== expectedApplicationId) {
    console.error(
      `Refusing to start: TURKISH_TOKEN belongs to ${readyClient.user.id}, ` +
        `but the configured Turkish application is ${expectedApplicationId}.`
    );
    readyClient.destroy();
    process.exitCode = 1;
    return;
  }

  const commandData = TURKISH_COMMANDS.map((command) => command.toJSON());
  Promise.all([
    readyClient.application.commands.set(commandData),
    ...readyClient.guilds.cache.values().map((guild) => guild.commands.set(commandData)),
  ])
    .then(() => {
      console.log(
        `Registered Turkish-only commands in ${readyClient.guilds.cache.size} guild(s): ` +
          "/about, /flightplan, /logflight, /pilot, /removeflight."
      );
    })
    .catch((error) => console.error("Failed to register Turkish-only slash commands:", error));
  ensureTicketPanel().catch((error) => {
    console.error(`Failed to configure the ticket panel in channel ${TICKET_PANEL_CHANNEL_ID}:`, error);
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) {
    return;
  }

  if (interaction.customId === TICKET_CLOSE_CUSTOM_ID) {
    await interaction.reply({ content: "This ticket will be closed.", ephemeral: true });
    await interaction.channel.delete("Support ticket closed");
    return;
  }

  if (interaction.customId !== TICKET_PANEL_CUSTOM_ID || !interaction.guild) {
    return;
  }

  await createTicket(interaction);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
  if (!TURKISH_COMMAND_NAMES.has(interaction.commandName)) {
    await interaction.reply({
      content: "That command is not available on the Turkish Airlines PTFS bot.",
      ephemeral: true,
    });
    console.warn(`Ignored unregistered command /${interaction.commandName} for ${interaction.user.tag}.`);
    return;
  }

  if (interaction.commandName === "announce" || interaction.commandName === "announce2") {
    const flight = {
      code: generateFlightCode(),
      announcementType: interaction.commandName === "announce2" ? "project" : "ptfs",
      departingDestination: interaction.options.getString("departing_destination", true),
      arrivalDestination: interaction.options.getString("arrival_destination", true),
      flightNumber: interaction.options.getString("flight_number", true),
      aircraftType: interaction.options.getString("aircraft_type", true),
      boardingTime: interaction.options.getString("boarding_time", true),
      departureTime: interaction.options.getString("departure_time", true),
      estimatedFlightTime: interaction.options.getString("estimated_flight_time", true),
      captainPilot: interaction.options.getString("captain_pilot", true),
      firstOfficer: interaction.options.getString("first_officer", true),
      groundCrew: interaction.options.getString("ground_crew", true),
      airTrafficControl: interaction.options.getString("air_traffic_control", true),
      flightAttendants: interaction.options.getString("flight_attendants", true),
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      announcedBy: interaction.user.tag,
      updatedAt: new Date().toISOString(),
    };
    const response = await interaction.reply({
      content: `Flight code: **${flight.code}**`,
      embeds: [flightEmbed(flight)],
      fetchReply: true,
    });
    flight.messageId = response.id;
    flights[flight.code] = flight;
    saveFlights(flights);
    return;
  }

  if (interaction.commandName === "rules") {
    await interaction.reply({ embeds: [rulesEmbed()], ephemeral: true });
    return;
  }

  if (interaction.commandName === "about") {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xc8102e)
          .setTitle("About Turkish Airlines PTFS")
          .setDescription(
            "Turkish Airlines PTFS is a virtual airline built for pilots, crew, and aviation fans who enjoy realistic and welcoming flight operations. We connect our community through scheduled flights, organized events, and a shared passion for exploring the virtual skies. Every flight is an opportunity to make the journey memorable for our passengers and our team.\n\nOur goal is to reflect the spirit of the real Turkish Airlines through professional service, global ambition, and genuine hospitality. We strive to offer the same care, consistency, and attention to detail that travelers associate with the actual airline while creating an experience made for the PTFS community. Together, we are building a virtual airline that feels authentic, inclusive, and ready for takeoff."
          )
          .setFooter({ text: "Turkish Airlines PTFS • We fly together" }),
      ],
    });
    return;
  }

  if (interaction.commandName === "flightplan") {
    await interaction.reply({
      content: "Creating your flight plan...",
      ephemeral: true,
    });
    try {
      const existingPilot = pilots[interaction.user.id];
      if (existingPilot?.activePlan) {
        await interaction.editReply({
          content:
          `You already have an active flight plan with code **${existingPilot.activePlan.code}**. Log that flight before creating another plan.`
        });
        return;
      }

      const plan = {
        code: generatePilotCode(),
        departureAirport: interaction.options.getString("departure_airport", true),
        arrivalAirport: interaction.options.getString("arrival_airport", true),
        aircraft: interaction.options.getString("aircraft", true),
        callsign: interaction.options.getString("callsign", true),
        createdAt: new Date().toISOString(),
      };
      pilots[interaction.user.id] = {
        totalMinutes: existingPilot?.totalMinutes || 0,
        recentFlights: existingPilot?.recentFlights || [],
        activePlan: plan,
      };
      savePilots(pilots);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xc8102e)
            .setTitle("Flight plan created")
            .setDescription(`Your flight plan code is **${plan.code}**. Use it with \`/logflight\` after completing the flight.`)
            .addFields(
              { name: "Departure", value: plan.departureAirport, inline: true },
              { name: "Arrival", value: plan.arrivalAirport, inline: true },
              { name: "Aircraft", value: plan.aircraft, inline: true },
              { name: "Callsign", value: plan.callsign, inline: true }
            )
            .setFooter({ text: "Keep this code private until you log your flight." }),
        ],
      });
    } catch (error) {
      console.error(`Failed to create a flight plan for ${interaction.user.tag}:`, error);
      await interaction.editReply({
        content: "I could not create your flight plan. Please try again.",
        embeds: [],
      });
    }
    return;
  }

  if (interaction.commandName === "logflight") {
    const pilot = pilots[interaction.user.id];
    if (!pilot?.activePlan) {
      await interaction.reply({
        content: "You do not have an active flight plan. Create one with `/flightplan` first.",
        ephemeral: true,
      });
      return;
    }

    const code = interaction.options.getString("code", true).trim().toUpperCase();
    if (code !== pilot.activePlan.code) {
      await interaction.reply({
        content: "That flight plan code does not match your active flight plan.",
        ephemeral: true,
      });
      return;
    }

    const picture = interaction.options.getAttachment("picture", true);
    if (!picture.contentType?.startsWith("image/")) {
      await interaction.reply({
        content: "The picture option must be an image attachment.",
        ephemeral: true,
      });
      return;
    }

    const hours = interaction.options.getInteger("hours", true);
    const minutes = interaction.options.getInteger("minutes", true);
    const flightMinutes = hours * 60 + minutes;
    if (flightMinutes < 1) {
      await interaction.reply({
        content: "The logged flight time must be at least one minute.",
        ephemeral: true,
      });
      return;
    }

    const loggedFlight = {
      ...pilot.activePlan,
      hours,
      minutes,
      proofUrl: picture.url,
      loggedAt: new Date().toISOString(),
    };
    pilot.totalMinutes += flightMinutes;
    pilot.recentFlights = [loggedFlight, ...(pilot.recentFlights || [])].slice(0, 10);
    delete pilot.activePlan;
    savePilots(pilots);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xc8102e)
          .setTitle("Flight logged")
          .setDescription(`Your flight on **${loggedFlight.callsign}** has been added to your pilot record.`)
          .addFields(
            { name: "Route", value: `${loggedFlight.departureAirport} → ${loggedFlight.arrivalAirport}`, inline: false },
            { name: "Aircraft", value: loggedFlight.aircraft, inline: true },
            { name: "Flight time", value: `${hours}h ${minutes}m`, inline: true },
            { name: "Total flight time", value: `${Math.floor(pilot.totalMinutes / 60)}h ${pilot.totalMinutes % 60}m`, inline: true }
          )
          .setImage(picture.url),
      ],
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "pilot") {
    const pilot = pilots[interaction.user.id];
    const recentFlights = pilot?.recentFlights || [];
    const totalMinutes = pilot?.totalMinutes || 0;
    const recentDescription = recentFlights.length
      ? recentFlights
          .slice(0, 5)
          .map(
            (flight) =>
              `**${flight.callsign}** · ${flight.departureAirport} → ${flight.arrivalAirport} · ${flight.hours}h ${flight.minutes}m`
          )
          .join("\n")
      : "No completed flights yet.";
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xc8102e)
          .setTitle(`${interaction.user.username}'s pilot record`)
          .addFields(
            { name: "Total flight time", value: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`, inline: false },
            { name: "Recent flights", value: recentDescription, inline: false }
          )
          .setFooter({
            text: pilot?.activePlan
              ? `Active flight plan: ${pilot.activePlan.code}`
              : "No active flight plan",
          }),
      ],
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "removeflight") {
    const pilot = pilots[interaction.user.id];
    if (!pilot?.activePlan) {
      await interaction.reply({
        content: "You do not have an active flight plan to remove.",
        ephemeral: true,
      });
      return;
    }

    const code = interaction.options.getString("code", true).trim().toUpperCase();
    if (code !== pilot.activePlan.code) {
      await interaction.reply({
        content: "That flight plan code does not match your active flight plan.",
        ephemeral: true,
      });
      return;
    }

    const removedPlan = pilot.activePlan;
    delete pilot.activePlan;
    savePilots(pilots);
    await interaction.reply({
      content: `Your flight plan **${removedPlan.code}** for **${removedPlan.callsign}** was removed.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "giverole") {
    if (!ROLE_COMMAND_AUTHORIZED_USER_IDS.has(interaction.user.id)) {
      await interaction.reply({ content: "You are not authorized to use this command.", ephemeral: true });
      return;
    }
    if (!interaction.guild) {
      await interaction.reply({ content: "Roles can only be assigned in a server.", ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser("user", true);
    const role = interaction.options.getRole("role", true);
    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      await interaction.reply({ content: "I need the Manage Roles permission to assign roles.", ephemeral: true });
      return;
    }
    if (role.managed || role.position >= botMember.roles.highest.position) {
      await interaction.reply({
        content: "I cannot assign that role because it is managed or higher than my highest role.",
        ephemeral: true,
      });
      return;
    }

    try {
      const targetMember = await interaction.guild.members.fetch(targetUser.id);
      await targetMember.roles.add(role, `Assigned by ${interaction.user.tag}`);
      await interaction.reply({
        content: `Assigned ${role} to ${targetMember}.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error(`Failed to assign role ${role.name} to ${targetUser.tag}:`, error);
      await interaction.reply({
        content: "I could not assign that role. Check the member and role permissions.",
        ephemeral: true,
      });
    }
    return;
  }

  if (interaction.commandName === "event") {
    if (!interaction.guild) {
      await interaction.reply({ content: "Events can only be created in a server.", ephemeral: true });
      return;
    }
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageEvents)) {
      await interaction.reply({ content: "You need the Manage Events permission to create an event.", ephemeral: true });
      return;
    }

    const imageUrl = interaction.options.getString("image");
    const token = Math.random().toString(36).slice(2, 10);
    pendingEventImages.set(token, {
      imageUrl,
      guildId: interaction.guild.id,
      userId: interaction.user.id,
    });
    setTimeout(() => pendingEventImages.delete(token), 10 * 60 * 1000).unref();
    await interaction.showModal(eventModal().setCustomId(`event:create:${token}`));
    return;
  }

  if (interaction.commandName === "announce3") {
    const role = interaction.options.getRole("role");
    const modal = new ModalBuilder()
      .setCustomId(`announce3:${role?.id || "here"}`)
      .setTitle("Create Announcement")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("announcement")
            .setLabel("What would you like to send?")
            .setPlaceholder("Type your announcement here...")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );
    await interaction.showModal(modal);
    return;
  }

  if (interaction.commandName === "ticket") {
    await createTicket(interaction);
    return;
  }

  if (interaction.commandName === "editflight") {
    const code = interaction.options.getString("code", true).toUpperCase();
    const flight = flights[code];
    if (!flight) {
      await interaction.reply({ content: `No flight was found with code **${code}**.`, ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`editflight:${code}:details`)
      .setTitle(`Edit flight ${code}`)
      .addComponents(
        ["flightNumber", "departingDestination", "arrivalDestination", "aircraftType", "departureTime"].map((field) =>
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(field)
              .setLabel(field[0].toUpperCase() + field.slice(1))
              .setPlaceholder("Type . to keep the current value")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        )
      );
    await interaction.showModal(modal);
    return;
  }

  if (interaction.commandName === "removeflight") {
    const code = interaction.options.getString("code", true).toUpperCase();
    const flight = flights[code];
    if (!flight) {
      await interaction.reply({ content: `No flight was found with code **${code}**.`, ephemeral: true });
      return;
    }

    try {
      const channel = await client.channels.fetch(flight.channelId);
      const message = await channel.messages.fetch(flight.messageId);
      await message.delete();
    } catch (error) {
      console.error(`Could not delete announcement message for ${code}:`, error);
    }
    delete flights[code];
    saveFlights(flights);
    await interaction.reply({ content: `Flight **${code}** was removed.`, ephemeral: true });
    return;
  }

  if (interaction.commandName !== "united") {
    return;
  }

  const unitedEmbed = new EmbedBuilder()
    .setColor(0x005daa)
    .setAuthor({
      name: "United Airlines",
      url: "https://www.united.com/",
    })
    .setTitle("Connecting people and places")
    .setDescription(
      "United Airlines is a major American airline headquartered in Chicago, " +
        "Illinois. Through its extensive domestic and international network, " +
        "United connects travelers to destinations across the United States and " +
        "around the world, helping people travel for business, family, and " +
        "adventure."
    )
    .addFields(
      {
        name: "🌎 Global reach",
        value:
          "United operates one of the largest route networks among U.S. airlines " +
          "and is a founding member of Star Alliance, giving customers access to " +
          "destinations and partner flights worldwide.",
      },
      {
        name: "✈️ The experience",
        value:
          "Travelers can choose from multiple cabin experiences, including " +
          "Economy, Economy Plus, premium cabins, and United Polaris® business " +
          "class on select international flights. The airline also offers the " +
          "MileagePlus® loyalty program.",
      },
      {
        name: "💙 More information",
        value:
          "[Visit united.com](https://www.united.com/) • " +
          "[Flight status](https://www.united.com/en/us/flightstatus) • " +
          "[MileagePlus](https://www.united.com/en/us/fly/mileageplus.html)",
      }
    )
    .setFooter({ text: "Fly the friendly skies ✈️" })
    .setTimestamp();

  await interaction.reply({ embeds: [unitedEmbed] });
  } catch (error) {
    console.error(`Failed to handle /${interaction.commandName} for ${interaction.user.tag}:`, error);
    const message = "I could not complete that command. Please try again.";
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: message, embeds: [] });
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    } catch (replyError) {
      console.error(`Could not send error response for /${interaction.commandName}:`, replyError);
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) {
    return;
  }

  if (interaction.customId.startsWith("announce3:")) {
    const [, roleId] = interaction.customId.split(":");
    const announcement = interaction.fields.getTextInputValue("announcement");
    const isEveryoneRole = roleId !== "here" && roleId === interaction.guild?.roles.everyone.id;
    const mention = roleId === "here" ? "@here" : isEveryoneRole ? "@everyone" : `<@&${roleId}>`;
    await interaction.deferReply({ ephemeral: true });
    try {
      if (!interaction.channel?.isTextBased()) {
        throw new Error("The announcement must be created in a text channel.");
      }
      await interaction.channel.send({
        content: `${mention} ${announcement}`,
        allowedMentions:
          roleId === "here" || isEveryoneRole ? { parse: ["everyone"] } : { roles: [roleId] },
      });
      await interaction.editReply("Your announcement was sent.");
    } catch (error) {
      console.error(`Failed to send announce3 message for ${interaction.user.tag}:`, error);
      await interaction.editReply("I could not send the announcement. Check that I can send messages in this channel.");
    }
    return;
  }

  if (interaction.customId.startsWith("event:create:")) {
    const token = interaction.customId.split(":")[2];
    const pendingEvent = pendingEventImages.get(token);
    pendingEventImages.delete(token);
    if (
      !pendingEvent ||
      pendingEvent.userId !== interaction.user.id ||
      pendingEvent.guildId !== interaction.guildId ||
      !interaction.guild
    ) {
      await interaction.reply({ content: "This event form has expired. Please run `/event` again.", ephemeral: true });
      return;
    }

    const startTime = parseEventDateTime(interaction.fields.getTextInputValue("start"));
    const endTime = parseEventDateTime(interaction.fields.getTextInputValue("end"));
    if (!startTime || !endTime || startTime <= new Date() || endTime <= startTime) {
      await interaction.reply({
        content:
          "Use dates like `12/01/2026 7:00 PM`. Times are interpreted as UTC; " +
          "the start must be in the future and the end must be after the start.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const image = pendingEvent.imageUrl ? await fetchEventImage(pendingEvent.imageUrl) : undefined;
      const event = await interaction.guild.scheduledEvents.create({
        name: interaction.fields.getTextInputValue("title"),
        description: interaction.fields.getTextInputValue("description"),
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: { location: interaction.fields.getTextInputValue("location") },
        ...(image ? { image } : {}),
        reason: `Created by ${interaction.user.tag}`,
      });
      await interaction.editReply(`Event created: ${event.url}`);
    } catch (error) {
      console.error(`Failed to create an event for ${interaction.user.tag}:`, error);
      await interaction.editReply(
        `I could not create the event. ${error instanceof Error ? error.message : "Check the bot's permissions and event details."}`
      );
    }
    return;
  }

  const [, code, step] = interaction.customId.split(":");
  const flight = flights[code];
  if (!flight) {
    await interaction.reply({ content: `Flight **${code}** no longer exists.`, ephemeral: true });
    return;
  }

  if (step === "details") {
    const changes = {};
    for (const field of [
      "flightNumber",
      "departingDestination",
      "arrivalDestination",
      "aircraftType",
      "departureTime",
    ]) {
      const value = interaction.fields.getTextInputValue(field);
      changes[field] = value === "." ? flight[field] : value;
    }
    for (const field of [
      "flightNumber",
      "departingDestination",
      "arrivalDestination",
      "aircraftType",
      "departureTime",
    ]) {
      flight[field] = changes[field];
    }
    flight.updatedAt = new Date().toISOString();
    saveFlights(flights);

    try {
      const channel = await client.channels.fetch(flight.channelId);
      const message = await channel.messages.fetch(flight.messageId);
      await message.edit({ content: `Flight code: **${flight.code}**`, embeds: [flightEmbed(flight)] });
    } catch (error) {
      console.error(`Could not update announcement message for ${code}:`, error);
      await interaction.reply({
        content: `Flight **${code}** was saved, but its announcement could not be updated.`,
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({ content: `Flight **${code}** was updated.`, ephemeral: true });
    return;
  }

});

client.on(Events.GuildMemberAdd, async (member) => {
  await moderationLog(
    member.guild,
    "Member joined",
    `<@${member.id}> joined the server.\nUser ID: \`${member.id}\``,
    0x2ecc71
  );

  if (member.user.bot) {
    return;
  }

  const channel = await client.channels.fetch(WELCOME_CHANNEL_ID).catch((error) => {
    console.error(`Could not fetch the welcome channel ${WELCOME_CHANNEL_ID}:`, error);
    return null;
  });
  const botMember = member.guild.members.me;
  const permissions = channel && botMember ? channel.permissionsFor(botMember) : null;

  if (
    !channel ||
    !channel.isTextBased() ||
    !permissions?.has([
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.AttachFiles,
    ])
  ) {
    console.error(
      `The bot cannot send welcome messages in channel ${WELCOME_CHANNEL_ID} for ${member.guild.name}.`
    );
    return;
  }

  try {
    const card = await createWelcomeCard(member);
    const attachment = new AttachmentBuilder(card, { name: "welcome-card.png" });
    await channel.send({
      content: `Welcome to Turkish Airlines PTFS, ${member}!`,
      files: [attachment],
    });
  } catch (error) {
    console.error(`Failed to welcome ${member.user.tag} in ${member.guild.name}:`, error);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  await moderationLog(
    member.guild,
    "Member left",
    `<@${member.id}> left the server.\nUser ID: \`${member.id}\``,
    0xe67e22
  );
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
  const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
  const verifiedRoleChanged = [...addedRoles.values(), ...removedRoles.values()].some((role) =>
    role.name.toLowerCase().includes("verif")
  );

  if (addedRoles.size) {
    await moderationLog(
      newMember.guild,
      verifiedRoleChanged ? "Member verified" : "Role added",
      `<@${newMember.id}> received: ${addedRoles.map((role) => `**${role.name}**`).join(", ")}`,
      0x3498db
    );
  }
  if (removedRoles.size) {
    await moderationLog(
      newMember.guild,
      verifiedRoleChanged ? "Verification role removed" : "Role removed",
      `<@${newMember.id}> lost: ${removedRoles.map((role) => `**${role.name}**`).join(", ")}`,
      0xe67e22
    );
  }
});

client.on(Events.MessageDelete, async (message) => {
  if (!message.guild || message.author?.bot) return;
  await moderationLog(
    message.guild,
    "Message deleted",
    `Author: ${message.author ? `<@${message.author.id}>` : "Unknown user"}\nChannel: <#${message.channelId}>\nContent: ${message.content || "Unavailable (message was not cached)."}`,
    0xe74c3c
  );
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  await moderationLog(
    newMessage.guild,
    "Message edited",
    `Author: ${newMessage.author ? `<@${newMessage.author.id}>` : "Unknown user"}\nChannel: <#${newMessage.channelId}>\nBefore: ${oldMessage.content || "Unavailable"}\nAfter: ${newMessage.content || "Unavailable"}`,
    0xf1c40f
  );
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (!reaction.message.guild) return;
  await moderationLog(
    reaction.message.guild,
    "Reaction added",
    `<@${user.id}> reacted with ${reaction.emoji} in <#${reaction.message.channelId}>.`,
    0x9b59b6
  );
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (!reaction.message.guild) return;
  await moderationLog(
    reaction.message.guild,
    "Reaction removed",
    `<@${user.id}> removed ${reaction.emoji} in <#${reaction.message.channelId}>.`,
    0x8e44ad
  );
});

client.on(Events.GuildBanAdd, async (ban) => {
  await moderationLog(
    ban.guild,
    "Member banned",
    `<@${ban.user.id}> was banned.\nReason: ${ban.reason || "No reason provided."}`,
    0x992d22
  );
});

client.on(Events.GuildBanRemove, async (ban) => {
  await moderationLog(
    ban.guild,
    "Member unbanned",
    `<@${ban.user.id}> was unbanned.`,
    0x27ae60
  );
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

const shutdown = async (signal) => {
  console.log(`Received ${signal}; shutting down.`);
  client.destroy();
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

client.login(token).catch((error) => {
  console.error("Failed to log in to Discord. Check TURKISH_TOKEN and bot configuration:", error);
  process.exit(1);
});
