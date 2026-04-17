"use strict";

const { Client, GatewayIntentBits } = require("discord.js");

// ───── CONFIG ─────
const TOKEN = process.env.DISCORD_TOKEN;

// ───── IMPORT SYSTEM MODULES ─────
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

// ───── INTERACTIONS (SAFE ROUTER) ─────
client.on("interactionCreate", async (interaction) => {
  try {
    // Ignore anything we don't handle
    if (!interaction.isButton() && !interaction.isChatInputCommand()) return;

    // Run each system safely (no crashing chain)
    try {
      await ticketHandler(interaction, client);
    } catch (err) {
      console.error("Ticket Handler Error:", err);
    }

    try {
      await taskHandler(interaction, client);
    } catch (err) {
      console.error("Task Handler Error:", err);
    }

    try {
      await countingHandler(interaction, client);
    } catch (err) {
      console.error("Counting Handler Error:", err);
    }

  } catch (err) {
    console.error("Interaction Router Error:", err);
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
