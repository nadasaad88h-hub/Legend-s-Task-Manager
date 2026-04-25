'use strict';

require('dotenv').config();
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, Routes, 
    Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    PermissionFlagsBits, REST 
} = require("discord.js");
const ms = require("ms");
const db = require("./db");

// ================= [ CONFIGURATION ] =================
const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;

const MODLOGS_CHANNEL = process.env.CHANNEL_STAFF_LOG || "1494273679951925248";
const GUESS_CHANNEL_ID = process.env.CHANNEL_GUESS || "1497453944702500864";
const SUSPENDED_ROLE_ID = process.env.ROLE_SUSPENDED || "1497462427267239936";

const rankHierarchy = [
  "1494281388092952576", "1494918304211402833", "1494919385654235276",
  "1494919521922846790", "1494919940526964883", "1494920068667146251",
  "1494920425346433045", "1494920607366647979", "1494920909130301490", "1494921290061053992"
];

// ================= [ STATE & HELPERS ] =================
let currentRound = null;
let activeGameMessage = null;
const cooldowns = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ]
});

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
    .setDescription("Identify the **Country** where this landmark is located!")
    .setImage(currentRound.url)
    .setColor(0x3498DB)
    .setFooter({ text: "Type the country name to win points!" });

  activeGameMessage = await channel.send({ embeds: [embed], components: [row] }).catch(console.error);
}

// ================= [ INITIALIZATION ] =================
client.once(Events.ClientReady, async () => {
  console.log(`✅ ${client.user.tag} Online. Protocol: Landmark Engine.`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const commands = [
    new SlashCommandBuilder()
      .setName("promote")
      .setDescription("Promote staff member")
      .addUserOption(o => o.setName("target").setDescription("User to promote").setRequired(true))
      .addStringOption(o => o.setName("ranks").setDescription("Amount of ranks").setRequired(true).addChoices({name:'1 Rank', value:'1'}, {name:'2 Ranks', value:'2'}))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
      .setName("punish")
      .setDescription("Issue punishment")
      .addUserOption(o => o.setName("target").setDescription("User to punish").setRequired(true))
      .addStringOption(o => o.setName("type").setDescription("Punishment type").setRequired(true).addChoices({name:'Timeout', value:'T'}, {name:'Suspension', value:'S'}))
      .addStringOption(o => o.setName("reason").setDescription("The reason for punishment").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder().setName("daily").setDescription("Claim 5 daily points"),
    new SlashCommandBuilder().setName("work").setDescription("Earn 3 points (30m CD)"),
    new SlashCommandBuilder().setName("balance").setDescription("Check your wallet")
  ].map(c => c.toJSON());

  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    const ch = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
    if (ch) nextRound(ch);
  } catch (err) { console.error("Sync Error:", err); }
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

  if (commandName === "promote") {
    const target = options.getMember("target");
    const step = parseInt(options.getString("ranks"));
    const currentIdx = rankHierarchy.findLastIndex(r => target.roles.cache.has(r));
    const newIdx = Math.min(rankHierarchy.length - 1, (currentIdx === -1 ? 0 : currentIdx) + step);

    await target.roles.remove(rankHierarchy.filter(r => target.roles.cache.has(r))).catch(() => {});
    await target.roles.add(rankHierarchy[newIdx]).catch(() => {});
    log(`📈 Promotion: <@${target.id}> advanced.`);
    return itx.reply(`✅ <@${target.id}> promoted to rank index ${newIdx}.`);
  }

  if (commandName === "punish") {
    const target = options.getMember("target");
    const type = options.getString("type");
    if (type === "T") await target.timeout(ms("1h"), options.getString("reason"));
    else {
      db.saveRoles(target.id, target.roles.cache.map(r => r.id));
      await target.roles.set([SUSPENDED_ROLE_ID]);
    }
    return itx.reply("Sentence executed.");
  }

  if (commandName === "daily") {
    const last = db.getLastDaily(user.id);
    if (Date.now() - last < 86400000) return itx.reply({ content: "Treasury is closed. Come back tomorrow.", ephemeral: true });
    db.addPoints(user.id, 5);
    db.setLastDaily(user.id, Date.now());
    return itx.reply("💰 Treasury payout: +5 Points.");
  }

  if (commandName === "balance") {
    return itx.reply({ content: `🏦 Vault: **${db.getPoints(user.id)}** pts.`, ephemeral: true });
  }

  if (commandName === "work") {
    const cd = getCD(user.id, "work", 1800000);
    if (cd) return itx.reply({ content: `⚒️ Wait ${Math.ceil(cd/60000)}m.`, ephemeral: true });
    db.addPoints(user.id, 3);
    cooldowns.set(`${user.id}-work`, Date.now());
    return itx.reply("⚒️ Work complete. +3 Points.");
  }
});

// ================= [ MESSAGE GAME & CLEANUP ] =================
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || msg.channel.id !== GUESS_CHANNEL_ID) return;

  if (!currentRound) return msg.delete().catch(() => {});

  const userGuess = msg.content.toLowerCase().trim();
  const correctAnswer = currentRound.name.toLowerCase();

  if (userGuess === correctAnswer) {
    currentRound = null; 
    await msg.react("✅").catch(() => {});
    db.addPoints(msg.author.id, 2);
    const successMsg = await msg.reply(`🌟 Correct! **${msg.author.username}** found the country.`);

    setTimeout(async () => {
      await msg.delete().catch(() => {});
      await successMsg.delete().catch(() => {});
      if (activeGameMessage) await activeGameMessage.delete().catch(() => {});
      nextRound(msg.channel);
    }, 2500);
  } else {
    try {
      await msg.react("❌");
      setTimeout(() => msg.delete().catch(() => {}), 1000);
    } catch (e) { msg.delete().catch(() => {}); }
  }
});

client.login(TOKEN);
