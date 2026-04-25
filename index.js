"use strict";

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { REST } = require("@discordjs/rest");
const ms = require("ms");
const db = require("./db");

// ===== ENV =====
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID.");
  process.exit(1);
}

// ===== PROMOTION CONFIG =====
const STAFF_ADMIN_CHANNEL = "1494273679951925248";
const HIGH_STAFF_ROLE = "1494278992402972733";
const MILESTONE_ROLE_1 = "1494921889313984552";
const MILESTONE_ROLE_2 = "1494922588428697654";
const MILESTONE_RANK_INDEX = 6;

const rankHierarchy = [
  { id: "1494281388092952576", cd: 86400000 },    // Rank 1 (NEVER REMOVE)
  { id: "1494918304211402833", cd: 259200000 },   // Rank 2
  { id: "1494919385654235276", cd: 432000000 },   // Rank 3
  { id: "1494919521922846790", cd: 604800000 },   // Rank 4
  { id: "1494919940526964883", cd: 1209600000 },  // Rank 5
  { id: "1494920068667146251", cd: 1209600000 },  // Rank 6
  { id: "1494920425346433045", cd: 2160000000 },  // Rank 7
  { id: "1494920607366647979", cd: 2160000000 },  // Rank 8
  { id: "1494920909130301490", cd: 2592000000 },  // Rank 9
  { id: "1494921290061053992", cd: 0 },           // Rank 10
];

// ===== PUNISHMENT CONFIG =====
const PUNISH_ACCESS_ROLES = [
  "1494276990700753018",
  "1494277529614159893",
  "1494284826747076619",
];
const BAN_ONLY_ROLE = "1494284826747076619";
const BYPASS_SELF_ROLE = "1494274846912417812";
const MODLOGS_CHANNEL = "1494273679951925248";

// ===== VERIFY CONFIG =====
const VERIFY_ADMIN_ROLE = "1494274846912417812";
const VERIFY_CHANNEL_ID = "1494235821899907153";
const COMMAND_LOGS_CHANNEL = "1494273679951925248";
const VERIFIED_ROLE_ID = "1494237255148371998";

// ===== POINTS / GAME CONFIG =====
const GUESS_CHANNEL_ID = "1497453944702500864";
const GAMES_CHANNEL_ID = "1497454650880950322";
const GAME_COLOR = 0xffd700;

const placeDatabase = [
  { name: "Morocco", url: "https://your-link.com/morocco.jpg" },
  { name: "USA", url: "https://your-link.com/usa.jpg" },
];

let currentCountry = "Morocco";
const skipCooldowns = new Map();

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
});

// ===== SLASH COMMAND DEFINITIONS =====
const commands = [
  new SlashCommandBuilder()
    .setName("promote")
    .setDescription("Promote a staff member")
    .addUserOption(o => o.setName("target").setDescription("User to promote").setRequired(true))
    .addStringOption(o => o.setName("type").setDescription("Amount of ranks to increase").setRequired(true)
      .addChoices(
        { name: "Normal Promotion", value: "1" },
        { name: "Move by 2 ranks", value: "2" },
        { name: "Move by 3 ranks", value: "3" },
      ))
    .addStringOption(o => o.setName("reason").setDescription("Reason for promotion").setRequired(true))
    .addStringOption(o => o.setName("approved_by").setDescription("N/A or @Mention").setRequired(true)),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Mute a user for a specific duration")
    .addUserOption(o => o.setName("target").setDescription("The user to mute").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Duration (1h, 1d, etc.)").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for mute").setRequired(true))
    .addStringOption(o => o.setName("evidence").setDescription("Link to evidence").setRequired(true)),

  new SlashCommandBuilder()
    .setName("punish")
    .setDescription("Issue a formal punishment")
    .addUserOption(o => o.setName("target").setDescription("The user to punish").setRequired(true))
    .addStringOption(o => o.setName("type").setDescription("Punishment Type").setRequired(true)
      .addChoices(
        { name: "Verbal Warning", value: "Verbal Warning" },
        { name: "Staff Warning", value: "Staff Warning" },
        { name: "Suspension", value: "Suspension" },
        { name: "Termination", value: "Termination" },
        { name: "Kick", value: "Kick" },
        { name: "Ban", value: "Ban" },
      ))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
    .addStringOption(o => o.setName("evidence").setDescription("Link to evidence").setRequired(true)),

  new SlashCommandBuilder()
    .setName("verify_panel")
    .setDescription("Deploy the verification panel (LL Leadership only)"),

  new SlashCommandBuilder()
    .setName("check_points")
    .setDescription("View the points leaderboard and your balance"),
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

// ===== READY =====
client.once(Events.ClientReady, async () => {
  console.log(`🛡️  Logged in as ${client.user.tag}.`);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`✅ Registered ${commands.length} commands.`);
  } catch (e) {
    console.error("Sync Error:", e);
  }
});

// ===== PUNISHMENT TEMPLATES =====
function buildPunishTemplate(type, target, reason, evidence, durationStr) {
  const header = "## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT";
  const tag = `**Hello, <@${target.id}>**`;

  switch (type) {
    case "Mute":
      return `${header}\n\n## ⚫️ Mute (${durationStr})\n\n${tag}\n\nYou have been Muted by the LL Server Administration due to a violation of the community rules. During this time, you will be unable to send messages in designated channels.\n\n**Duration: ${durationStr}**\nReason: ${reason}\nEvidence: ${evidence}\n\nRepeated violations after your mute expires may result in stronger punishments, including suspension or a permanent ban from the community.`;
    case "Verbal Warning":
      return `${header}\n\n## 🔴 Verbal Warning\n\n${tag}\n\nYou have received a Verbal Warning from the LL Server Administration due to a rule violation. Please review the server rules and ensure this behavior is not repeated.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nRepeating this behavior may result in further disciplinary action, including stronger punishments depending on the severity of future violations.`;
    case "Staff Warning":
      return `${header}\n\n## 🟡 Staff Warning\n\n${tag}\n\nYou have received a Staff Warning from the LL Server Administration due to misconduct or failure to meet staff expectations. This serves as a formal notice to improve your behavior and performance.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nFailure to improve or repeated issues may result in stronger action, including suspension or termination from your staff position.`;
    case "Suspension":
      return `${header}\n\n## 🟣 Suspension\n\n${tag}\n\nYou have been placed under Suspension by the LL Server Administration due to a serious rule violation or staff misconduct. During this period, your permissions and responsibilities may be restricted while management reviews the situation.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nFurther violations or failure to cooperate during this review may result in permanent removal from your position or additional disciplinary action.`;
    case "Termination":
      return `${header}\n\n## 🟤 Termination\n\n${tag}\n\nYou have been Terminated by the LL Server Administration due to repeated violations, misconduct, or failure to meet expectations. Your staff permissions and responsibilities have been removed.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nThis decision is considered final unless management decides otherwise. If appeals are permitted, they must be made respectfully through the proper process.`;
    case "Kick":
      return `${header}\n\n## ⚫️ Kick\n\n${tag}\n\nYou have been Kicked by the LL Server Administration due to a violation of the rules or disruptive behavior. You may be able to rejoin depending on the situation.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nReturning and repeating the same behavior may lead to stronger disciplinary action, including a temporary or permanent ban from the community.`;
    case "Ban":
      return `${header}\n\n## ⚫️ Ban\n\n${tag}\n\nYou have been Banned from Lagging Legends by the LL Server Administration due to severe rule violations, repeated misconduct, or actions harmful to the community. Your access to the server has been permanently removed.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nAny appeal, if allowed, must be submitted respectfully through the proper appeal process. False or disrespectful appeals may be denied immediately.`;
    default:
      return `${header}\n\n${tag}\n\nReason: ${reason}\nEvidence: ${evidence}`;
  }
}

// ===== GAME HELPER =====
async function startNextRound(channel) {
  if (!channel) return;
  const data = placeDatabase[Math.floor(Math.random() * placeDatabase.length)];
  currentCountry = data.name;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("reveal_letter").setLabel("Reveal first letter").setStyle(ButtonStyle.Warning),
    new ButtonBuilder().setCustomId("skip_flag").setLabel("Skip flag").setStyle(ButtonStyle.Danger),
  );

  const embed = new EmbedBuilder()
    .setTitle("🌍 Guess the Place!")
    .setDescription("Type the **Country Name** in chat to win 2 points!")
    .setImage(data.url)
    .setColor(GAME_COLOR);

  await channel.send({ embeds: [embed], components: [row] }).catch(console.error);
}

// ===== SINGLE INTERACTION ROUTER =====
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === "verify_btn") return handleVerifyButton(interaction);
      if (interaction.customId === "reveal_letter" || interaction.customId === "skip_flag")
        return handleGameButton(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {
      case "promote":      return handlePromote(interaction);
      case "timeout":      return handleTimeout(interaction);
      case "punish":       return handlePunish(interaction);
      case "verify_panel": return handleVerifyPanel(interaction);
      case "check_points": return handleCheckPoints(interaction);
    }
  } catch (err) {
    console.error("Interaction error:", err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      interaction.reply({ content: "⚠️ Unexpected error.", ephemeral: true }).catch(() => {});
    }
  }
});

// ===== /promote =====
async function handlePromote(interaction) {
  const { options, channelId, member, guild, user } = interaction;

  if (channelId !== STAFF_ADMIN_CHANNEL) {
    return interaction.reply({ content: "⚠️ You cannot use this command in this channel!", ephemeral: true });
  }

  const targetMember = options.getMember("target");
  const moveAmount = parseInt(options.getString("type"));
  const reason = options.getString("reason");
  const approvedInput = options.getString("approved_by");

  if (!targetMember) return interaction.reply({ content: "⚠️ User not found.", ephemeral: true });
  if (targetMember.id === user.id) return interaction.reply({ content: "⚠️ You CANNOT promote yourself!", ephemeral: true });

  const activeCD = db.getCooldown(targetMember.id);
  if (activeCD && Number(activeCD) > Date.now()) {
    return interaction.reply({ content: "⚠️ This user is on cooldown, cannot be promoted at this time!", ephemeral: true });
  }

  const hierarchyIds = rankHierarchy.map(r => r.id);
  const yourRankIndex = hierarchyIds.findIndex(id => member.roles.cache.has(id));
  const targetRankIndex = hierarchyIds.findIndex(id => targetMember.roles.cache.has(id));

  if (yourRankIndex === -1 || targetRankIndex === -1) {
    return interaction.reply({ content: "⚠️ Rank identification error.", ephemeral: true });
  }

  const newRankIndex = targetRankIndex + moveAmount;

  if (newRankIndex >= rankHierarchy.length) return interaction.reply({ content: "⚠️ Target is at maximum rank.", ephemeral: true });
  if (newRankIndex >= yourRankIndex) {
    return interaction.reply({ content: "⚠️ You cannot promote someone to your own rank or higher!", ephemeral: true });
  }

  const isHighStaff = member.roles.cache.has(HIGH_STAFF_ROLE);
  let approverMention = null;
  if (!isHighStaff && moveAmount > 1) {
    const match = approvedInput.match(/<@!?(\d+)>/);
    if (!match) return interaction.reply({ content: "⚠️ Multi-rank moves require High Staff @Mention!", ephemeral: true });
    const approver = await guild.members.fetch(match[1]).catch(() => null);
    if (!approver || !approver.roles.cache.has(HIGH_STAFF_ROLE))
      return interaction.reply({ content: "⚠️ Valid High Staff approval required!", ephemeral: true });
    approverMention = `<@${approver.id}>`;
  }

  try {
    if (targetRankIndex !== 0) await targetMember.roles.remove(hierarchyIds[targetRankIndex]);
    await targetMember.roles.add(hierarchyIds[newRankIndex]);

    if (newRankIndex >= MILESTONE_RANK_INDEX) {
      await targetMember.roles.add([MILESTONE_ROLE_1, MILESTONE_ROLE_2]).catch(() => {});
    }

    const cdTime = rankHierarchy[newRankIndex].cd;
    if (cdTime > 0) db.setCooldown(targetMember.id, Date.now() + cdTime);

    let output = `## *<@${targetMember.id}> Has been promoted by ${user.username}. Congratulations! 🎉*\n**Reason: ${reason}**`;
    if (approverMention) {
      output = `## *<@${targetMember.id}> Has been promoted by ${user.username}. Congratulations! 🎉*\n**Reason: ${reason}\nApproved by: ${approverMention}**`;
    }

    return interaction.reply({ content: output });
  } catch (err) {
    console.error(err);
    return interaction.reply({ content: "⚠️ Critical Error: Check Bot role hierarchy position!", ephemeral: true });
  }
}

// ===== /timeout =====
async function handleTimeout(interaction) {
  const { options, member, user, guild } = interaction;
  const target = options.getUser("target");
  const targetMember = options.getMember("target");

  if (target.id === user.id && !member.roles.cache.has(BYPASS_SELF_ROLE)) {
    return interaction.reply({ content: "⚠️ You cannot timeout yourself!", ephemeral: true });
  }
  if (!PUNISH_ACCESS_ROLES.some(id => member.roles.cache.has(id))) {
    return interaction.reply({ content: "❌ Unauthorized.", ephemeral: true });
  }
  if (!targetMember) return interaction.reply({ content: "⚠️ User not in server.", ephemeral: true });

  const durationStr = options.getString("duration");
  const durationMs = ms(durationStr);
  if (!durationMs || durationMs > 2419200000)
    return interaction.reply({ content: "⚠️ Invalid duration (Max 28d).", ephemeral: true });

  await interaction.deferReply({ ephemeral: true });
  const reason = options.getString("reason");
  const evidence = options.getString("evidence");
  const caseId = db.addPunishment(target.id, "Mute", reason, evidence, user.id);

  const muteDM = buildPunishTemplate("Mute", target, reason, evidence, durationStr);

  try {
    await target.send(muteDM).catch(() => {});
    await targetMember.timeout(durationMs, reason);
  } catch (e) { return interaction.editReply("⚠️ Execution failed."); }

  const log = new EmbedBuilder()
    .setTitle(`Mute // Case ${caseId}`)
    .setDescription(`**Target:** <@${target.id}>\n**Issuer:** <@${user.id}>\n**Duration:** ${durationStr}\n**Reason:** ${reason}\n**Evidence:** ${evidence}`)
    .setColor(0x000000).setTimestamp();

  const logChannel = guild.channels.cache.get(MODLOGS_CHANNEL);
  if (logChannel) await logChannel.send({ embeds: [log] });
  return interaction.editReply(`✅ Issued **Mute // Case ${caseId}**.`);
}

// ===== /punish =====
async function handlePunish(interaction) {
  const { options, member, user, guild } = interaction;
  const type = options.getString("type");
  const target = options.getUser("target");

  if (target.id === user.id && !member.roles.cache.has(BYPASS_SELF_ROLE)) {
    return interaction.reply({ content: "⚠️ You cannot punish yourself!", ephemeral: true });
  }

  const isGen = member.roles.cache.has("1494276990700753018") || member.roles.cache.has("1494277529614159893");
  if (member.roles.cache.has(BAN_ONLY_ROLE) && !isGen && type !== "Ban") {
    return interaction.reply({ content: "❌ Your role only permits issuing Bans.", ephemeral: true });
  }
  if (!isGen && !member.roles.cache.has(BAN_ONLY_ROLE))
    return interaction.reply({ content: "❌ Unauthorized.", ephemeral: true });

  await interaction.deferReply({ ephemeral: true });
  const reason = options.getString("reason");
  const evidence = options.getString("evidence");
  const caseId = db.addPunishment(target.id, type, reason, evidence, user.id);

  const dm = buildPunishTemplate(type, target, reason, evidence);

  try {
    await target.send(dm).catch(() => {});
    if (type === "Kick") await guild.members.kick(target.id, reason);
    if (type === "Ban") await guild.members.ban(target.id, { reason });
  } catch (e) { return interaction.editReply("⚠️ Action failed."); }

  const logEmbed = new EmbedBuilder()
    .setTitle(`${type} // Case ${caseId}`)
    .setDescription(`**Target:** <@${target.id}>\n**Issuer:** <@${user.id}>\n**Reason:** ${reason}\n**Evidence:** ${evidence}`)
    .setColor(0xff0000).setTimestamp();

  const logChannel = guild.channels.cache.get(MODLOGS_CHANNEL);
  if (logChannel) await logChannel.send({ embeds: [logEmbed] });
  return interaction.editReply(`✅ Issued **${type} // Case ${caseId}**.`);
}

// ===== /verify_panel =====
async function handleVerifyPanel(interaction) {
  if (!interaction.member.roles.cache.has(VERIFY_ADMIN_ROLE)) {
    return interaction.reply({ content: "❌ Unauthorized. This command is restricted to LL Leadership.", ephemeral: true });
  }
  if (interaction.channelId !== VERIFY_CHANNEL_ID) {
    return interaction.reply({ content: `⚠️ This command can only be used in <#${VERIFY_CHANNEL_ID}>.`, ephemeral: true });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("verify_btn").setLabel("Verify").setStyle(ButtonStyle.Success),
  );

  await interaction.channel.send({
    content: "Welcome to Lagging Legends! Click the button below to verify and unlock server features.",
    components: [row],
  });

  return interaction.reply({ content: "✅ Verification panel deployed.", ephemeral: true });
}

// ===== verify button =====
async function handleVerifyButton(interaction) {
  const { user, member, guild } = interaction;

  if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
    return interaction.reply({ content: "ℹ️ You are already verified!", ephemeral: true });
  }

  const diffMs = Date.now() - user.createdTimestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor(diffMs / (1000 * 60));

  let ageWarning = "";
  if (diffDays < 30) {
    const timeString = diffDays > 0 ? `${diffDays} DAYS` : (diffHrs > 0 ? `${diffHrs} HOURS` : `${diffMins} MINUTES`);
    ageWarning = `\n⚠️ **ACCOUNT CREATED ${timeString} AGO!** ⚠️`;
  }

  try {
    await member.roles.add(VERIFIED_ROLE_ID);
    await interaction.reply({ content: "✅ You have been successfully verified, go to 🧻 | roles to unlock more features!", ephemeral: true });

    const logChannel = guild.channels.cache.get(COMMAND_LOGS_CHANNEL);
    if (logChannel) logChannel.send(`<@${user.id}> has verified in the server.${ageWarning}`);
  } catch (error) {
    console.error("Verification Error:", error);
    return interaction.reply({ content: "⚠️ Failed to assign role. Please notify LL Leadership.", ephemeral: true });
  }
}

// ===== /check_points =====
async function handleCheckPoints(interaction) {
  const { user, channelId } = interaction;

  if (channelId !== GAMES_CHANNEL_ID) {
    return interaction.reply({ content: "❌ Wrong channel.", ephemeral: true });
  }

  const top10 = db.getTopPoints(10) || [];
  const myPoints = db.getPoints(user.id) || 0;

  const list = top10.length > 0
    ? top10.map((u, i) => `${i + 1}. <@${u.userId}> — ${u.points}`).join("\n")
    : "The bank is currently empty.";

  const embed = new EmbedBuilder()
    .setTitle("🏦 Bank!")
    .setDescription(`${list}\n\n**You:** ${myPoints} Points`)
    .setColor(GAME_COLOR);

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ===== game buttons =====
async function handleGameButton(interaction) {
  const { user, customId, channel } = interaction;

  if (customId === "reveal_letter") {
    const hint = currentCountry.charAt(0).toUpperCase();
    return interaction.reply({ content: `💡 The first letter is: **${hint}**`, ephemeral: true });
  }

  if (customId === "skip_flag") {
    const now = Date.now();
    const userSkips = skipCooldowns.get(user.id) || [];
    const validSkips = userSkips.filter(time => now - time < 3600000);

    if (validSkips.length >= 3) {
      return interaction.reply({ content: "⚠️ You have reached your skip limit (3 per hour)!", ephemeral: true });
    }

    validSkips.push(now);
    skipCooldowns.set(user.id, validSkips);

    await interaction.reply({ content: `<@${user.id}> has skipped the last place, it was **${currentCountry}**.` });
    return startNextRound(channel);
  }
}

// ===== guess engine =====
client.on(Events.MessageCreate, async (message) => {
  if (message.channel.id !== GUESS_CHANNEL_ID || message.author.bot) return;

  const guess = message.content.trim().toLowerCase();
  const correct = currentCountry.toLowerCase();

  if (guess === correct) {
    await message.react("✅").catch(() => {});
    db.addPoints(message.author.id, 2);

    setTimeout(async () => {
      try {
        if (message.deletable) await message.delete();
        startNextRound(message.channel);
      } catch (e) {}
    }, 2000);
  } else {
    if (message.content.length > 2) {
      await message.react("❌").catch(() => {});
      setTimeout(() => { if (message.deletable) message.delete().catch(() => {}); }, 3000);
    }
  }
});

client.login(TOKEN);
