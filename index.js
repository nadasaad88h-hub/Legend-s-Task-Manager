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
const HIGH_APPROVAL = "1494275089963810967";
const DEPT_PUNISH_PERM = "1494275524766208081";

const ranks = [
  "1494281388092952576", "1494918304211402833", "1494919385654235276",
  "1494919521922846790", "1494919940526964883", "1494920068667146251",
  "1494920425346433045", "1494920607366647979", "1494920909130301490", 
  "1494921290061053992"
];

const SPECIAL_ROLES = ["1494922588428697654", "1494921889313984552"];

// ================= COMMAND DEFINITIONS =================
const commands = [
  new SlashCommandBuilder().setName("verify").setDescription("Verify yourself"),
  new SlashCommandBuilder().setName("points").setDescription("View your staff points"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("View staff leaderboard"),
  
  new SlashCommandBuilder().setName("promote").setDescription("Promote a staff member")
    .addUserOption(o => o.setName("target").setDescription("User to promote").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason (17+ chars)").setRequired(true))
    .addUserOption(o => o.setName("approver").setDescription("Approver for +2 jumps").setRequired(false)),

  new SlashCommandBuilder().setName("demote").setDescription("Demote a staff member")
    .addUserOption(o => o.setName("target").setDescription("User to demote").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason (17+ chars)").setRequired(true))
    .addUserOption(o => o.setName("approver").setDescription("Approver for -2 jumps").setRequired(false)),

  new SlashCommandBuilder().setName("terminate").setDescription("Terminate a staff member")
    .addUserOption(o => o.setName("target").setDescription("User to fire").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason (17+ chars)").setRequired(true))
    .addUserOption(o => o.setName("approver").setDescription("Required Mid-Approval").setRequired(true)),

  new SlashCommandBuilder().setName("revert_termination").setDescription("Restore roles to a fired user")
    .addUserOption(o => o.setName("target").setDescription("User to restore").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason (15+ chars)").setRequired(true))
    .addUserOption(o => o.setName("approver").setDescription("Required Mid-Approval").setRequired(true)),

  new SlashCommandBuilder().setName("dept_punish").setDescription("Departmental action")
    .addUserOption(o => o.setName("target").setDescription("User to punish").setRequired(true))
    .addStringOption(o => o.setName("role").setDescription("Exact role name").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
].map(command => command.toJSON());

// ================= CLIENT SETUP =================
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Production System Online: ${c.user.tag}`);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`✅ Registered ${commands.length} commands.`);
  } catch (error) {
    console.error("Command Registration Error:", error);
  }
});

const getRank = (member) => ranks.find(r => member.roles.cache.has(r));
const getRankIndex = (id) => ranks.indexOf(id);

// ================= INTERACTION HANDLER =================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, member, guild, channel } = interaction;

  // PUBLIC COMMANDS
  if (commandName === "verify") {
    if (member.roles.cache.has(VERIFIED_ROLE)) return interaction.reply({ content: "Already verified.", ephemeral: true });
    await member.roles.remove(UNVERIFIED_ROLE).catch(() => {});
    await member.roles.add(VERIFIED_ROLE).catch(() => {});
    return interaction.reply({ content: "Verified!", ephemeral: true });
  }

  if (commandName === "points") {
    const row = db.getPoints(member.id) || { points: 0 };
    return interaction.reply(`⭐ You have ${row.points} points.`);
  }

  if (commandName === "leaderboard") {
    const top = db.getLeaderboard();
    const text = top.slice(0, 10).map((u, i) => `${i + 1}. <@${u.staffId}> - ${u.points}`).join("\n") || "No data";
    return interaction.reply({ content: `🏆 **Leaderboard**\n${text}` });
  }

  // CHANNEL LOCK
  if (channel.id !== LOG_CHANNEL) {
    return interaction.reply({ content: "🛡️ Commands only allowed in the Log Channel.", ephemeral: true });
  }

  const targetMember = options.getMember("target");
  if (!targetMember) return interaction.reply({ content: "❌ Target member not found in server.", ephemeral: true });

  const reason = options.getString("reason");
  const approver = options.getMember("approver");

  // DEPT PUNISH
  if (commandName === "dept_punish") {
    if (!member.roles.cache.has(DEPT_PUNISH_PERM)) return interaction.reply({ content: "🛡️ Access Denied.", ephemeral: true });
    const roleInput = options.getString("role").toLowerCase();
    const deptRole = guild.roles.cache.find(r => r.name.toLowerCase() === `[dept] ${roleInput}` || r.name.toLowerCase() === roleInput);
    if (!deptRole) return interaction.reply({ content: "❌ Role not found.", ephemeral: true });
    await targetMember.roles.remove(deptRole).catch(() => {});
    return interaction.reply(`✅ Removed ${deptRole.name} from ${targetMember.user.tag}`);
  }

  // STAFF PERMISSION CHECK
  const isStaff = member.roles.cache.has(SUPPORT) || member.roles.cache.has(MOD);
  if (!isStaff) return interaction.reply({ content: "Unauthorized.", ephemeral: true });
  if (targetMember.id === member.id) return interaction.reply({ content: "🚫 Cannot act on yourself.", ephemeral: true });

  const senderRank = getRank(member);
  if (!senderRank) return interaction.reply({ content: "❌ You do not have a valid staff rank.", ephemeral: true });
  const senderIndex = getRankIndex(senderRank);

  // PROMOTE / DEMOTE
  if (commandName === "promote" || commandName === "demote") {
    const currentRank = getRank(targetMember);
    if (!currentRank) return interaction.reply({ content: "Target has no staff rank.", ephemeral: true });
    
    const targetIndex = getRankIndex(currentRank);
    if (senderIndex <= targetIndex) return interaction.reply({ content: "🛡️ Hierarchy Lock: Target is peer/superior.", ephemeral: true });
    if (reason.length < 17) return interaction.reply({ content: "📝 Reason too short.", ephemeral: true });

    const isMulti = !!approver;
    if (isMulti && approver.id === member.id) return interaction.reply({ content: "❌ Self-approval blocked.", ephemeral: true });

    let newIndex = commandName === "promote" ? (isMulti ? targetIndex + 2 : targetIndex + 1) : (isMulti ? targetIndex - 2 : targetIndex - 1);
    
    // RULE: Promotion cap (cannot promote to your own rank or higher)
    if (commandName === "promote" && newIndex >= senderIndex) {
      return interaction.reply({ content: `🛡️ Promotion Limit: You can only promote up to <@&${ranks[senderIndex - 1]}>.`, ephemeral: true });
    }

    if (newIndex < 0 || newIndex >= ranks.length) return interaction.reply({ content: "❌ Rank limit reached.", ephemeral: true });

    if (isMulti) {
      if (!(approver.roles.cache.has(HIGH_APPROVAL) || approver.roles.cache.has(MID_APPROVAL))) {
        return interaction.reply({ content: "❌ Invalid Approver.", ephemeral: true });
      }
    }

    await targetMember.roles.add(ranks[newIndex]);
    await targetMember.roles.remove(currentRank).catch(() => {});
    if (newIndex >= 6) for (const r of SPECIAL_ROLES) await targetMember.roles.add(r).catch(() => {});
    
    return interaction.reply(`✅ ${commandName === "promote" ? "Promoted" : "Demoted"} ${targetMember.user.tag} to <@&${ranks[newIndex]}>`);
  }

  // TERMINATE / REVERT
  if (commandName === "terminate" || commandName === "revert_termination") {
    const minLength = commandName === "terminate" ? 17 : 15;
    if (reason.length < minLength) return interaction.reply({ content: "📝 Reason too short.", ephemeral: true });
    if (!approver || approver.id === member.id || !approver.roles.cache.has(MID_APPROVAL)) {
      return interaction.reply({ content: "❌ Valid Mid-Approval required.", ephemeral: true });
    }

    if (commandName === "terminate") {
      const targetRank = getRank(targetMember);
      if (targetRank && senderIndex <= getRankIndex(targetRank)) return interaction.reply({ content: "🛡️ Hierarchy Lock.", ephemeral: true });

      const rolesToSave = targetMember.roles.cache.filter(r => ranks.includes(r.id)).map(r => r.id);
      db.saveTermination(targetMember.id, rolesToSave);
      await targetMember.roles.remove(rolesToSave);
      return interaction.reply(`✅ Terminated ${targetMember.user.tag}.`);
    } else {
      const saved = db.getTermination(targetMember.id);
      if (!saved) return interaction.reply({ content: "❌ No saved data found.", ephemeral: true });
      for (const r of saved.roles) await targetMember.roles.add(r).catch(() => {});
      db.deleteTermination(targetMember.id);
      return interaction.reply(`✅ Restored roles for ${targetMember.user.tag}.`);
    }
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  const role = member.guild.roles.cache.get(UNVERIFIED_ROLE);
  if (role) await member.roles.add(role).catch(() => {});
});

client.login(TOKEN);
