"use strict";

const { Client, GatewayIntentBits } = require("discord.js");

// ───── CONFIG ─────
const TOKEN = process.env.DISCORD_TOKEN;

// ───── IMPORT SYSTEM MODULES ─────
// (These files you will create later inside folders)
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

// ───── READY ─────
client.once("ready", () => {
  console.log(`✅ Bot Online: ${client.user.tag}`);
});

// ───── INTERACTIONS (Buttons / Slash Commands) ─────
client.on("interactionCreate", async (interaction) => {
  try {
    // Send interaction to all systems
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
