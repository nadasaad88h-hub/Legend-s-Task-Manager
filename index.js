"use strict";
require("dotenv").config();
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, Routes, 
    Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, REST 
} = require("discord.js");
const db = require("./db"); 
const ms = require("ms");

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

// ================= [ CONFIGURATION ] =================
const GUESS_CHANNEL_ID = "1497453944702500864";
const GAMES_CHANNEL_ID = "1497454650880950322";
const VERIFY_CHANNEL_ID = "1494235821899907153";
const MODLOGS_CHANNEL = "1494273679951925248";
const STAFF_ADMIN_CHANNEL = "1494273679951925248";

const VERIFIED_ROLE_ID = "1494237255148371998";
const VERIFY_ADMIN_ROLE = "1494274846912417812";
const HIGH_STAFF_ROLE = "1494278992402972733";
const PUNISH_ACCESS_ROLES = ["1494276990700753018", "1494277529614159893", "1494284826747076619"];
const BAN_ONLY_ROLE = "1494284826747076619";
const BYPASS_SELF_ROLE = "1494274846912417812";

const MILESTONE_ROLE_1 = "1494921889313984552";
const MILESTONE_ROLE_2 = "1494922588428697654";
const MILESTONE_RANK_INDEX = 6; 

const rankHierarchy = [
  { id: "1494281388092952576", cd: 86400000 },    // Rank 1
  { id: "1494918304211402833", cd: 259200000 },   // Rank 2
  { id: "1494919385654235276", cd: 432000000 },   // Rank 3
  { id: "1494919521922846790", cd: 604800000 },   // Rank 4
  { id: "1494919940526964883", cd: 1209600000 },  // Rank 5
  { id: "1494920068667146251", cd: 1209600000 },  // Rank 6
  { id: "1494920425346433045", cd: 2160000000 },  // Rank 7
  { id: "1494920607366647979", cd: 2160000000 },  // Rank 8
  { id: "1494920909130301490", cd: 2592000000 },  // Rank 9
  { id: "1494921290061053992", cd: 0 }            // Rank 10
];

const placeDatabase = [
    { name: "Morocco", url: "https://images.pexels.com/photos/2339036/pexels-photo-2339036.jpeg" },
    { name: "Egypt", url: "https://images.pexels.com/photos/2359006/pexels-photo-2359006.jpeg" },
    { name: "USA", url: "https://images.pexels.com/photos/1590924/pexels-photo-1590924.jpeg" },
    { name: "Japan", url: "https://images.pexels.com/photos/590471/pexels-photo-590471.jpeg" },
    { name: "France", url: "https://images.pexels.com/photos/699466/pexels-photo-699466.jpeg" },
    { name: "Bangladesh", url: "https://images.pexels.com/photos/20121115/pexels-photo-20121115.jpeg" },
    { name: "Russia", url: "https://images.pexels.com/photos/2362325/pexels-photo-2362325.jpeg" },
    { name: "Turkey", url: "https://images.pexels.com/photos/2048865/pexels-photo-2048865.jpeg" },
    { name: "Italy", url: "https://images.pexels.com/photos/1797161/pexels-photo-1797161.jpeg" }
];

const client = new Client({ intents: [3276799] });

// --- GAME STATE ---
let currentCountry = "";
let engineStatus = "IDLE";
let hintUsed = false;
let lastGameMsgId = null;
let hintMsgId = null;
let skipCooldowns = new Map();

async function startNextRound(channel) {
    if (!channel) return;
    engineStatus = "LOCKED";
    const data = placeDatabase[Math.floor(Math.random() * placeDatabase.length)];
    currentCountry = data.name;
    hintUsed = false;

    if (hintMsgId) {
        const hMsg = await channel.messages.fetch(hintMsgId).catch(() => null);
        if (hMsg?.deletable) await hMsg.delete().catch(() => {});
        hintMsgId = null;
    }
    if (lastGameMsgId) {
        const old = await channel.messages.fetch(lastGameMsgId).catch(() => null);
        if (old?.deletable) await old.delete().catch(() => {});
    }

    const embed = new EmbedBuilder()
        .setTitle("🌍 Guess the Place!")
        .setDescription("Type the **Country Name** in chat to win 2 points!")
        .setImage(data.url)
        .setColor(0xFFD700);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("reveal_letter").setLabel("Reveal first letter").setStyle(ButtonStyle.Warning),
        new ButtonBuilder().setCustomId("skip_flag").setLabel("Skip flag").setStyle(ButtonStyle.Danger)
    );

    const sent = await channel.send({ embeds: [embed], components: [row] });
    lastGameMsgId = sent.id;
    engineStatus = "ACTIVE";
}

// ================= [ INTERACTION HANDLER ] =================
client.on(Events.InteractionCreate, async (itx) => {
    const { commandName, options, member, user, guild, customId } = itx;

    // --- BUTTONS ---
    if (itx.isButton()) {
        if (customId === "verify_btn") {
            if (member.roles.cache.has(VERIFIED_ROLE_ID)) return itx.reply({ content: "ℹ️ You are already verified!", ephemeral: true });
            const ageMs = Date.now() - user.createdTimestamp;
            const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
            
            await member.roles.add(VERIFIED_ROLE_ID);
            await itx.reply({ content: "✅ You have been successfully verified, go to 🧻 | roles to unlock more features!", ephemeral: true });
            
            let ageWarning = "";
            if (ageDays < 30) ageWarning = `\n⚠️ **ACCOUNT CREATED ${ageDays} DAYS AGO!** ⚠️`;
            guild.channels.cache.get(MODLOGS_CHANNEL)?.send(`<@${user.id}> has verified in the server.${ageWarning}`);
            return;
        }

        if (customId === "reveal_letter" && engineStatus === "ACTIVE") {
            if (hintUsed) return itx.deferUpdate();
            hintUsed = true;
            
            const hMsg = await itx.channel.send(`## *${user.username} revealed the first letter!*\n**${currentCountry[0].toUpperCase()}**`);
            hintMsgId = hMsg.id;

            const newEmbed = EmbedBuilder.from(itx.message.embeds[0]).setDescription("Win **1 Point** by being the first to guess correctly!");
            await itx.update({ 
                embeds: [newEmbed], 
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("hint_done").setLabel("Hint Given").setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId("skip_flag").setLabel("Skip flag").setStyle(ButtonStyle.Danger)
                )]
            });
            return;
        }

        if (customId === "skip_flag" && engineStatus === "ACTIVE") {
            const now = Date.now();
            const userSkips = skipCooldowns.get(user.id) || [];
            const validSkips = userSkips.filter(time => now - time < 3600000);
            if (validSkips.length >= 3) return itx.reply({ content: "⚠️ You have reached your skip limit (3 per hour)!", ephemeral: true });
            validSkips.push(now);
            skipCooldowns.set(user.id, validSkips);
            await itx.reply({ content: `<@${user.id}> has skipped the last place, it was **${currentCountry}**.` });
            return startNextRound(itx.channel);
        }
    }

    if (!itx.isChatInputCommand()) return;

    // --- PUNISH REVERT ---
    if (commandName === "punish_revert") {
        if (!member.roles.cache.has(VERIFY_ADMIN_ROLE)) return itx.reply({ content: "❌ Unauthorized. This command is restricted to LL Leadership.", ephemeral: true });
        db.removePunishment(options.getString("case_id"));
        return itx.reply({ content: `✅ Case ${options.getString("case_id")} has been reverted.`, ephemeral: true });
    }

    // --- PROMOTION ---
    if (commandName === "promote") {
        if (itx.channelId !== STAFF_ADMIN_CHANNEL) return itx.reply({ content: "⚠️ Wrong channel.", ephemeral: true });
        const targetMember = options.getMember("target");
        const moveAmount = parseInt(options.getString("type"));
        const approvedInput = options.getString("approved_by");

        const hierarchyIds = rankHierarchy.map(r => r.id);
        const targetRankIndex = hierarchyIds.findIndex(id => targetMember.roles.cache.has(id));
        const newRankIndex = targetRankIndex + moveAmount;

        if (targetRankIndex !== 0) await targetMember.roles.remove(hierarchyIds[targetRankIndex]);
        await targetMember.roles.add(hierarchyIds[newRankIndex]);

        if (newRankIndex >= MILESTONE_RANK_INDEX) await targetMember.roles.add([MILESTONE_ROLE_1, MILESTONE_ROLE_2]);

        let output = `## *<@${targetMember.id}> Has been promoted by ${user.username}. Congratulations! 🎉*\n**Reason: ${options.getString("reason")}**`;
        if (approvedInput !== "N/A") output += `\n**Approved by: ${approvedInput}**`;
        return itx.reply({ content: output });
    }

    // --- PUNISH SYSTEM ---
    if (commandName === "timeout" || commandName === "punish") {
        if (!PUNISH_ACCESS_ROLES.some(id => member.roles.cache.has(id))) return itx.reply({ content: "❌ Unauthorized.", ephemeral: true });
        const target = options.getUser("target");
        const targetMember = options.getMember("target");
        const reason = options.getString("reason");
        const evidence = options.getString("evidence");
        const type = commandName === "timeout" ? "Mute" : options.getString("type");
        const durationStr = options.getString("duration") || "";

        const templates = {
            "Mute": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## ⚫️ Mute (${durationStr})\n\n**Hello, <@${target.id}>**\n\nYou have been Muted by the LL Server Administration due to a violation of the community rules. During this time, you will be unable to send messages in designated channels.\n\n**Duration: ${durationStr}**\nReason: ${reason}\nEvidence: ${evidence}\n\nRepeated violations after your mute expires may result in stronger punishments, including kicks, longer mutes, or permanent removal from the server.`,
            "Verbal Warning": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## 🔴 Verbal Warning\n\n**Hello, <@${target.id}>**\n\nYou have received a Verbal Warning from the LL Server Administration due to a rule violation. Please review the server rules and ensure this behavior is not repeated.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nRepeating this behavior may result in further disciplinary action, including stronger punishments depending on the severity of future violations.`,
            "Staff Warning": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## 🟡 Staff Warning\n\n**Hello, <@${target.id}>**\n\nYou have received a Staff Warning from the LL Server Administration due to misconduct or failure to meet staff expectations. This serves as a formal notice to improve your behavior and performance.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nFailure to improve or repeated issues may result in stronger action, including suspension or termination from your staff position.`,
            "Suspension": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## 🟣 Suspension\n\n**Hello, <@${target.id}>**\n\nYou have been placed under Suspension by the LL Server Administration due to a serious rule violation or staff misconduct. During this period, your permissions and responsibilities may be restricted while management reviews the situation.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nFurther violations or failure to cooperate during this review may result in permanent removal from your position or additional disciplinary action.`,
            "Termination": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## 🟤 Termination\n\n**Hello, <@${target.id}>**\n\nYou have been Terminated by the LL Server Administration due to repeated violations, misconduct, or failure to meet expectations. Your staff permissions and responsibilities have been removed.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nThis decision is considered final unless management decides otherwise. If appeals are permitted, they must be made respectfully through the proper process.`,
            "Kick": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## ⚫️ Kick\n\n**Hello, <@${target.id}>**\n\nYou have been Kicked by the LL Server Administration due to a violation of the rules or disruptive behavior. You may be able to rejoin depending on the situation.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nReturning and repeating the same behavior may lead to stronger disciplinary action, including a temporary or permanent ban from the community.`,
            "Ban": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## ⚫️ Ban\n\n**Hello, <@${target.id}>**\n\nYou have been Banned from Lagging Legends by the LL Server Administration due to severe rule violations, repeated misconduct, or actions harmful to the community. Your access to the server has been permanently removed.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nAny appeal, if allowed, must be submitted respectfully through the proper appeal process. False or disrespectful appeals may be denied immediately.`
        };

        const caseId = db.addPunishment(target.id, type, reason, evidence, user.id);
        await target.send(templates[type]).catch(() => {});
        
        if (type === "Mute") await targetMember.timeout(ms(durationStr), reason);
        if (type === "Kick") await targetMember.kick(reason);
        if (type === "Ban") await guild.members.ban(target.id, { reason });

        const logEmbed = new EmbedBuilder()
            .setTitle(`${type} // Case ${caseId}`)
            .setDescription(`**Target:** <@${target.id}>\n**Issuer:** <@${user.id}>\n**Reason:** ${reason}\n**Evidence:** ${evidence}`)
            .setColor(0xFF0000).setTimestamp();

        guild.channels.cache.get(MODLOGS_CHANNEL).send({ embeds: [logEmbed] });
        return itx.reply({ content: `✅ Issued **${type} // Case ${caseId}**.` });
    }
});

// ================= [ MESSAGE GUESSING ENGINE ] =================
client.on(Events.MessageCreate, async (msg) => {
    if (msg.channel.id !== GUESS_CHANNEL_ID || msg.author.bot || engineStatus !== "ACTIVE") return;
    if (msg.content.toLowerCase().trim() === currentCountry.toLowerCase().trim()) {
        engineStatus = "LOCKED";
        await msg.react("✅");
        db.addPoints(msg.author.id, hintUsed ? 1 : 2);
        if (hintMsgId) {
            const hMsg = await msg.channel.messages.fetch(hintMsgId).catch(() => null);
            if (hMsg?.deletable) hMsg.delete().catch(() => {});
        }
        setTimeout(() => { if (msg.deletable) msg.delete(); startNextRound(msg.channel); }, 2000);
    } else if (msg.content.length > 2) {
        await msg.react("❌");
        setTimeout(() => { if (msg.deletable) msg.delete(); }, 1500);
    }
});

client.once(Events.ClientReady, async () => {
    console.log("🚀 LAGGING LEGENDS ONLINE");
    const chan = await client.channels.fetch(GUESS_CHANNEL_ID);
    if (chan) startNextRound(chan);
});

client.login(DISCORD_TOKEN);
