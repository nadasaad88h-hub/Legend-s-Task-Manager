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
const GUESS_CHANNEL_ID = "1497522337757790258";
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

const rankHierarchy = [
    { id: "1494281388092952576", cd: 86400000 },    // Rank 1
    { id: "1494918304211402833", cd: 259200000 },   // Rank 2
    { id: "1494919385654235276", cd: 432000000 },   // Rank 3
    { id: "1494919521922846790", cd: 604800000 },   // Rank 4
    { id: "1494919940526964883", cd: 1209600000 },  // Rank 5
    { id: "1494920068667146251", cd: 1209600000 },  // Rank 6
    { id: "1494920425346433045", cd: 2160000000 },  // Rank 7 (Milestone)
    { id: "1494920607366647979", cd: 2160000000 },  // Rank 8
    { id: "1494920909130301490", cd: 2592000000 },  // Rank 9
    { id: "1494921290061053992", cd: 0 }            // Rank 10
];

const placeDatabase = [
    { name: "Morocco", url: "https://images.pexels.com/photos/2339036/pexels-photo-2339036.jpeg" },
    { name: "Egypt", url: "https://images.pexels.com/photos/2359006/pexels-photo-2359006.jpeg" },
    { name: "Japan", url: "https://images.pexels.com/photos/590471/pexels-photo-590471.jpeg" },
    { name: "Palestine", url: "https://images.pexels.com/photos/16625801/pexels-photo-16625801.jpeg" },
    { name: "France", url: "https://images.pexels.com/photos/699466/pexels-photo-699466.jpeg" },
    { name: "Italy", url: "https://images.pexels.com/photos/1797161/pexels-photo-1797161.jpeg" },
    { name: "Greece", url: "https://images.pexels.com/photos/1012982/pexels-photo-1012982.jpeg" },
    { name: "India", url: "https://images.pexels.com/photos/1007427/pexels-photo-1007427.jpeg" },
    { name: "Portugal", url: "https://images.pexels.com/photos/1036856/pexels-photo-1036856.jpeg" },
    { name: "USA", url: "https://images.pexels.com/photos/64271/queen-of-liberty-statue-of-liberty-new-york-liberty-statue-64271.jpeg" }
];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent
    ]
});

// ================= [ GAME ENGINE STATE ] =================
const gameEngines = new Map();
function getEngine(channelId) {
    if (!gameEngines.has(channelId)) {
        gameEngines.set(channelId, { status: 'IDLE', currentAnswer: null, lastMsgId: null, skipsUsed: 0, lastSkipReset: Date.now(), hintUsed: false });
    }
    return gameEngines.get(channelId);
}

async function startNewRound(channel) {
    const engine = getEngine(channel.id);
    engine.status = 'LOCKED'; engine.hintUsed = false;
    
    if (engine.lastMsgId) {
        const old = await channel.messages.fetch(engine.lastMsgId).catch(() => null);
        if (old?.deletable) await old.delete().catch(() => {});
    }

    const data = placeDatabase[Math.floor(Math.random() * placeDatabase.length)];
    const embed = new EmbedBuilder().setTitle("🌍 Guess the Place!").setImage(data.url).setColor(0x00AE86);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("reveal_letter").setLabel("Hint").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("skip_flag").setLabel("Skip").setStyle(ButtonStyle.Danger)
    );

    const sent = await channel.send({ embeds: [embed], components: [row] });
    engine.currentAnswer = data.name; engine.lastMsgId = sent.id; engine.status = 'ACTIVE';
}

// ================= [ INTERACTION HANDLER ] =================
client.on(Events.InteractionCreate, async (itx) => {
    try {
        const { commandName, options, member, user, guild, customId } = itx;

        // --- BUTTONS ---
        if (itx.isButton()) {
            const engine = getEngine(itx.channelId);

            if (customId === "verify_btn") {
                if (member.roles.cache.has(VERIFIED_ROLE_ID)) return itx.reply({ content: "ℹ️ Already verified!", ephemeral: true });
                const diffDays = Math.floor((Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24));
                await member.roles.add(VERIFIED_ROLE_ID);
                await itx.reply({ content: "✅ Verified! Go to 🧻 | roles to unlock features.", ephemeral: true });
                const logs = guild.channels.cache.get(MODLOGS_CHANNEL);
                if (logs) logs.send(`<@${user.id}> has verified.${diffDays < 30 ? `\n⚠️ **ACCOUNT CREATED ${diffDays} DAYS AGO!**` : ""}`);
                return;
            }

            if (customId === "reveal_letter" && engine.status === 'ACTIVE') {
                if (engine.hintUsed) return itx.deferUpdate();
                engine.hintUsed = true;
                await itx.reply({ content: `💡 First letter: **${engine.currentAnswer[0].toUpperCase()}**`, ephemeral: true });
                return;
            }

            if (customId === "skip_flag" && engine.status === 'ACTIVE') {
                if (Date.now() - engine.lastSkipReset > 3600000) { engine.skipsUsed = 0; engine.lastSkipReset = Date.now(); }
                if (engine.skipsUsed >= 3) return itx.reply({ content: "❌ Skip limit reached!", ephemeral: true });
                engine.skipsUsed++;
                await itx.reply({ content: `<@${user.id}> skipped. It was **${engine.currentAnswer}**.` });
                return startNewRound(itx.channel);
            }
        }

        if (!itx.isChatInputCommand()) return;

        // --- VERIFY PANEL ---
        if (commandName === "verify_panel") {
            if (!member.roles.cache.has(VERIFY_ADMIN_ROLE)) return itx.reply({ content: "❌ Unauthorized.", ephemeral: true });
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("verify_btn").setLabel("Verify").setStyle(ButtonStyle.Success));
            await itx.channel.send({ content: "Welcome to Lagging Legends! Click the button below to verify.", components: [row] });
            return itx.reply({ content: "✅ Deployed.", ephemeral: true });
        }

        // --- ECONOMY ---
        if (commandName === "daily") { db.addPoints(user.id, 5); return itx.reply({ content: "🎁 +5 points!", ephemeral: true }); }
        if (commandName === "check_points") {
            const top = db.getTopPoints(10) || [];
            const list = top.map((u, i) => `${i + 1}. <@${u.userId}> — ${u.points}`).join("\n") || "Empty.";
            return itx.reply({ embeds: [new EmbedBuilder().setTitle("🏦 Bank").setDescription(list)], ephemeral: true });
        }

        // --- PUNISH SYSTEM ---
        if (commandName === "timeout" || commandName === "punish") {
            const target = options.getUser("target");
            const targetMember = options.getMember("target");
            const reason = options.getString("reason");
            const evidence = options.getString("evidence");

            if (!PUNISH_ACCESS_ROLES.some(r => member.roles.cache.has(r))) return itx.reply({ content: "❌ Unauthorized.", ephemeral: true });
            if (target.id === user.id && !member.roles.cache.has(BYPASS_SELF_ROLE)) return itx.reply({ content: "⚠️ Cannot punish self.", ephemeral: true });

            await itx.deferReply({ ephemeral: true });
            const caseId = db.addPunishment(target.id, commandName === "timeout" ? "Mute" : options.getString("type"), reason, evidence, user.id);

            if (commandName === "timeout") {
                const dur = options.getString("duration");
                const dm = `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE\n\n## ⚫️ Mute (${dur})\n\n**Hello, <@${target.id}>**\n\nReason: ${reason}\nEvidence: ${evidence}`;
                await target.send(dm).catch(() => {});
                await targetMember.timeout(ms(dur), reason);
            } else {
                const type = options.getString("type");
                const dm = `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE\n\n## ${type}\n\n**Hello, <@${target.id}>**\n\nReason: ${reason}`;
                await target.send(dm).catch(() => {});
                if (type === "Kick") await targetMember.kick(reason);
                if (type === "Ban") await guild.members.ban(target.id, { reason });
            }

            guild.channels.cache.get(MODLOGS_CHANNEL).send({ content: `Case ${caseId} issued to <@${target.id}>` });
            return itx.editReply(`✅ Actioned Case ${caseId}.`);
        }

        // --- PROMOTION SYSTEM ---
        if (commandName === "promote") {
            if (itx.channelId !== STAFF_ADMIN_CHANNEL) return itx.reply({ content: "⚠️ Wrong channel.", ephemeral: true });
            const targetMember = options.getMember("target");
            const moveAmount = parseInt(options.getString("type"));
            const activeCD = db.getCooldown(targetMember.id);
            
            if (activeCD && Number(activeCD) > Date.now()) return itx.reply({ content: "⚠️ User on cooldown!", ephemeral: true });

            const ids = rankHierarchy.map(r => r.id);
            const targetIdx = ids.findIndex(id => targetMember.roles.cache.has(id));
            const yourIdx = ids.findIndex(id => member.roles.cache.has(id));
            const newIdx = targetIdx + moveAmount;

            if (newIdx >= yourIdx) return itx.reply({ content: "⚠️ Cannot promote to your rank or higher!", ephemeral: true });

            if (targetIdx !== 0) await targetMember.roles.remove(ids[targetIdx]);
            await targetMember.roles.add(ids[newIdx]);
            if (newIdx >= 6) await targetMember.roles.add([MILESTONE_ROLE_1, MILESTONE_ROLE_2]);
            
            db.setCooldown(targetMember.id, Date.now() + rankHierarchy[newIdx].cd);
            return itx.reply({ content: `## *<@${targetMember.id}> Has been promoted! 🎉*\n**Reason: ${options.getString("reason")}**` });
        }
    } catch (e) { console.error(e); }
});

// ================= [ MESSAGE GUESSING ENGINE ] =================
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || msg.channel.id !== GUESS_CHANNEL_ID) return;
    const engine = getEngine(msg.channel.id);
    if (engine.status !== 'ACTIVE') return msg.delete().catch(() => {});

    if (msg.content.toLowerCase().trim() === engine.currentAnswer.toLowerCase().trim()) {
        engine.status = 'LOCKED';
        await msg.react("✅").catch(() => {});
        db.addPoints(msg.author.id, engine.hintUsed ? 1 : 2);
        setTimeout(() => { if (msg.deletable) msg.delete(); startNewRound(msg.channel); }, 1500);
    } else if (msg.content.length > 2) {
        await msg.react("❌");
        setTimeout(() => { if (msg.deletable) msg.delete(); }, 1000);
    }
});

client.once(Events.ClientReady, async () => {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const cmds = [
        new SlashCommandBuilder().setName("daily").setDescription("Claim points"),
        new SlashCommandBuilder().setName("check_points").setDescription("Bank leaderboard"),
        new SlashCommandBuilder().setName("verify_panel").setDescription("Deploy verification"),
        new SlashCommandBuilder().setName("promote").setDescription("Promote staff").addUserOption(o=>o.setName("target").setDescription("User").setRequired(true)).addStringOption(o=>o.setName("type").setDescription("Amount").setRequired(true).addChoices({name:'Normal',value:'1'},{name:'Move 2',value:'2'})).addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(true)).addStringOption(o=>o.setName("approved_by").setDescription("N/A").setRequired(true)),
        new SlashCommandBuilder().setName("timeout").setDescription("Mute").addUserOption(o=>o.setName("target").setDescription("User").setRequired(true)).addStringOption(o=>o.setName("duration").setDescription("Time").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(true)).addStringOption(o=>o.setName("evidence").setDescription("URL").setRequired(true)),
        new SlashCommandBuilder().setName("punish").setDescription("Punish").addUserOption(o=>o.setName("target").setDescription("User").setRequired(true)).addStringOption(o=>o.setName("type").setDescription("Type").setRequired(true).addChoices({name:'Kick',value:'Kick'},{name:'Ban',value:'Ban'})).addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(true)).addStringOption(o=>o.setName("evidence").setDescription("URL").setRequired(true))
    ].map(c => c.toJSON());
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: cmds });
    console.log("🚀 LAGGING LEGENDS FULL PROTOCOL ONLINE");
    const chan = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
    if (chan) startNewRound(chan);
});

client.login(DISCORD_TOKEN);
