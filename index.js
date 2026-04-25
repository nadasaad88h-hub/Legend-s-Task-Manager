'use strict';

// ================= [ IMPORTS ] =================
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  REST,
  Routes,
} = require('discord.js');
const db = require('./db');
const ms = require('ms');
require('dotenv').config();

// ================= [ ENVIRONMENT VARIABLES ] =================
const TOKEN     = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID;

// ================= [ ROLE IDs ] =================
const ROLE_IDS = {
  // Staff hierarchy (lowest → highest)
  TRIAL_STAFF:        process.env.ROLE_TRIAL_STAFF        || '0',
  STAFF:              process.env.ROLE_STAFF               || '0',
  SENIOR_STAFF:       process.env.ROLE_SENIOR_STAFF        || '0',
  HEAD_STAFF:         process.env.ROLE_HEAD_STAFF          || '0',
  MANAGEMENT:         process.env.ROLE_MANAGEMENT          || '0',
  ADMIN:              process.env.ROLE_ADMIN               || '0',
  // Special roles
  OWNER:              process.env.ROLE_OWNER               || '0',
  VERIFIED:           process.env.ROLE_VERIFIED            || '0',
};

// Staff hierarchy array (index = rank level, 0 = lowest)
const STAFF_HIERARCHY = [
  ROLE_IDS.TRIAL_STAFF,
  ROLE_IDS.STAFF,
  ROLE_IDS.SENIOR_STAFF,
  ROLE_IDS.HEAD_STAFF,
  ROLE_IDS.MANAGEMENT,
  ROLE_IDS.ADMIN,
];

const STAFF_HIERARCHY_NAMES = [
  'Trial Staff',
  'Staff',
  'Senior Staff',
  'Head Staff',
  'Management',
  'Admin',
];

// ================= [ CHANNEL IDs ] =================
const STAFF_LOG_CHANNEL_ID  = process.env.CHANNEL_STAFF_LOG   || '0';
const GENERAL_CHANNEL_ID    = process.env.CHANNEL_GENERAL      || '0';
const GUESS_CHANNEL_ID      = process.env.CHANNEL_GUESS        || '0';
const COMMAND_CHANNEL_ID    = process.env.CHANNEL_COMMANDS     || '0';

// ================= [ GAME STATE ] =================
let currentRound      = null;
let activeGameMessage = null;

// Locations used in the guessing game
const GAME_LOCATIONS = [
  { name: 'spawn',       hint: 'Where every journey begins.' },
  { name: 'market',      hint: 'Buy low, sell high.' },
  { name: 'arena',       hint: 'Only the strong survive here.' },
  { name: 'library',     hint: 'Knowledge is power.' },
  { name: 'harbor',      hint: 'Ships come and go with the tide.' },
  { name: 'castle',      hint: 'The seat of power.' },
  { name: 'forest',      hint: 'Ancient trees whisper secrets.' },
  { name: 'dungeon',     hint: 'Few enter, fewer leave.' },
  { name: 'tavern',      hint: 'Stories flow as freely as the ale.' },
  { name: 'blacksmith',  hint: 'Steel is shaped by fire and will.' },
];

// ================= [ GAME HELPERS ] =================
function pickRandomLocation() {
  return GAME_LOCATIONS[Math.floor(Math.random() * GAME_LOCATIONS.length)];
}

async function nextRound(channel) {
  currentRound = pickRandomLocation();

  const embed = new EmbedBuilder()
    .setTitle('🗺️  Where Am I?')
    .setDescription(`**Hint:** ${currentRound.hint}\n\nType the location name to win **+2 points**!`)
    .setColor(0x5865f2)
    .setFooter({ text: 'First correct answer wins!' });

  activeGameMessage = await channel.send({ embeds: [embed] }).catch(() => null);
}

// ================= [ CLIENT INITIALIZATION ] =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ================= [ SLASH COMMAND DEFINITIONS ] =================
const commands = [
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your current points and bank balance.'),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily points reward.'),

  new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work to earn some extra points.'),

  new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promote a staff member to the next rank.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The staff member to promote.')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for the promotion.')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('demote')
    .setDescription('Demote a staff member to the previous rank.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The staff member to demote.')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for the demotion.')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('terminate')
    .setDescription('Remove all staff roles from a member.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The staff member to terminate.')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for the termination.')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('punish')
    .setDescription('Deduct points from a member as a punishment.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The member to punish.')
        .setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('amount')
        .setDescription('Number of points to deduct.')
        .setRequired(true)
        .setMinValue(1))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for the punishment.')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('reward')
    .setDescription('Award bonus points to a member.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The member to reward.')
        .setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('amount')
        .setDescription('Number of points to award.')
        .setRequired(true)
        .setMinValue(1))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for the reward.')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the top points earners in the server.'),

  new SlashCommandBuilder()
    .setName('deposit')
    .setDescription('Deposit points into your bank.')
    .addIntegerOption(opt =>
      opt.setName('amount')
        .setDescription('Amount of points to deposit.')
        .setRequired(true)
        .setMinValue(1)),

  new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Withdraw points from your bank.')
    .addIntegerOption(opt =>
      opt.setName('amount')
        .setDescription('Amount of points to withdraw.')
        .setRequired(true)
        .setMinValue(1)),
].map(cmd => cmd.toJSON());

// ================= [ READY EVENT ] =================
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Register slash commands with Discord
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('🔄 Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('❌ Failed to register slash commands:', err);
  }

  // Start the guessing game in the designated channel
  const guessChannel = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
  if (guessChannel) {
    nextRound(guessChannel);
  }
});

// ================= [ SLASH COMMAND HANDLER ] =================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // ── balance ──────────────────────────────────────────────
  if (commandName === 'balance') {
    const points = db.getPoints(interaction.user.id);
    const bank   = db.getBank(interaction.user.id);
    const embed  = new EmbedBuilder()
      .setTitle(`💰 Balance — ${interaction.user.username}`)
      .addFields(
        { name: 'Wallet', value: `${points} pts`, inline: true },
        { name: 'Bank',   value: `${bank} pts`,   inline: true },
      )
      .setColor(0x57f287);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── daily ─────────────────────────────────────────────────
  if (commandName === 'daily') {
    const now       = Date.now();
    const lastDaily = db.getLastDaily(interaction.user.id);
    const cooldown  = 20 * 60 * 60 * 1000; // 20 hours

    if (now - lastDaily < cooldown) {
      const remaining = cooldown - (now - lastDaily);
      return interaction.reply({
        content: `⏳ You already claimed your daily reward. Come back in **${ms(remaining, { long: true })}**.`,
        ephemeral: true,
      });
    }

    const reward = 50;
    db.addPoints(interaction.user.id, reward);
    db.setLastDaily(interaction.user.id, now);

    return interaction.reply({
      content: `✅ You claimed your daily **${reward} points**! Come back tomorrow.`,
      ephemeral: true,
    });
  }

  // ── work ──────────────────────────────────────────────────
  if (commandName === 'work') {
    const earned = Math.floor(Math.random() * 20) + 5; // 5–24 pts
    db.addPoints(interaction.user.id, earned);

    const responses = [
      `🔨 You fixed some bugs and earned **${earned} points**.`,
      `📦 You delivered packages and earned **${earned} points**.`,
      `🌾 You harvested crops and earned **${earned} points**.`,
      `🛡️ You patrolled the server and earned **${earned} points**.`,
      `📝 You filed reports and earned **${earned} points**.`,
    ];
    return interaction.reply({
      content: responses[Math.floor(Math.random() * responses.length)],
      ephemeral: true,
    });
  }

  // ── promote ───────────────────────────────────────────────
  if (commandName === 'promote') {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided.';

    if (!target) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

    const currentRankIndex = STAFF_HIERARCHY.findLastIndex(roleId =>
      target.roles.cache.has(roleId)
    );

    if (currentRankIndex === -1) {
      // Not yet staff — give Trial Staff
      await target.roles.add(ROLE_IDS.TRIAL_STAFF).catch(() => {});
      const logChannel = client.channels.cache.get(STAFF_LOG_CHANNEL_ID);
      logChannel?.send(`📋 **Promotion** | ${target} has been given **Trial Staff** by ${interaction.user}.\n**Reason:** ${reason}`);
      return interaction.reply({ content: `✅ ${target} has been promoted to **Trial Staff**.`, ephemeral: true });
    }

    if (currentRankIndex >= STAFF_HIERARCHY.length - 1) {
      return interaction.reply({ content: '❌ This member is already at the highest rank.', ephemeral: true });
    }

    const newRoleId  = STAFF_HIERARCHY[currentRankIndex + 1];
    const newRoleName = STAFF_HIERARCHY_NAMES[currentRankIndex + 1];
    await target.roles.remove(STAFF_HIERARCHY[currentRankIndex]).catch(() => {});
    await target.roles.add(newRoleId).catch(() => {});

    const logChannel = client.channels.cache.get(STAFF_LOG_CHANNEL_ID);
    logChannel?.send(`📋 **Promotion** | ${target} has been promoted to **${newRoleName}** by ${interaction.user}.\n**Reason:** ${reason}`);
    return interaction.reply({ content: `✅ ${target} has been promoted to **${newRoleName}**.`, ephemeral: true });
  }

  // ── demote ────────────────────────────────────────────────
  if (commandName === 'demote') {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided.';

    if (!target) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

    const currentRankIndex = STAFF_HIERARCHY.findLastIndex(roleId =>
      target.roles.cache.has(roleId)
    );

    if (currentRankIndex <= 0) {
      return interaction.reply({ content: '❌ This member cannot be demoted further.', ephemeral: true });
    }

    const newRoleId   = STAFF_HIERARCHY[currentRankIndex - 1];
    const newRoleName = STAFF_HIERARCHY_NAMES[currentRankIndex - 1];
    await target.roles.remove(STAFF_HIERARCHY[currentRankIndex]).catch(() => {});
    await target.roles.add(newRoleId).catch(() => {});

    const logChannel = client.channels.cache.get(STAFF_LOG_CHANNEL_ID);
    logChannel?.send(`📋 **Demotion** | ${target} has been demoted to **${newRoleName}** by ${interaction.user}.\n**Reason:** ${reason}`);
    return interaction.reply({ content: `✅ ${target} has been demoted to **${newRoleName}**.`, ephemeral: true });
  }

  // ── terminate ─────────────────────────────────────────────
  if (commandName === 'terminate') {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided.';

    if (!target) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

    const staffRolesHeld = STAFF_HIERARCHY.filter(roleId => target.roles.cache.has(roleId));
    if (staffRolesHeld.length === 0) {
      return interaction.reply({ content: '❌ This member holds no staff roles.', ephemeral: true });
    }

    // Save roles before removing them
    db.saveRoles(target.id, staffRolesHeld);
    await target.roles.remove(staffRolesHeld).catch(() => {});

    const logChannel = client.channels.cache.get(STAFF_LOG_CHANNEL_ID);
    logChannel?.send(`📋 **Termination** | ${target} has been terminated by ${interaction.user}.\n**Reason:** ${reason}`);
    return interaction.reply({ content: `✅ ${target} has been terminated from all staff positions.`, ephemeral: true });
  }

  // ── punish ────────────────────────────────────────────────
  if (commandName === 'punish') {
    const target = interaction.options.getMember('user');
    const amount = interaction.options.getInteger('amount');
    const reason = interaction.options.getString('reason') || 'No reason provided.';

    if (!target) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

    const currentPoints = db.getPoints(target.id);
    const deduct        = Math.min(amount, currentPoints);
    if (deduct > 0) db.removePoints(target.id, deduct);

    const logChannel = client.channels.cache.get(STAFF_LOG_CHANNEL_ID);
    logChannel?.send(`⚠️ **Punishment** | ${target} lost **${deduct} points** (requested: ${amount}) by ${interaction.user}.\n**Reason:** ${reason}`);
    return interaction.reply({
      content: `✅ Deducted **${deduct} points** from ${target}. They now have **${currentPoints - deduct} points**.`,
      ephemeral: true,
    });
  }

  // ── reward ────────────────────────────────────────────────
  if (commandName === 'reward') {
    const target = interaction.options.getMember('user');
    const amount = interaction.options.getInteger('amount');
    const reason = interaction.options.getString('reason') || 'No reason provided.';

    if (!target) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

    db.addPoints(target.id, amount);
    const newTotal = db.getPoints(target.id);

    const logChannel = client.channels.cache.get(STAFF_LOG_CHANNEL_ID);
    logChannel?.send(`🎁 **Reward** | ${target} received **${amount} points** from ${interaction.user}.\n**Reason:** ${reason}`);
    return interaction.reply({
      content: `✅ Awarded **${amount} points** to ${target}. They now have **${newTotal} points**.`,
      ephemeral: true,
    });
  }

  // ── deposit ───────────────────────────────────────────────
  if (commandName === 'deposit') {
    const amount  = interaction.options.getInteger('amount');
    const wallet  = db.getPoints(interaction.user.id);

    if (wallet < amount) {
      return interaction.reply({ content: `❌ You only have **${wallet} points** in your wallet.`, ephemeral: true });
    }

    db.removePoints(interaction.user.id, amount);
    db.addBank(interaction.user.id, amount);
    return interaction.reply({ content: `✅ Deposited **${amount} points** into your bank.`, ephemeral: true });
  }

  // ── withdraw ──────────────────────────────────────────────
  if (commandName === 'withdraw') {
    const amount = interaction.options.getInteger('amount');
    const bank   = db.getBank(interaction.user.id);

    if (bank < amount) {
      return interaction.reply({ content: `❌ You only have **${bank} points** in your bank.`, ephemeral: true });
    }

    db.addPoints(interaction.user.id, amount);
    // addBank supports negative values since it uses += under the hood
    db.addBank(interaction.user.id, -amount);
    return interaction.reply({ content: `✅ Withdrew **${amount} points** from your bank to your wallet.`, ephemeral: true });
  }

  // ── leaderboard ───────────────────────────────────────────
  if (commandName === 'leaderboard') {
    // db.js doesn't expose a leaderboard query, so we note it as coming soon
    return interaction.reply({
      content: '🏆 Leaderboard coming soon!',
      ephemeral: true,
    });
  }
});

// ================= [ MESSAGE GAME LOGIC ] =================
client.on(Events.MessageCreate, async (msg) => {
  // Only monitor the specific guess channel and ignore other bots
  if (msg.author.bot || msg.channel.id !== GUESS_CHANNEL_ID) return;

  // If there is no active round, just clean up the "nonsense" chat
  if (!currentRound) {
    return msg.delete().catch(() => {});
  }

  const userGuess    = msg.content.toLowerCase().trim();
  const correctAnswer = currentRound.name.toLowerCase();

  // --- CASE 1: CORRECT ANSWER ---
  if (userGuess === correctAnswer) {
    currentRound = null; // Lock round immediately to prevent double-wins

    await msg.react('✅').catch(() => {});
    db.addPoints(msg.author.id, 2);

    const successMsg = await msg.reply(`🌟 Correct! **${msg.author.username}** identified the location. +2 Points.`);

    setTimeout(async () => {
      try {
        await msg.delete().catch(() => {});
        await successMsg.delete().catch(() => {});
        if (activeGameMessage) {
          await activeGameMessage.delete().catch(() => {});
          activeGameMessage = null;
        }
        nextRound(msg.channel);
      } catch (err) {
        console.log('Cleanup error (likely message already deleted):', err.message);
      }
    }, 2500);
    return;
  }

  // --- CASE 2: INCORRECT / NONSENSE ---
  // If they reached this point, the answer was wrong.
  try {
    await msg.react('❌');
    // Short delay so they see the X before the message vanishes
    setTimeout(() => {
      msg.delete().catch(() => {});
    }, 800);
  } catch (err) {
    msg.delete().catch(() => {});
  }
});

// ================= [ LOGIN ] =================
client.login(TOKEN);
