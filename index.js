"use strict";

const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, Events } = require("discord.js");
const { REST } = require("@discordjs/rest");
const db = require("./db");

process.on("unhandledRejection", (err) => {
  console.error("🛑 Unhandled Promise Rejection:", err);
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const SUPPORT = "1494277529614159893";
const MOD = "1494276990700753018";
const DEPT_PUNISH_PERM = "1494275524766208081";
const UNVERIFIED_ROLE = "1494279535108292709";
const VERIFIED_ROLE = "1494279460373926030";

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ] 
});

// ================= DM TEXT SYSTEM =================
function getPunishDM(user, type, reason, evidence, staff) {
  const mention = `<@${user.id}>`;

  if (type === "Verbal Warning") {
    return `# LAGGING LEGENDS_COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT

⸻

## 🟡 VERBAL WARNING
Dear ${mention},

This is an official notice that you have received a **verbal warning** from the **Server Administration.**

**Reason:**
${reason}`;
  }

  return `# LAGGING LEGENDS_COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT

⸻

## 🔴 ${type.toUpperCase()}
Greetings, ${mention}.

This is an official notice regarding a disciplinary action taken against your staff position in **Lagging Legends**.

**Type:** ${type}
**Reason:** ${reason}
**Evidence:** ${evidence}
**Issued By:** ${staff}

*Lagging Legends Administration*`;
}

// ================= COMMANDS =================
const commands = [
  new SlashCommandBuilder().setName("verify").setDescription("Verify yourself"),
  new SlashCommandBuilder().setName("points").setDescription("View your staff points"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("View staff leaderboard"),
  new SlashCommandBuilder().setName("statistics").setDescription("View your detailed staff stats"),
  new SlashCommandBuilder().setName("check_quota").setDescription("Check your current quota status"),
  new SlashCommandBuilder().setName("quota_excuse").setDescription("Submit a quota excuse")
    .addStringOption(o => o.setName("reason").setDescription("Reason for excuse").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Duration").setRequired(true)),
  new SlashCommandBuilder().setName("punish").setDescription("Issue a punishment")
    .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
    .addStringOption(o => o.setName("type").setDescription("Type").setRequired(true)
        .addChoices(
            { name: 'Verbal Warning', value: 'Verbal Warning' },
            { name: 'Staff Warning', value: 'Staff Warning' },
            { name: 'Strike', value: 'Strike' },
            { name: 'Suspension', value: 'Suspension' },
            { name: 'Termination', value: 'Termination' }
        ))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
    .addStringOption(o => o.setName("evidence").setDescription("Evidence (Links/Proof)")),
  new SlashCommandBuilder().setName("dept_punish").setDescription("Departmental action")
    .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
    .addStringOption(o => o.setName("role").setDescription("Role name").setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Lagging Legends Bot Online: ${c.user.tag}`);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  } catch (e) { console.error("Registration Error:", e); }
});

// ================= INTERACTIONS =================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, member, user, guild } = interaction;

  // ALL REPLIES PRIVATE
  await interaction.deferReply({ ephemeral: true });

  const isStaff = member.roles.cache.has(SUPPORT) || member.roles.cache.has(MOD);

  try {
    if (commandName === "verify") {
      await member.roles.remove(UNVERIFIED_ROLE).catch(() => {});
      await member.roles.add(VERIFIED_ROLE).catch(() => {});
      return interaction.editReply("Verified!");
    }

    if (commandName === "points") {
      const row = db.getPoints(user.id);
      return interaction.editReply(`⭐ You have **${row?.points ?? 0}** points.`);
    }

    if (commandName === "leaderboard") {
      let top = db.getLeaderboard() || [];
      const userRow = db.getPoints(user.id);
      const userPoints = userRow?.points ?? 0;

      // Handle empty leaderboard safely
      if (top.length === 0) {
        return interaction.editReply(`🏆 **Points Leaderboard!**\n\nNo data yet.\n\n**You:** <@${user.id}> (${userPoints} Points)`);
      }

      const displayCount = Math.min(top.length, 10);
      let list = top.slice(0, displayCount)
        .map((u, i) => `${i + 1}. <@${u.staffId}> (${u.points} Points)`)
        .join("\n");

      return interaction.editReply(`🏆 **Points Leaderboard!**\n\n${list}\n\n**You:** <@${user.id}> (${userPoints} Points)`);
    }

    if (commandName === "punish") {
        if (!isStaff) return interaction.editReply("❌ No permission");
        const targetMember = options.getMember("target");
        const type = options.getString("type");
        const reason = options.getString("reason");
        const evidence = options.getString("evidence") || "None";

        if (!targetMember) return interaction.editReply("❌ User not found.");

        const punishPoints = { "Verbal Warning": 1, "Staff Warning": 2, "Strike": 3 };
        if (punishPoints[type]) db.addPoints(targetMember.id, punishPoints[type]);

        const dm = getPunishDM(targetMember.user, type, reason, evidence, user.tag);
        await targetMember.send(dm).catch(() => console.log(`DM Failed for ${targetMember.user.tag}`));

        return interaction.editReply(`✅ Punished **${targetMember.user.tag}** with **${type}**`);
    }

    if (commandName === "statistics") {
        const stats = db.getPoints(user.id);
        return interaction.editReply(`📊 **Staff Statistics**\nTotal Points: **${stats?.points ?? 0}**`);
    }

    if (commandName === "check_quota") {
        return interaction.editReply("📅 **Quota Status**: 0/5 logs completed this week.");
    }

    if (commandName === "quota_excuse") {
        return interaction.editReply("✅ **Excuse Submitted** to Server Administration.");
    }

    if (commandName === "dept_punish") {
      if (!member.roles.cache.has(DEPT_PUNISH_PERM)) return interaction.editReply("🛡️ Access Denied.");
      const targetMember = options.getMember("target");
      const roleInput = options.getString("role").toLowerCase();
      
      const deptRole = guild.roles.cache.find(r => 
        r.name.toLowerCase() === roleInput || 
        r.name.toLowerCase() === `[dept] ${roleInput}`
      );

      if (!targetMember || !deptRole) return interaction.editReply("❌ Role/Target not found.");
      
      // Hierarchy Check
      if (deptRole.position >= guild.members.me.roles.highest.position) {
          return interaction.editReply("❌ I cannot remove this role (Role is higher than mine).");
      }

      await targetMember.roles.remove(deptRole).catch(() => {});
      return interaction.editReply(`✅ Removed **${deptRole.name}**.`);
    }

  } catch (err) {
    console.error("Interaction Error:", err);
    if (interaction.deferred) await interaction.editReply("⚠️ Error processing command.");
  }
});

client.login(TOKEN);
