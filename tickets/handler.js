"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const db = require("../db");

// ───── CONFIG ─────
const SUPPORT_ROLE_1 = "1494277529614159893";
const SUPPORT_ROLE_2 = "1494277209668456539";
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;

// ───── HELPERS ─────
function isStaff(member) {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.roles.cache.has(SUPPORT_ROLE_1) ||
    member.roles.cache.has(SUPPORT_ROLE_2)
  );
}

function isTicket(channel) {
  return channel && channel.parentId === TICKET_CATEGORY_ID;
}

// ───── MAIN HANDLER ─────
module.exports = async (interaction) => {
  if (!interaction.guild) return;

  const { customId, channel, guild, member, user, commandName } = interaction;

  // ─────────────────────────────
  // CREATE TICKET
  // ─────────────────────────────
  if (interaction.isButton() && customId.startsWith("create_")) {
    await interaction.deferReply({ ephemeral: true });

    const type = customId.split("_")[1];
    const ticketName = `${type}-${user.username.toLowerCase()}`.slice(0, 32);

    const existing = guild.channels.cache.find((c) => c.name === ticketName);
    if (existing) {
      return interaction.editReply(`❌ You already have an open ticket: ${existing}`);
    }

    const ticketChannel = await guild.channels.create({
      name: ticketName,
      type: ChannelType.GuildText,
      parent: TICKET_CATEGORY_ID,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: SUPPORT_ROLE_1, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: SUPPORT_ROLE_2, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });

    db.saveTicket({
      channelId: ticketChannel.id,
      userId: user.id,
      claimedBy: null,
      stage: "open",
      createdAt: Date.now(),
    });

    const embed = new EmbedBuilder()
      .setTitle("Ticket Created")
      .setDescription("Support will assist you soon. Staff can claim this ticket.")
      .setColor(0x00aeff)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("claim_ticket")
        .setLabel("Claim")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `<@${user.id}>`,
      embeds: [embed],
      components: [row],
    });

    return interaction.editReply(`✅ Ticket created: ${ticketChannel}`);
  }

  // ─────────────────────────────
  // CLAIM TICKET
  // ─────────────────────────────
  if (interaction.isButton() && customId === "claim_ticket") {
    if (!isStaff(member)) {
      return interaction.reply({ content: "❌ No permission.", ephemeral: true });
    }

    const ticket = db.getTicket(channel.id);
    if (!ticket) {
      return interaction.reply({ content: "❌ Ticket not found.", ephemeral: true });
    }

    if (ticket.claimedBy) {
      return interaction.reply({
        content: `❌ Already claimed by <@${ticket.claimedBy}>`,
        ephemeral: true,
      });
    }

    const activeClaims = db.getActiveClaims(user.id);
    if (activeClaims >= 3) {
      return interaction.reply({
        content: "❌ You already have 3 active claims.",
        ephemeral: true,
      });
    }

    db.claimTicket(channel.id, user.id);

    const newRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("claim_ticket")
        .setLabel(`Claimed by ${user.username}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.update({ components: [newRow] });

    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
    });

    return interaction.followUp(`✅ <@${user.id}> claimed this ticket.`);
  }

  // ─────────────────────────────
  // STATUS COMMANDS
  // ─────────────────────────────
  if (interaction.isChatInputCommand()) {
    if (!isTicket(channel)) return;

    const ticket = db.getTicket(channel.id);
    if (!ticket) return;

    if (commandName === "pending") {
      db.updateStage(channel.id, "pending");
      return interaction.reply("⏳ Ticket set to PENDING.");
    }

    if (commandName === "accepted" || commandName === "denied") {
      db.updateStage(channel.id, "resolved");
      return interaction.reply("✅ Ticket marked RESOLVED.");
    }

    if (commandName === "close") {
      return handleClose(interaction, ticket);
    }
  }

  // ─────────────────────────────
  // CLOSE BUTTON
  // ─────────────────────────────
  if (interaction.isButton() && customId === "close_ticket") {
    const ticket = db.getTicket(channel.id);
    return handleClose(interaction, ticket);
  }
};

// ─────────────────────────────
// CLOSE FUNCTION
// ─────────────────────────────
async function handleClose(interaction, ticket) {
  if (!ticket) {
    return interaction.reply({ content: "❌ Ticket not found.", ephemeral: true });
  }

  let points = 0;

  if (ticket.claimedBy) {
    if (ticket.stage === "resolved") points = 2;
    else if (ticket.stage === "pending") points = 1;

    if (points > 0) {
      db.addPoints(ticket.claimedBy, points);
    }
  }

  db.deleteTicket(ticket.channelId);

  const msg = `🔒 Ticket closed. <@${ticket.claimedBy || "None"}> earned **${points} points**.`;

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(msg);
  } else {
    await interaction.reply(msg);
  }

  setTimeout(() => {
    interaction.channel.delete().catch(() => {});
  }, 3000);
}
