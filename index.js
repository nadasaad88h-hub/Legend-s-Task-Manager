"use strict";

const { Client, GatewayIntentBits } = require("discord.js");
const db = require("./db");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once("ready", () => {
  console.log(`✅ Task Manager Online: ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options } = interaction;

  // ───── ADD POINTS ─────
  if (commandName === "addpoints") {
    const user = options.getUser("user");
    const amount = options.getInteger("amount");

    db.addPoints(user.id, amount);

    return interaction.reply(`✅ Added ${amount} points to ${user.username}`);
  }

  // ───── REMOVE POINTS ─────
  if (commandName === "removepoints") {
    const user = options.getUser("user");
    const amount = options.getInteger("amount");

    db.addPoints(user.id, -amount);

    return interaction.reply(`❌ Removed ${amount} points from ${user.username}`);
  }

  // ───── LEADERBOARD ─────
  if (commandName === "leaderboard") {
    return interaction.reply("📊 Leaderboard feature coming soon (we can build it next).");
  }
});

client.login(process.env.DISCORD_TOKEN);
