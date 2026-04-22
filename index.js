"use strict";

const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, Events } = require("discord.js");
const { REST } = require("@discordjs/rest");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const STAFF_ADMIN_CHANNEL = "1494273679951925248";
const HIGH_STAFF_ROLE = "1494278992402972733";

const rankHierarchy = [
  "1494281388092952576", 
  "1494918304211402833", 
  "1494919385654235276",
  "1494919521922846790",
  "1494919940526964883",
  "1494920068667146251",
  "1494920425346433045",
  "1494920607366647979",
  "1494920909130301490", 
  "1494921290061053992"  
];

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

const commands = [
  new SlashCommandBuilder()
    .setName("promote")
    .setDescription("Promote a staff member")
    .addUserOption(o => o.setName("target").setDescription("User to promote").setRequired(true))
    .addStringOption(o => o.setName("type").setDescription("Promotion Type").setRequired(true)
        .addChoices(
            { name: 'Normal Promotion', value: '1' },
            { name: 'Move by 2 ranks', value: '2' },
            { name: 'Move by 3 ranks', value: '3' }
        ))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
    .addStringOption(o => o.setName("approved_by").setDescription("N/A or @Mention").setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once(Events.ClientReady, async () => {
  console.log("✅ Promotion Engine Ready.");
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  } catch (e) { console.error(e); }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, channelId, member, guild, user } = interaction;

  if (commandName === "promote") {
    // 1. Channel Restriction
    if (channelId !== STAFF_ADMIN_CHANNEL) {
      return interaction.reply({ content: "⚠️ You cannot use this command in this channel!", ephemeral: true });
    }

    const targetMember = options.getMember("target");
    const moveAmount = parseInt(options.getString("type"));
    const reason = options.getString("reason");
    const approvedInput = options.getString("approved_by");

    if (!targetMember) return interaction.reply({ content: "⚠️ Could not find that user.", ephemeral: true });

    // 2. Self-Promote Check
    if (targetMember.id === user.id) {
      return interaction.reply({ content: "⚠️ You CANNOT promote yourself!", ephemeral: true });
    }

    const isHighStaff = member.roles.cache.has(HIGH_STAFF_ROLE);
    let approverMention = "";

    // 3. Approval Logic
    if (!isHighStaff && moveAmount > 1) {
      const match = approvedInput.match(/<@!?(\d+)>/);
      if (!match) {
        return interaction.reply({ content: "⚠️ This promotion type requires a valid @Mention in the Approved By section!", ephemeral: true });
      }
      
      const approver = await guild.members.fetch(match[1]).catch(() => null);
      if (!approver || !approver.roles.cache.has(HIGH_STAFF_ROLE)) {
        return interaction.reply({ content: "⚠️ The approver must be a user with the High Staff role!", ephemeral: true });
      }
      approverMention = `<@${approver.id}>`;
    }

    // 4. Rank Calculation
    // We find the highest rank from our list that the user currently has
    const currentRankIndex = rankHierarchy.findIndex(id => targetMember.roles.cache.has(id));
    
    if (currentRankIndex === -1) {
      return interaction.reply({ content: "⚠️ This user does not have a recognized staff rank role.", ephemeral: true });
    }

    const newRankIndex = currentRankIndex + moveAmount;

    if (newRankIndex >= rankHierarchy.length) {
      return interaction.reply({ content: "⚠️ This user is already at the max rank or the move is too large.", ephemeral: true });
    }

    // 5. Action
    try {
      await targetMember.roles.remove(rankHierarchy[currentRankIndex]);
      await targetMember.roles.add(rankHierarchy[newRankIndex]);

      // 6. Final Message Construction
      let output = "";
      if (isHighStaff || moveAmount === 1) {
        // Normal Format (High staff doesn't need to show approval, Normal Promo doesn't show it)
        output = `<@${targetMember.id}> Has been promoted by ${user.username}!\nReason: ${reason}`;
      } else {
        // Multi-Rank Promo by non-high staff
        output = `<@${targetMember.id}> Has been promoted by ${user.username} with an approval from ${approverMention}\nReason: ${reason}`;
      }

      return interaction.reply({ content: output, ephemeral: false });

    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "⚠️ Error updating roles. Is the bot rank high enough?", ephemeral: true });
    }
  }
});

client.login(TOKEN);
