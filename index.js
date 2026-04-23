"use strict";

const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, Events } = require("discord.js");
const { REST } = require("@discordjs/rest");
const db = require("./db"); 

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const STAFF_ADMIN_CHANNEL = "1494273679951925248";
const HIGH_STAFF_ROLE = "1494278992402972733";
const COOLDOWN_ADMIN_ROLE = "1494921889313984552";

const MILESTONE_ROLE_1 = "1494921889313984552";
const MILESTONE_ROLE_2 = "1494922588428697654";
// Rank index 6 is the 7th role in the list (1494920425346433045)
const MILESTONE_RANK_INDEX = 6; 

// RANK HIERARCHY (Index 0 = Rank 1, Index 9 = Rank 10)
const rankHierarchy = [
  { id: "1494281388092952576", cd: 86400000 },    // Rank 1: 1 Day
  { id: "1494918304211402833", cd: 259200000 },   // Rank 2: 3 Days
  { id: "1494919385654235276", cd: 432000000 },   // Rank 3: 5 Days
  { id: "1494919521922846790", cd: 604800000 },   // Rank 4: 1 Week
  { id: "1494919940526964883", cd: 1209600000 },  // Rank 5: 14 Days
  { id: "1494920068667146251", cd: 1209600000 },  // Rank 6: 14 Days
  { id: "1494920425346433045", cd: 2160000000 },  // Rank 7: 25 Days
  { id: "1494920607366647979", cd: 2160000000 },  // Rank 8: 25 Days
  { id: "1494920909130301490", cd: 2592000000 },  // Rank 9: 30 Days
  { id: "1494921290061053992", cd: 0 }            // Rank 10: No CD
];

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

const commands = [
  new SlashCommandBuilder()
    .setName("promote")
    .setDescription("Promote a staff member")
    .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
    .addStringOption(o => o.setName("type").setDescription("Type").setRequired(true)
        .addChoices({ name: 'Normal Promotion', value: '1' }, { name: 'Move by 2 ranks', value: '2' }, { name: 'Move by 3 ranks', value: '3' }))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
    .addStringOption(o => o.setName("approved_by").setDescription("N/A or @Mention").setRequired(true)),
  new SlashCommandBuilder()
    .setName("cooldown")
    .setDescription("Manage promotion cooldowns")
    .addSubcommand(s => s.setName("clear").setDescription("Clear a user's cooldown").addUserOption(o => o.setName("target").setDescription("User").setRequired(true)))
    .addSubcommand(s => s.setName("check").setDescription("Check a user's cooldown").addUserOption(o => o.setName("target").setDescription("User").setRequired(true)))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once(Events.ClientReady, async () => {
  console.log("✅ Lagging Legends Protocol Fully Active");
  try { await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands }); } catch (e) { console.error(e); }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, channelId, member, guild, user } = interaction;

  // ================= COOLDOWN MANAGEMENT =================
  if (commandName === "cooldown") {
    if (!member.roles.cache.has(COOLDOWN_ADMIN_ROLE)) return interaction.reply({ content: "❌ You do not have permission to manage cooldowns.", ephemeral: true });
    const target = options.getMember("target");
    const sub = options.getSubcommand();

    if (sub === "clear") {
      db.clearCooldown(target.id);
      return interaction.reply({ content: `✅ Cooldown cleared for <@${target.id}>.`, ephemeral: true });
    }
    if (sub === "check") {
      const ts = db.getCooldown(target.id);
      if (!ts || Number(ts) < Date.now()) return interaction.reply({ content: "🟢 This user has no active cooldown.", ephemeral: true });
      return interaction.reply({ content: `⏳ <@${target.id}> is on cooldown until <t:${Math.floor(Number(ts) / 1000)}:F>.`, ephemeral: true });
    }
  }

  // ================= PROMOTION LOGIC =================
  if (commandName === "promote") {
    if (channelId !== STAFF_ADMIN_CHANNEL) return interaction.reply({ content: "⚠️ You cannot use this command in this channel!", ephemeral: true });
    
    const targetMember = options.getMember("target");
    const moveAmount = parseInt(options.getString("type"));
    const reason = options.getString("reason");
    const approvedInput = options.getString("approved_by");

    if (!targetMember) return interaction.reply({ content: "⚠️ User not found.", ephemeral: true });
    if (targetMember.id === user.id) return interaction.reply({ content: "⚠️ You CANNOT promote yourself!", ephemeral: true });

    // 1. Cooldown Guard
    const activeCD = db.getCooldown(targetMember.id);
    if (activeCD && Number(activeCD) > Date.now()) {
        return interaction.reply({ content: `⚠️ This user is on cooldown! Available <t:${Math.floor(Number(activeCD) / 1000)}:R>.`, ephemeral: true });
    }

    // 2. Hierarchy Indices
    const hierarchyIds = rankHierarchy.map(r => r.id);
    const yourRankIndex = hierarchyIds.findIndex(id => member.roles.cache.has(id));
    const targetRankIndex = hierarchyIds.findIndex(id => targetMember.roles.cache.has(id));

    if (yourRankIndex === -1) return interaction.reply({ content: "⚠️ You lack a recognized staff rank.", ephemeral: true });
    if (targetRankIndex === -1) return interaction.reply({ content: "⚠️ Target lacks a recognized staff rank.", ephemeral: true });

    const newRankIndex = targetRankIndex + moveAmount;

    // 3. Security Checks
    if (newRankIndex >= rankHierarchy.length) return interaction.reply({ content: "⚠️ Move exceeds maximum rank!", ephemeral: true });
    if (newRankIndex >= yourRankIndex) return interaction.reply({ content: `⚠️ You cannot promote someone to your rank (Rank ${yourRankIndex + 1}) or higher!`, ephemeral: true });

    // 4. Approval Logic
    const isHighStaff = member.roles.cache.has(HIGH_STAFF_ROLE);
    let approverMention = null;
    if (!isHighStaff && moveAmount > 1) {
      const match = approvedInput.match(/<@!?(\d+)>/);
      if (!match) return interaction.reply({ content: "⚠️ Multi-rank moves require a valid @Mention approver!", ephemeral: true });
      const approver = await guild.members.fetch(match[1]).catch(() => null);
      if (!approver || !approver.roles.cache.has(HIGH_STAFF_ROLE)) return interaction.reply({ content: "⚠️ Approver must have High Staff role!", ephemeral: true });
      approverMention = `<@${approver.id}>`;
    }

    // 5. Execution
    try {
      await targetMember.roles.remove(hierarchyIds[targetRankIndex]);
      await targetMember.roles.add(hierarchyIds[newRankIndex]);

      // Milestone Check
      if (newRankIndex >= MILESTONE_RANK_INDEX) {
          if (!targetMember.roles.cache.has(MILESTONE_ROLE_1)) await targetMember.roles.add(MILESTONE_ROLE_1);
          if (!targetMember.roles.cache.has(MILESTONE_ROLE_2)) await targetMember.roles.add(MILESTONE_ROLE_2);
      }

      // 6. Set Cooldown based on the NEW rank
      const cdDuration = rankHierarchy[newRankIndex].cd;
      if (cdDuration > 0) {
          db.setCooldown(targetMember.id, Date.now() + cdDuration);
      }

      let output = `## *<@${targetMember.id}> Has been promoted by ${user.username}. Congratulations! 🎉*\n**Reason: ${reason}**`;
      if (approverMention) output = `## *<@${targetMember.id}> Has been promoted by ${user.username}. Congratulations! 🎉*\n**Reason: ${reason}\nApproved by: ${approverMention}**`;

      return interaction.reply({ content: output });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "⚠️ Bot permission error. Check role hierarchy!", ephemeral: true });
    }
  }
});

client.login(TOKEN);
