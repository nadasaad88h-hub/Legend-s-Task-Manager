"use strict";

const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder 
} = require("discord.js");

// ───── CONFIG ─────
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// ───── SYSTEM MODULES ─────
const ticketHandler = require("./tickets/handler");
const taskHandler = require("./tasks/handler");
const joinTracker = require("./joinTracker/handler");
const countingHandler = require("./counting/handler");

// ───── CLIENT ─────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ───── SLASH COMMANDS ─────
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if bot is alive")
    .toJSON()
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

// ───── REGISTER COMMANDS ─────
async function registerCommands() {
  try {
    console.log("Registering slash commands...");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log("Slash commands registered!");
  } catch (err) {
    console.error("Command register error:", err);
  }
}

// ───── READY ─────
client.once("ready", async () => {
  console.log(`✅ Bot Online: ${client.user.tag}`);

  // auto register slash commands
  await registerCommands();
});

// ───── INTERACTIONS ─────
client.on("interactionCreate", async (interaction) => {
  try {
    await ticketHandler(interaction, client);
    await taskHandler(interaction, client);
    await countingHandler(interaction, client);
  } catch (err) {
    console.error("Interaction Error:", err);
  }
});

// ───── JOIN TRACKER ─────
client.on("guildMemberAdd", async (member) => {
  try {
    await joinTracker(member, client);
  } catch (err) {
    console.error("Join Tracker Error:", err);
  }
});

// ───── LOGIN ─────
client.login(TOKEN);
