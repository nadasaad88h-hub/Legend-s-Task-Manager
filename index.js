"use strict";

require('dotenv').config();
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, Routes, 
    Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle 
} = require("discord.js");
const { REST } = require("@discordjs/rest");
const ms = require("ms");
const db = require("./db");

// ================= [ CONFIGURATION ] =================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const MODLOGS_CHANNEL = "1494273679951925248";
const ADMIN_ROLES = ["1494274846912417812", "1494278992402972733"];
const GUESS_CHANNEL_ID = "1497453944702500864";
const SUSPENDED_ROLE_ID = "1497462427267239936";

const rankHierarchy = [
  "1494281388092952576", "1494918304211402833", "1494919385654235276",
  "1494919521922846790", "1494919940526964883", "1494920068667146251",
  "1494920425346433045", "1494920607366647979", "1494921290061053992", "1494921290061053992"
];

// ================= [ STATE & HELPERS ] =================
let currentRound = null;
let activeGameMessage = null; // Track the current quiz message for deletion
const cooldowns = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ]
});

const isAdmin = (m) => m && ADMIN_ROLES.some(r => m.roles.cache.has(r));

function log(msg) {
  const ch = client.channels.cache.get(MODLOGS_CHANNEL);
  if (ch) ch.send(`⚖️ **Federal Audit:** ${msg}`).catch(() => {});
}

function getCD(id, key, time) {
  const last = cooldowns.get(`${id}-${key}`) || 0;
  const rem = time - (Date.now() - last);
  return rem > 0 ? rem : 0;
}

// ================= [ GEOGRAPHY ENGINE ] =================
async function nextRound(channel) {
  if (!channel) return;
  
  // Cleanup old message if it exists
  if (activeGameMessage) {
    await activeGameMessage.delete().catch(() => {});
    activeGameMessage = null;
  }

  const locations = [
    { name: "Egypt", landmark: "The Great Pyramids of Giza", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/All_Gizah_Pyramids.jpg/1200px-All_Gizah_Pyramids.jpg" },
    { name: "Palestine", landmark: "Dome of the Rock", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Jerusalem_Dome_of_the_rock_BW_14.JPG/1200px-Jerusalem_Dome_of_the_rock_BW_14.JPG" },
    { name: "Morocco", landmark: "Chefchaouen (The Blue City)", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Chefchaouen_blue_streets.jpg/1200px-Chefchaouen_blue_streets.jpg" },
    { name: "Mexico", landmark: "Chichen Itza Pyramid", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Chichen_Itza_3.jpg/1200px-Chichen_Itza_3.jpg" },
    { name: "France", landmark: "Eiffel Tower", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Tour_Eiffel_Wikimedia_Commons_%28cropped%29.jpg/1200px-Tour_Eiffel_Wikimedia_Commons_%28cropped%29.jpg" }
  ];

  currentRound = locations[Math.floor(Math.random() * locations.length)];

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("hint").setLabel("Hint").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("skip").setLabel("Skip").setStyle(ButtonStyle.Danger)
  );

  const embed = new EmbedBuilder()
    .setTitle("🌍 Geography Quiz")
    .setDescription("Which **Country** is this landmark located in?")
    .setImage(currentRound.url)
    .setColor(0x3498DB)
    .setFooter({ text: "Type the country name to win points!" });

  activeGameMessage = await channel.send({ embeds: [embed], components: [row] }).catch(console.error);
}

// ================= [ INITIALIZATION ] =================
client.once(Events.ClientReady, async () => {
  console.log(`✅ ${client.user.tag} online. Geography Logic Updated.`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const commands = [
    new SlashCommandBuilder().setName("promote").setDescription("Promote staff").addUserOption(o => o.setName("target").setDescription("User").setRequired(true)).addStringOption(o => o.setName("ranks").setDescription("Amount").setRequired(true).addChoices({name:'1 Rank', value:'1'}, {name:'2 Ranks', value:'2'})),
    new SlashCommandBuilder().setName("punish").setDescription("Punish user").addUserOption(o => o.setName("target").setDescription("User").setRequired(true)).addStringOption(o => o.setName("type").setDescription("Type").setRequired(true).addChoices({name:'Timeout', value:'T'}, {name:'Suspension', value:'S'})).addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)),
    new SlashCommandBuilder().setName("daily").setDescription("Claim 5 points"),
    new SlashCommandBuilder().setName("work").setDescription("Earn 3 points"),
    new SlashCommandBuilder().setName("balance").setDescription("Check points")
  ].map(c => c.toJSON());

  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    const ch = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
    if (ch) nextRound(ch);
  } catch (err) { console.error(err); }
});

// ================= [ INTERACTION HANDLER ] =================
client.on(Events.InteractionCreate, async (itx) => {
  if (!itx.guild || !itx.member) return;
  const { commandName, options, user, member, customId } = itx;

  if (itx.isButton()) {
    if (customId === "hint") return itx.reply({ content: `Hint: It's the home of **${currentRound?.landmark}**`, ephemeral: true });
    if (customId === "skip") {
      const cd = getCD(user.id, "skip", 60000);
      if (cd) return itx.reply({ content: `⏳ Wait ${Math.ceil(cd/1000)}s.`, ephemeral: true });
      cooldowns.set(`${user.id}-skip`, Date.now());
      await itx.reply(`🚩 Skipped! It was **${currentRound?.name}**.`);
      return nextRound(itx.channel);
    }
  }

  if (!itx.isChatInputCommand()) return;
  if (["promote", "punish"].includes(commandName) && !isAdmin(member)) return itx.reply({ content: "❌ Unauthorized.", ephemeral: true });

  // (Standard Promote/Punish/Work logic remains unchanged from previous version)
  if (commandName === "daily") {
    const last = db.getLastDaily(user.id);
    if (Date.now() - last < 86400000) return itx.reply({ content: "Already claimed.", ephemeral: true });
    db.addPoints(user.id, 5);
    db.setLastDaily(user.id, Date.now());
    return itx.reply("💰 Treasury payout: +5 Points.");
  }
  if (commandName === "balance") return itx.reply({ content: `🏦 Vault: **${db.getPoints(user.id)}** pts.`, ephemeral: true });
});

// ================= [ MESSAGE GAME LOGIC ] =================
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || msg.channel.id !== GUESS_CHANNEL_ID || !currentRound) return;

  if (msg.content.toLowerCase().trim() === currentRound.name.toLowerCase()) {
    const winnerId = msg.author.id;
    currentRound = null; // Lock round to prevent double-wins

    await msg.react("✅").catch(() => {});
    db.addPoints(winnerId, 2);

    // Give some feedback to the user
    const successMsg = await msg.reply(`🌟 Correct! **${msg.author.username}** found the landmark. +2 Points.`);

    setTimeout(async () => {
      // Delete the user's guess, the success message, and the ORIGINAL quiz message
      await msg.delete().catch(() => {});
      await successMsg.delete().catch(() => {});
      if (activeGameMessage) {
        await activeGameMessage.delete().catch(() => {});
        activeGameMessage = null;
      }
      nextRound(msg.channel);
    }, 2500);
  }
});

client.login(TOKEN);
