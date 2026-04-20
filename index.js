"use strict";

const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, Events } = require("discord.js");
const { REST } = require("@discordjs/rest");
const db = require("./db");

// ================= GLOBAL ERROR HANDLING =================
process.on("unhandledRejection", (err) => {
  console.error("🛑 Unhandled Promise Rejection:", err);
});

// ================= ENV =================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// ================= CONSTANTS =================
const LOG_CHANNEL = "1494273679951925248";
const UNVERIFIED_ROLE = "1494279535108292709";
const VERIFIED_ROLE = "1494279460373926030";
const SUPPORT = "1494277529614159893";
const MOD = "1494276990700753018";
const MID_APPROVAL = "1494278992402972733";
const DEPT_PUNISH_PERM = "1494275524766208081";

const ranks = [
  "1494281388092952576", "1494918304211402833", "1494919385654235276",
  "1494919521922846790", "1494919940526964883", "1494920068667146251",
  "1494920425346433045", "1494920607366647979", "1494920909130301490", 
  "1494921290061053992"
];

// ================= SLASH COMMANDS =================
const commands = [
  new SlashCommandBuilder().setName("verify").setDescription("Verify yourself"),
  new SlashCommandBuilder().setName("points").setDescription("View your staff points"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("View staff leaderboard"),
  new SlashCommandBuilder().setName("dept_punish").setDescription("Departmental action")
    .addUserOption(o => o.setName("target").setDescription("User to punish").setRequired(true))
    .addStringOption(o => o.setName("role").setDescription("Exact role name").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
].map(command => command.toJSON());

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent 
  ] 
});
const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot Online: ${c.user.tag}`);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Slash Commands Registered.");
  } catch (e) { console.error(e); }
});

// ================= HELPERS =================
const getRank = (member) => ranks.find(r => member.roles.cache.has(r));
const getRankIndex = (id) => ranks.indexOf(id);

function parseFields(content) {
  const data = {};
  content.split("\n").forEach(line => {
    const [k, ...v] = line.split(":");
    if (!v.length) return;
    data[k.trim().toLowerCase()] = v.join(":").trim();
  });
  return data;
}

function extractId(text) {
  if (!text) return null;
  const match = text.match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

// ================= INTERACTION HANDLER =================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, member, guild } = interaction;

  // Acknowledge quickly to prevent "did not respond"
  await interaction.deferReply({ ephemeral: (commandName === 'verify') });

  try {
    if (commandName === "verify") {
      if (member.roles.cache.has(VERIFIED_ROLE)) return interaction.editReply("Already verified.");
      await member.roles.remove(UNVERIFIED_ROLE).catch(() => {});
      await member.roles.add(VERIFIED_ROLE).catch(() => {});
      return interaction.editReply("Verified!");
    }

    if (commandName === "points") {
      const row = db.getPoints(member.id) || { points: 0 };
      return interaction.editReply(`⭐ You have ${row.points} points.`);
    }

    if (commandName === "leaderboard") {
      let top = db.getLeaderboard();
      if (!Array.isArray(top)) top = []; // FIX: Ensures .slice() won't crash
      const text = top.slice(0, 10).map((u, i) => `${i + 1}. <@${u.staffId}> - ${u.points}`).join("\n") || "No data";
      return interaction.editReply(`🏆 **Leaderboard**\n${text}`);
    }

    if (commandName === "dept_punish") {
      if (!member.roles.cache.has(DEPT_PUNISH_PERM)) return interaction.editReply("🛡️ Access Denied.");
      const targetMember = options.getMember("target");
      const roleInput = options.getString("role").toLowerCase();
      const deptRole = guild.roles.cache.find(r => r.name.toLowerCase() === `[dept] ${roleInput}` || r.name.toLowerCase() === roleInput);
      if (!targetMember || !deptRole) return interaction.editReply("❌ Target or Role not found.");
      await targetMember.roles.remove(deptRole).catch(() => {});
      return interaction.editReply(`✅ Removed ${deptRole.name} from ${targetMember.user.tag}`);
    }
  } catch (err) {
    console.error(err);
    if (interaction.deferred) await interaction.editReply("⚠️ An error occurred.");
  }
});

// ================= MESSAGE HANDLER (LOGS) =================
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || message.channel.id !== LOG_CHANNEL) return;

  const data = parseFields(message.content);
  const type = message.content.split("\n")[0].toLowerCase().trim();

  try {
    const isStaff = message.member.roles.cache.has(SUPPORT) || message.member.roles.cache.has(MOD);
    if (!isStaff) return;

    const targetId = extractId(data["their username"]);
    if (!targetId) return;
    const target = await message.guild.members.fetch(targetId).catch(() => null);
    if (!target) return message.react("❌");

    const reason = data["reason"] || "";
    const approverId = extractId(data["approved by"]);
    const senderRank = getRank(message.member);
    const senderIndex = senderRank ? getRankIndex(senderRank) : -1;

    if (type === "promotion" || type === "demotion") {
      const currentRank = getRank(target);
      if (!currentRank || senderIndex <= getRankIndex(currentRank)) return message.react("🛡️");
      if (reason.length < 17) return message.react("📝");

      const isMulti = !!approverId;
      let newIndex = type === "promotion" ? (isMulti ? getRankIndex(currentRank) + 2 : getRankIndex(currentRank) + 1) : (isMulti ? getRankIndex(currentRank) - 2 : getRankIndex(currentRank) - 1);

      if (type === "promotion" && newIndex >= senderIndex) return message.react("🚫");
      if (newIndex < 0 || newIndex >= ranks.length) return message.react("❌");

      await target.roles.add(ranks[newIndex]);
      await target.roles.remove(currentRank).catch(() => {});
      return message.react("✅");
    }

    if (type === "termination") {
      if (reason.length < 17 || !approverId) return message.react("❌");
      const rolesToSave = target.roles.cache.filter(r => ranks.includes(r.id)).map(r => r.id);
      db.saveTermination(target.id, rolesToSave);
      await target.roles.remove(rolesToSave);
      return message.react("✅");
    }

    if (type === "termination-revert") {
      const saved = db.getTermination(target.id);
      if (!saved) return message.react("❌");
      for (const r of saved.roles) await target.roles.add(r).catch(() => {});
      db.deleteTermination(target.id);
      return message.react("✅");
    }
  } catch (err) { console.error(err); }
});

client.on(Events.GuildMemberAdd, async (m) => {
  const r = m.guild.roles.cache.get(UNVERIFIED_ROLE);
  if (r) await m.roles.add(r).catch(() => {});
});

client.login(TOKEN);
