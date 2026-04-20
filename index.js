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

const LOG_CHANNEL = "1494273679951925248";
const UNVERIFIED_ROLE = "1494279535108292709";
const VERIFIED_ROLE = "1494279460373926030";
const SUPPORT = "1494277529614159893";
const MOD = "1494276990700753018";
const DEPT_PUNISH_PERM = "1494275524766208081";

const ranks = [
  "1494281388092952576", "1494918304211402833", "1494919385654235276",
  "1494919521922846790", "1494919940526964883", "1494920068667146251",
  "1494920425346433045", "1494920607366647979", "1494920909130301490", 
  "1494921290061053992"
];

const commands = [
  new SlashCommandBuilder().setName("verify").setDescription("Verify yourself"),
  new SlashCommandBuilder().setName("points").setDescription("View your staff points"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("View staff leaderboard"),
  new SlashCommandBuilder().setName("statistics").setDescription("View your detailed staff stats"),
  new SlashCommandBuilder().setName("check_quota").setDescription("Check your current quota status"),
  new SlashCommandBuilder().setName("quota_excuse").setDescription("Submit a quota excuse")
    .addStringOption(o => o.setName("reason").setDescription("Reason for excuse").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("How long?").setRequired(true)),
  new SlashCommandBuilder().setName("punish").setDescription("Punish a staff member")
    .addUserOption(o => o.setName("target").setDescription("The user to punish").setRequired(true))
    .addStringOption(o => o.setName("type").setDescription("Type of punishment").setRequired(true)
        .addChoices(
            { name: 'Verbal Warning', value: 'Verbal Warning' },
            { name: 'Staff Warning', value: 'Staff Warning' },
            { name: 'Strike', value: 'Strike' }
        ))
    .addStringOption(o => o.setName("reason").setDescription("Reason for punishment").setRequired(true)),
  new SlashCommandBuilder().setName("dept_punish").setDescription("Departmental action")
    .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
    .addStringOption(o => o.setName("role").setDescription("Exact role name").setRequired(true))
].map(command => command.toJSON());

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});
const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Lagging Legends Bot Online: ${c.user.tag}`);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  } catch (e) { console.error(e); }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, member, user, guild } = interaction;

  // ENSURE ALL REPLIES ARE PRIVATE
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
      const displayCount = top.length < 10 ? top.length : 10;
      let list = top.slice(0, displayCount).map((u, i) => `${i + 1}. <@${u.staffId}> (${u.points} Points)`).join("\n") || "No staff data available yet.";
      return interaction.editReply(`🏆 **Points Leaderboard!**\n\n${list}\n\n**You:** <@${user.id}> (${userRow?.points ?? 0} Points)`);
    }

    if (["statistics", "check_quota", "quota_excuse", "punish"].includes(commandName)) {
        if (!isStaff) return interaction.editReply("🛡️ Access Denied: Staff only.");
        
        if (commandName === "punish") {
            const targetMember = options.getMember("target");
            const type = options.getString("type");
            const reason = options.getString("reason");

            if (!targetMember) return interaction.editReply("❌ Target not found in the server.");

            const punishPoints = { "Verbal Warning": 1, "Staff Warning": 2, "Strike": 3 };
            db.addPoints(targetMember.id, punishPoints[type]);

            const dmMessage = `# LAGGING LEGENDS_COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT

Greetings, <@${targetMember.id}>.

This is an official notice regarding a disciplinary action taken against your staff position in **Lagging Legends**.

**Type:** ${type}
**Reason:** ${reason}
**Issued By:** <@${user.id}>

*Lagging Legends Administration*`;

            await targetMember.send(dmMessage).catch(() => console.log(`Could not DM ${targetMember.user.tag}`));
            return interaction.editReply(`✅ Successfully issued **${type}** to ${targetMember.user.tag}.`);
        }

        if (commandName === "statistics") {
            const stats = db.getPoints(user.id);
            return interaction.editReply(`📊 **Staff Statistics**\nPoints Earned: **${stats?.points ?? 0}**`);
        }

        if (commandName === "check_quota") {
            return interaction.editReply("📅 **Quota Status**: 0/5 logs completed this week.");
        }

        if (commandName === "quota_excuse") {
            return interaction.editReply("✅ **Excuse Submitted**.");
        }
    }

    if (commandName === "dept_punish") {
      if (!member.roles.cache.has(DEPT_PUNISH_PERM)) return interaction.editReply("🛡️ Access Denied.");
      const targetMember = options.getMember("target");
      const roleInput = options.getString("role").toLowerCase();
      const deptRole = guild.roles.cache.find(r => r.name.toLowerCase() === roleInput || r.name.toLowerCase() === `[dept] ${roleInput}`);

      if (!targetMember || !deptRole) return interaction.editReply("❌ Role or Target not found.");
      
      // Safety check for role hierarchy
      if (deptRole.position >= guild.members.me.roles.highest.position) {
          return interaction.editReply("❌ I cannot remove this role because it is higher than mine in the role list.");
      }

      await targetMember.roles.remove(deptRole).catch(() => {});
      return interaction.editReply(`✅ Removed **${deptRole.name}**.`);
    }

  } catch (err) { 
    console.error("Interaction Error:", err); 
    if (interaction.deferred) await interaction.editReply("⚠️ An internal error occurred.");
  }
});

client.login(TOKEN);
