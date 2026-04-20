"use strict";

const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, PermissionFlagsBits, Events } = require("discord.js");
const { REST } = require("@discordjs/rest"); // FIX: Correct REST import
const db = require("./db");

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
const HIGH_APPROVAL = "1494275089963810967";
const MID_APPROVAL = "1494278992402972733";
const DEPT_PUNISH_PERM = "1494275524766208081";
const SPECIAL_ROLES = ["1494922588428697654", "1494921889313984552"];

const ranks = [
  "1494281388092952576", "1494918304211402833", "1494919385654235276",
  "1494919521922846790", "1494919940526964883", "1494920068667146251",
  "1494920425346433045", "1494920607366647979", "1494920909130301490", 
  "1494921290061053992"
];

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
    .addUserOption(o => o.setName("approver").setDescription("Required Approver").setRequired(true)),
  new SlashCommandBuilder().setName("dept_punish").setDescription("Departmental action")
    .addUserOption(o => o.setName("target").setDescription("User to punish").setRequired(true))
    .addStringOption(o => o.setName("role").setDescription("Exact role name").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
].map(command => command.toJSON());

// ================= CLIENT SETUP =================
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const rest = new REST({ version: "10" }).setToken(TOKEN);

// FIX: Changed to ClientReady
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Slash Command Bot Online: ${c.user.tag}`);
  console.log("CLIENT_ID:", CLIENT_ID);
  console.log("GUILD_ID:", GUILD_ID);

  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`✅ Registered ${commands.length} commands.`);
  } catch (error) {
    console.error("Failed to register commands:", error);
  }
});

// ================= HELPERS =================
const getRank = (member) => ranks.find(r => member.roles.cache.has(r));
const getRankIndex = (id) => ranks.indexOf(id);

// ================= INTERACTION HANDLER =================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, member, guild, channel } = interaction;

  // VERIFY
  if (commandName === "verify") {
    if (member.roles.cache.has(VERIFIED_ROLE)) return interaction.reply({ content: "Already verified.", ephemeral: true });
    await member.roles.remove(UNVERIFIED_ROLE).catch(() => {});
    await member.roles.add(VERIFIED_ROLE).catch(() => {});
    return interaction.reply({ content: "Verified!", ephemeral: true });
  }

  // POINTS & LEADERBOARD
  if (commandName === "points") {
    const row = db.getPoints(member.id) || { points: 0 };
    return interaction.reply(`⭐ You have ${row.points} points.`);
  }

  if (commandName === "leaderboard") {
    const top = db.getLeaderboard();
    const text = top.slice(0, 10).map((u, i) => `${i + 1}. <@${u.staffId}> - ${u.points}`).join("\n") || "No data";
    return interaction.reply({ content: `🏆 **Leaderboard**\n${text}` });
  }

  // STAFF SYSTEM SECURITY
  if (channel.id !== LOG_CHANNEL) return interaction.reply({ content: "Commands only allowed in the Log Channel.", ephemeral: true });
  
  const isStaff = member.roles.cache.has(SUPPORT) || member.roles.cache.has(MOD);
  const targetMember = options.getMember("target");
  const reason = options.getString("reason");
  const approver = options.getMember("approver");

  if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });

  // DEPT PUNISH
  if (commandName === "dept_punish") {
    if (!member.roles.cache.has(DEPT_PUNISH_PERM)) return interaction.reply({ content: "🛡️ Hierarchy Access Denied.", ephemeral: true });
    const roleInput = options.getString("role").toLowerCase();
    const deptRole = guild.roles.cache.find(r => r.name.toLowerCase() === `[dept] ${roleInput}` || r.name.toLowerCase() === roleInput);
    if (!deptRole) return interaction.reply({ content: "❌ Role not found.", ephemeral: true });
    await targetMember.roles.remove(deptRole).catch(() => {});
    return interaction.reply(`✅ Successfully removed ${deptRole.name} from ${targetMember.user.tag}`);
  }

  // CORE STAFF COMMANDS
  if (!isStaff) return interaction.reply({ content: "Unauthorized.", ephemeral: true });
  if (targetMember.id === member.id) return interaction.reply({ content: "🚫 You cannot act on yourself.", ephemeral: true });

  const senderRank = getRank(member);
  if (!senderRank) return interaction.reply({ content: "You do not have a staff rank.", ephemeral: true });
  const senderIndex = getRankIndex(senderRank);

  // PROMOTION / DEMOTION
  if (commandName === "promote" || commandName === "demote") {
    const currentRank = getRank(targetMember);
    if (!currentRank) return interaction.reply({ content: "Target has no rank.", ephemeral: true });
    
    const targetIndex = getRankIndex(currentRank);
    if (senderIndex <= targetIndex) return interaction.reply({ content: "🛡️ Hierarchy Lock: Target is peer/superior.", ephemeral: true });
    if (reason.length < 17) return interaction.reply({ content: "📝 Reason too short (17+ chars).", ephemeral: true });

    const isMulti = !!approver;
    if (isMulti && approver.id === member.id) return interaction.reply({ content: "❌ Cannot self-approve multi-jumps.", ephemeral: true });

    let newIndex = commandName === "promote" ? (isMulti ? targetIndex + 2 : targetIndex + 1) : (isMulti ? targetIndex - 2 : targetIndex - 1);
    if (newIndex < 0 || newIndex >= ranks.length) return interaction.reply({ content: "❌ Target is at rank limit.", ephemeral: true });

    if (isMulti) {
      if (!(approver.roles.cache.has(HIGH_APPROVAL) || approver.roles.cache.has(MID_APPROVAL))) return interaction.reply({ content: "❌ Invalid Approver.", ephemeral: true });
    }

    await targetMember.roles.add(ranks[newIndex]);
    await targetMember.roles.remove(currentRank).catch(() => {});
    if (newIndex >= 6) for (const r of SPECIAL_ROLES) await targetMember.roles.add(r).catch(() => {});
    
    return interaction.reply(`✅ ${commandName === "promote" ? "Promoted" : "Demoted"} ${targetMember.user.tag} to <@&${ranks[newIndex]}>`);
  }

  // TERMINATE
  if (commandName === "terminate") {
    if (reason.length < 17) return interaction.reply({ content: "📝 Reason too short.", ephemeral: true });
    if (approver.id === member.id || !approver.roles.cache.has(MID_APPROVAL)) return interaction.reply({ content: "❌ Valid Approver Required.", ephemeral: true });
    
    const currentRank = getRank(targetMember);
    if (currentRank && senderIndex <= getRankIndex(currentRank)) return interaction.reply({ content: "🛡️ Hierarchy Lock.", ephemeral: true });

    const rolesToSave = targetMember.roles.cache.filter(r => ranks.includes(r.id)).map(r => r.id);
    db.saveTermination(targetMember.id, rolesToSave);
    await targetMember.roles.remove(rolesToSave);
    return interaction.reply(`✅ Terminated ${targetMember.user.tag}. Roles saved.`);
  }

  // REVERT
  if (commandName === "revert_termination") {
    if (reason.length < 15) return interaction.reply({ content: "📝 Reason too short.", ephemeral: true });
    if (approver.id === member.id) return interaction.reply({ content: "❌ Valid Approver Required.", ephemeral: true });
    
    const saved = db.getTermination(targetMember.id);
    if (!saved) return interaction.reply({ content: "❌ No saved data found.", ephemeral: true });
    
    for (const r of saved.roles) await targetMember.roles.add(r).catch(() => {});
    db.deleteTermination(targetMember.id);
    return interaction.reply(`✅ Restored roles for ${targetMember.user.tag}.`);
  }
});

// Join Event
client.on(Events.GuildMemberAdd, async (member) => {
  const role = member.guild.roles.cache.get(UNVERIFIED_ROLE);
  if (role) await member.roles.add(role).catch(() => {});
});

client.login(TOKEN);
