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
  "1494920425346433045", "1494920607366647979", "1494920909130301490", "1494921290061053992"
];

// ================= [ STATE & HELPERS ] =================
let currentRound = null;
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
  
  const places = [
    { name: "Morocco", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Flag_of_Morocco.svg/1200px-Flag_of_Morocco.svg.png" },
    { name: "Palestine", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Flag_of_Palestine.svg/1200px-Flag_of_Palestine.svg.png" },
    { name: "Egypt", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Flag_of_Egypt.svg/1200px-Flag_of_Egypt.svg.png" },
    { name: "Algeria", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Flag_of_Algeria.svg/1200px-Flag_of_Algeria.svg.png" }
  ];

  currentRound = places[Math.floor(Math.random() * places.length)];

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("hint").setLabel("Hint").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("skip").setLabel("Skip").setStyle(ButtonStyle.Danger)
  );

  const embed = new EmbedBuilder()
    .setTitle("🌍 Geography Quiz")
    .setDescription("Identify the location shown below!")
    .setImage(currentRound.url)
    .setColor(0xFFD700);

  await channel.send({ embeds: [embed], components: [row] }).catch(console.error);
}

// ================= [ INITIALIZATION ] =================
client.once(Events.ClientReady, async () => {
  console.log(`✅ ${client.user.tag} is online and operational.`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const commands = [
    new SlashCommandBuilder().setName("promote").setDescription("Promote a user").addUserOption(o => o.setName("target").setRequired(true)).addStringOption(o => o.setName("ranks").setRequired(true).addChoices({name:'1 Rank', value:'1'}, {name:'2 Ranks', value:'2'})),
    new SlashCommandBuilder().setName("punish").setDescription("Issue punishment").addUserOption(o => o.setName("target").setRequired(true)).addStringOption(o => o.setName("type").setRequired(true).addChoices({name:'Timeout', value:'T'}, {name:'Suspension', value:'S'})).addStringOption(o => o.setName("reason").setRequired(true)),
    new SlashCommandBuilder().setName("daily").setDescription("Claim 5 daily points"),
    new SlashCommandBuilder().setName("work").setDescription("Earn 3 points (30m CD)"),
    new SlashCommandBuilder().setName("balance").setDescription("Check your points")
  ].map(c => c.toJSON());

  try {
    console.log("🔄 Synchronizing Commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("🏛️ Commands synchronized.");
    
    const ch = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
    if (ch) nextRound(ch);
  } catch (err) {
    console.error("❌ Sync Error:", err);
  }
});

// ================= [ INTERACTION HANDLER ] =================
client.on(Events.InteractionCreate, async (itx) => {
  if (!itx.guild || !itx.member) return;
  const { commandName, options, user, member, customId } = itx;

  // --- BUTTONS ---
  if (itx.isButton()) {
    if (customId === "hint") return itx.reply({ content: `Starts with: **${currentRound?.name[0] || "?"}**`, ephemeral: true });
    if (customId === "skip") {
      const cd = getCD(user.id, "skip", 60000);
      if (cd) return itx.reply({ content: `⏳ Wait ${Math.ceil(cd/1000)}s.`, ephemeral: true });
      
      cooldowns.set(`${user.id}-skip`, Date.now());
      const oldAns = currentRound?.name || "the target";
      await itx.reply(`🚩 Skipped! It was **${oldAns}**.`);
      return nextRound(itx.channel);
    }
  }

  // --- SLASH COMMANDS ---
  if (!itx.isChatInputCommand()) return;

  // Admin Check
  if (["promote", "punish"].includes(commandName) && !isAdmin(member)) {
      return itx.reply({ content: "❌ Unauthorized.", ephemeral: true });
  }

  if (commandName === "promote") {
    const target = options.getMember("target");
    const step = parseInt(options.getString("ranks"));
    if (!target) return itx.reply("User not found.");

    const currentIdx = rankHierarchy.findIndex(r => target.roles.cache.has(r));
    const newIdx = Math.min(rankHierarchy.length - 1, (currentIdx === -1 ? 0 : currentIdx) + step);

    const rolesToRemove = rankHierarchy.filter(r => target.roles.cache.has(r));
    if (rolesToRemove.length) await target.roles.remove(rolesToRemove).catch(() => {});
    await target.roles.add(rankHierarchy[newIdx]).catch(() => {});

    log(`📈 **Promotion**: <@${target.id}> promoted to rank index ${newIdx}`);
    return itx.reply(`✅ <@${target.id}> has been promoted.`);
  }

  if (commandName === "punish") {
    const target = options.getMember("target");
    const type = options.getString("type");
    if (!target || !target.manageable) return itx.reply("I cannot punish this user.");

    if (type === "T") {
      await target.timeout(ms("1h"), options.getString("reason"));
    } else {
      const roles = target.roles.cache.filter(r => r.id !== itx.guild.id).map(r => r.id);
      db.saveRoles(target.id, roles);
      await target.roles.set([SUSPENDED_ROLE_ID]);
    }
    log(`⚖️ **Punishment**: ${type} issued to <@${target.id}>`);
    return itx.reply("The sentence has been carried out.");
  }

  if (commandName === "work") {
    const cd = getCD(user.id, "work", 1800000);
    if (cd) return itx.reply({ content: `⚒️ Too tired. Wait ${Math.ceil(cd/60000)}m.`, ephemeral: true });
    db.addPoints(user.id, 3);
    cooldowns.set(`${user.id}-work`, Date.now());
    return itx.reply("⚒️ Shift completed. +3 Points.");
  }

  if (commandName === "daily") {
    const last = db.getLastDaily(user.id);
    if (Date.now() - last < 86400000) return itx.reply({ content: "Already claimed today.", ephemeral: true });
    db.addPoints(user.id, 5);
    db.setLastDaily(user.id, Date.now());
    return itx.reply("💰 Daily treasury payout: +5 Points.");
  }

  if (commandName === "balance") {
    const pts = db.getPoints(user.id);
    return itx.reply({ content: `🏦 Your balance: **${pts}** points.`, ephemeral: true });
  }
});

// ================= [ MESSAGE GAME ] =================
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || msg.channel.id !== GUESS_CHANNEL_ID || !currentRound) return;

  if (msg.content.toLowerCase().trim() === currentRound.name.toLowerCase()) {
    currentRound = null; // Lock round
    await msg.react("✅").catch(() => {});
    db.addPoints(msg.author.id, 2);
    setTimeout(() => {
      msg.delete().catch(() => {});
      nextRound(msg.channel);
    }, 1500);
  }
});

client.login(TOKEN);
