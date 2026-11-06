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
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const token = process.env.TURKISH_TOKEN || process.env.DISCORD_TOKEN;

if (!token) {
  console.error("Missing TURKISH_TOKEN or DISCORD_TOKEN. Add one to the service variables before starting the bot.");
  process.exit(1);
}

const FLIGHTS_FILE = path.join(__dirname, "..", "data", "flights.json");
const WELCOME_CHANNEL_ID = "1568359911425974513";
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

const createWelcomeCard = async (member, memberCount) => {
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
  context.fillStyle = WELCOME_CARD.accent;
  context.font = "bold 30px sans-serif";
  context.fillText(`You are the ${getOrdinal(memberCount)} member`, 410, 325);

  return canvas.encode("png");
};

const getOrdinal = (number) => {
  const suffix =
    number % 100 >= 11 && number % 100 <= 13
      ? "th"
      : { 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th";
  return `${number}${suffix}`;
};

const getWelcomeMemberCount = async (guild) => {
  if (Number.isInteger(guild.memberCount) && guild.memberCount > 0) {
    return guild.memberCount;
  }

  const fetchedGuild = await guild.fetch();
  if (Number.isInteger(fetchedGuild.memberCount) && fetchedGuild.memberCount > 0) {
    return fetchedGuild.memberCount;
  }

  const members = await guild.members.fetch();
  if (members.size < 1) {
    throw new Error(`Discord returned an invalid member count for guild ${guild.id}`);
  }
  return members.size;
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

const ROLE_COMMAND_AUTHORIZED_USER_IDS = new Set([
  "1420191498988814377",
  "1388554248144293919",
]);

const TICKET_PANEL_CHANNEL_ID = "1567000517283020844";
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
  const channel = await client.channels.fetch(TICKET_PANEL_CHANNEL_ID);
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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

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
  // No guild ID means these commands are registered globally.
  readyClient.application.commands
    .set([
      new SlashCommandBuilder()
        .setName("united")
        .setDescription("Learn more about United Airlines.")
        .toJSON(),
      announceCommand.toJSON(),
      announce2Command.toJSON(),
      announce3Command.toJSON(),
      editFlightCommand.toJSON(),
      removeFlightCommand.toJSON(),
      eventCommand.toJSON(),
      giveRoleCommand.toJSON(),
      new SlashCommandBuilder().setName("rules").setDescription("Show the United Airlines PTFS rules.").toJSON(),
      new SlashCommandBuilder().setName("ticket").setDescription("Create a private support ticket.").toJSON(),
    ])
    .then(() =>
      console.log("Registered global commands: /united, /announce, /announce2, /announce3, /editflight, /removeflight, /event, /giverole, /rules, /ticket.")
    )
    .catch((error) => console.error("Failed to register slash commands:", error));
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
    const memberCount = await getWelcomeMemberCount(member.guild);
    const card = await createWelcomeCard(member, memberCount);
    const attachment = new AttachmentBuilder(card, { name: "welcome-card.png" });
    await channel.send({
      content: `Welcome to Turkish Airlines PTFS, ${member}!`,
      files: [attachment],
    });
  } catch (error) {
    console.error(`Failed to welcome ${member.user.tag} in ${member.guild.name}:`, error);
  }
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
  console.error("Failed to log in to Discord. Check DISCORD_TOKEN and bot configuration:", error);
  process.exit(1);
});
