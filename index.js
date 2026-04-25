"use strict";

const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { REST } = require("@discordjs/rest");
const ms = require("ms");
const db = require("./db");

// ================= [ CONFIG ] =================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const MODLOGS_CHANNEL = "1494273679951925248";
const ADMIN_ROLES = ["1494274846912417812", "1494278992402972733"];
const GUESS_CHANNEL_ID = "1497453944702500864";

const rankHierarchy = [
  "1494281388092952576", "1494918304211402833", "1494919385654235276",
  "1494919521922846790", "1494919940526964883", "1494920068667146251",
  "1494920425346433045", "1494920607366647979", "1494920909130301490", "1494921290061053992"
];

// ================= [ STATE ] =================
let currentRound = null;
const cooldowns = new Map();

// ================= [ HELPERS ] =================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const isAdmin = (m) => m && ADMIN_ROLES.some(r => m.roles.cache.has(r));

function log(msg) {
  const ch = client.channels.cache.get(MODLOGS_CHANNEL);
  if (ch) ch.send(`🛡️ **System Log:** ${msg}`).catch(() => {});
}

function getCooldown(id, key, msTime) {
  const last = cooldowns.get(`${id}-${key}`) || 0;
  const remaining = msTime - (Date.now() - last);
  return remaining > 0 ? remaining : 0;
}

// ================= [ GEOGRAPHY ENGINE ] =================
async function nextRound(channel) {
  if (!channel) return;
  const places = [
    { name: "Morocco", url: "https://i.imgur.com/B9O08N6.png" },
    { name: "Palestine", url: "https://i.imgur.com/7S8Y9B0.png" }
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

  await channel.send({ embeds: [embed], components: [row] }).catch(() => {});
}

// ================= [ INITIALIZATION ] =================
client.once(Events.ClientReady, async () => {
  console.log("LL System Online");
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const commands = [
    new SlashCommandBuilder()
      .setName("promote")
      .setDescription("Promote a user within the hierarchy")
      .addUserOption(o => o.setName("target").setDescription("The user to promote").setRequired(true))
      .addStringOption(o => o.setName("ranks").setDescription("Number of ranks to increase").setRequired(true))
  ].map(c => c.toJSON());

  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    const ch = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
    if (ch) nextRound(ch);
  } catch (err) { console.error("Command Registration Failed:", err); }
});

// ================= [ INTERACTION HANDLER ] =================
client.on(Events.InteractionCreate, async (itx) => {
  if (!itx.guild || !itx.member) return;

  const { commandName, options, user, member, customId } = itx;

  if (itx.isButton()) {
    if (customId === "hint") {
        const hint = currentRound?.name?.[0] ? `Starts with: **${currentRound.name[0]}**` : "No active round.";
        return itx.reply({ content: hint, ephemeral: true });
    }

    if (customId === "skip") {
      const cd = getCooldown(user.id, "skip", 60000);
      if (cd) return itx.reply({ content: `⏳ Skip is on cooldown (**${Math.ceil(cd/1000)}s**).`, ephemeral: true });

      cooldowns.set(`${user.id}-skip`, Date.now());
      const oldName = currentRound?.name || "the target";
      await itx.reply(`🚩 <@${user.id}> skipped. It was **${oldName}**.`);
      return nextRound(itx.channel);
    }
  }

  if (!itx.isChatInputCommand()) return;

  if (commandName === "promote") {
    if (!isAdmin(member)) return itx.reply({ content: "❌ Unauthorized: Administrative clearance required.", ephemeral: true });

    const target = options.getMember("target");
    const step = parseInt(options.getString("ranks"));

    if (!target) return itx.reply({ content: "❌ Target user not found in this jurisdiction.", ephemeral: true });
    if (isNaN(step) || step <= 0) return itx.reply({ content: "❌ Invalid rank increment.", ephemeral: true });

    const currentIdx = rankHierarchy.findIndex(r => target.roles.cache.has(r));
    // If no rank (-1), starting + step 1 results in rankHierarchy[0]
    const newIdx = Math.min(rankHierarchy.length - 1, currentIdx + step);

    if (newIdx === currentIdx) return itx.reply({ content: "ℹ️ Target is already at the maximum authorized rank.", ephemeral: true });

    // ATOMIC UPDATE: Filter out the old hierarchy roles and add the new one
    const rolesToRemove = rankHierarchy.filter(r => target.roles.cache.has(r));
    if (rolesToRemove.length > 0) await target.roles.remove(rolesToRemove).catch(() => {});
    await target.roles.add(rankHierarchy[newIdx]).catch(() => {});

    log(`📈 **Rank Escalation**: <@${target.id}> advanced from index ${currentIdx} to ${newIdx}.`);
    return itx.reply(`✅ Promotion successful: <@${target.id}> is now rank index **${newIdx}**.`);
  }
});

// ================= [ MESSAGE ENGINE ] =================
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || msg.channel.id !== GUESS_CHANNEL_ID || !currentRound) return;

  if (msg.content.toLowerCase().trim() === currentRound.name.toLowerCase()) {
    const winnerId = msg.author.id;
    await msg.react("✅").catch(() => {});
    db.addPoints(winnerId, 2);

    // Lock the round to prevent double-guessing during the timeout
    currentRound = null; 

    setTimeout(async () => {
      await msg.delete().catch(() => {});
      nextRound(msg.channel);
    }, 1500);
  }
});

client.login(TOKEN);
