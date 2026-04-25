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

// --- CONFIGURATION ---
const GUESS_CHANNEL_ID = "1497453944702500864";
const GAMES_CHANNEL_ID = "1497454650880950322";
const MODLOGS_CHANNEL = "1494273679951925248";
const VERIFIED_ROLE_ID = "1494237255148371998";

const PUNISH_ACCESS_ROLES = ["1494276990700753018", "1494277529614159893", "1494284826747076619"];
const BAN_ONLY_ROLE = "1494284826747076619";
const BYPASS_SELF_ROLE = "1494274846912417812";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// --- EXPANDED IMAGE DATABASE (30+ Locations) ---
const placeDatabase = [
    { name: "Morocco", url: "https://images.unsplash.com/photo-1539020140153-e479b8c22e70" },
    { name: "Egypt", url: "https://images.unsplash.com/photo-1503177119275-0aa32b3a9368" },
    { name: "Japan", url: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e" },
    { name: "Palestine", url: "https://images.unsplash.com/photo-1558002048-97c7ee59f24b" },
    { name: "France", url: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34" },
    { name: "Italy", url: "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9" },
    { name: "Brazil", url: "https://images.unsplash.com/photo-1483729558449-99ef09a8c325" },
    { name: "Australia", url: "https://images.unsplash.com/photo-1523482580672-f109ba8cb9be" },
    { name: "Canada", url: "https://images.unsplash.com/photo-1503614472-8c93d56e92ce" },
    { name: "Iceland", url: "https://images.unsplash.com/photo-1476610182048-b716b8518aae" },
    { name: "Turkey", url: "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200" },
    { name: "Greece", url: "https://images.unsplash.com/photo-1504150558240-0b4fd8946624" },
    { name: "Thailand", url: "https://images.unsplash.com/photo-1528181304800-2f140819898f" },
    { name: "Switzerland", url: "https://images.unsplash.com/photo-1527668752968-14dc70a27c95" },
    { name: "Mexico", url: "https://images.unsplash.com/photo-1512813588147-6c5d10bad13b" },
    { name: "Norway", url: "https://images.unsplash.com/photo-1513519107127-1bed33748e4c" },
    { name: "India", url: "https://images.unsplash.com/photo-1524492707947-282e7a465bab" },
    { name: "China", url: "https://images.unsplash.com/photo-1508804185872-d7badad00f7d" },
    { name: "Spain", url: "https://images.unsplash.com/photo-1543783230-278358426bb0" },
    { name: "Portugal", url: "https://images.unsplash.com/photo-1555881450-236c39ee896d" },
    { name: "Netherlands", url: "https://images.unsplash.com/photo-1512470876302-972faa2aa9a4" },
    { name: "United Kingdom", url: "https://images.unsplash.com/photo-1486299267070-83823f5448dd" },
    { name: "USA", url: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29" },
    { name: "Jordan", url: "https://images.unsplash.com/photo-1547234935-80c7145ec969" },
    { name: "Saudi Arabia", url: "https://images.unsplash.com/photo-1589816353361-9da0479907f0" },
    { name: "Indonesia", url: "https://images.unsplash.com/photo-1537996194471-e657df975ab4" },
    { name: "Vietnam", url: "https://images.unsplash.com/photo-1528127269322-539801943592" },
    { name: "South Africa", url: "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5" },
    { name: "South Korea", url: "https://images.unsplash.com/photo-1517154421773-0529f29ea451" },
    { name: "Germany", url: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b" }
];

// --- GAME ENGINE ---
const gameEngines = new Map();
function getEngine(channelId) {
    if (!gameEngines.has(channelId)) {
        gameEngines.set(channelId, { status: 'IDLE', currentAnswer: null, lastMsgId: null, lastUpdate: Date.now() });
    }
    return gameEngines.get(channelId);
}

async function startNewRound(channel) {
    const engine = getEngine(channel.id);
    if (engine.status === 'LOCKED' && (Date.now() - engine.lastUpdate < 4000)) return;
    engine.status = 'LOCKED';
    engine.lastUpdate = Date.now();

    try {
        if (engine.lastMsgId) {
            const oldMsg = await channel.messages.fetch(engine.lastMsgId).catch(() => null);
            if (oldMsg?.deletable) await oldMsg.delete().catch(() => {});
        }
        const data = placeDatabase[Math.floor(Math.random() * placeDatabase.length)];
        const embed = new EmbedBuilder().setTitle("🌍 Guess the Place!").setDescription("Win **2 points** by being the first to guess correctly!").setImage(data.url).setColor(0x00AE86);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("reveal_letter").setLabel("Hint").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("skip_flag").setLabel("Skip").setStyle(ButtonStyle.Danger)
        );
        const sent = await channel.send({ embeds: [embed], components: [row] });
        engine.currentAnswer = data.name;
        engine.lastMsgId = sent.id;
        engine.status = 'ACTIVE';
    } catch (e) { engine.status = 'IDLE'; }
}

// --- INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async (itx) => {
    try {
        if (itx.isButton()) {
            const engine = getEngine(itx.channelId);
            if (itx.customId === "reveal_letter") {
                if (engine.status !== 'ACTIVE' || !engine.currentAnswer) return itx.reply({ content: "No active round.", ephemeral: true });
                return itx.reply({ content: `💡 First letter: **${engine.currentAnswer[0].toUpperCase()}**`, ephemeral: true });
            }
            if (itx.customId === "skip_flag") {
                if (engine.status !== 'ACTIVE') return itx.reply({ content: "Please wait...", ephemeral: true });
                await itx.reply(`🚩 It was **${engine.currentAnswer}**.`);
                return startNewRound(itx.channel);
            }
            if (itx.customId === "verify_btn") {
                await itx.member.roles.add(VERIFIED_ROLE_ID).catch(() => {});
                return itx.reply({ content: "✅ Verified!", ephemeral: true });
            }
        }

        if (!itx.isChatInputCommand()) return;
        const { commandName, options, member, user, guild } = itx;

        // --- PUNISH / TIMEOUT (With Fixes) ---
        if (commandName === "punish" || commandName === "timeout") {
            const target = options.getUser("target");
            const targetMember = options.getMember("target");
            const reason = options.getString("reason");
            const evidence = options.getString("evidence");

            if (target.id === user.id && !member.roles.cache.has(BYPASS_SELF_ROLE)) return itx.reply({ content: "⚠️ You cannot punish yourself!", ephemeral: true });
            if (!PUNISH_ACCESS_ROLES.some(id => member.roles.cache.has(id))) return itx.reply({ content: "❌ Unauthorized.", ephemeral: true });

            await itx.deferReply({ ephemeral: true });

            if (commandName === "timeout") {
                const durationStr = options.getString("duration");
                const durationMs = ms(durationStr);
                if (!durationMs || durationMs > 2419200000) return itx.editReply("⚠️ Invalid duration.");
                const caseId = db.addPunishment(target.id, "Mute", reason, evidence, user.id);
                const muteDM = `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## ⚫️ Mute (${durationStr})\n\n**Hello, <@${target.id}>**\n\nYou have been Muted by the LL Server Administration.\n\n**Duration: ${durationStr}**\nReason: ${reason}\nEvidence: ${evidence}`;
                await target.send(muteDM).catch(() => {});
                await targetMember.timeout(durationMs, reason).catch(() => {});
                const log = new EmbedBuilder().setTitle(`Mute // Case ${caseId}`).setDescription(`**Target:** <@${target.id}>\n**Issuer:** <@${user.id}>\n**Reason:** ${reason}`).setColor(0x000000);
                await guild.channels.cache.get(MODLOGS_CHANNEL).send({ embeds: [log] });
                return itx.editReply(`✅ Issued **Mute // Case ${caseId}**.`);
            }

            if (commandName === "punish") {
                const type = options.getString("type");
                const isGen = member.roles.cache.has("1494276990700753018") || member.roles.cache.has("1494277529614159893");
                if (member.roles.cache.has(BAN_ONLY_ROLE) && !isGen && type !== "Ban") return itx.editReply("❌ Unauthorized type for your role.");
                const caseId = db.addPunishment(target.id, type, reason, evidence, user.id);
                const templates = {
                    "Verbal Warning": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## 🔴 Verbal Warning\n\n**Hello, <@${target.id}>**\n\nReason: ${reason}\nEvidence: ${evidence}`,
                    "Staff Warning": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## 🟡 Staff Warning\n\n**Hello, <@${target.id}>**\n\nReason: ${reason}\nEvidence: ${evidence}`,
                    "Suspension": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## 🟣 Suspension\n\n**Hello, <@${target.id}>**\n\nReason: ${reason}\nEvidence: ${evidence}`,
                    "Termination": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## 🟤 Termination\n\n**Hello, <@${target.id}>**\n\nReason: ${reason}\nEvidence: ${evidence}`,
                    "Kick": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## ⚫️ Kick\n\n**Hello, <@${target.id}>**\n\nReason: ${reason}\nEvidence: ${evidence}`,
                    "Ban": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## ⚫️ Ban\n\n**Hello, <@${target.id}>**\n\nReason: ${reason}\nEvidence: ${evidence}`
                };
                await target.send(templates[type]).catch(() => {});
                if (type === "Kick") await targetMember.kick(reason).catch(() => {});
                if (type === "Ban") await guild.members.ban(target.id, { reason }).catch(() => {});
                const log = new EmbedBuilder().setTitle(`${type} // Case ${caseId}`).setDescription(`**Target:** <@${target.id}>\n**Issuer:** <@${user.id}>\n**Reason:** ${reason}`).setColor(0xFF0000);
                await guild.channels.cache.get(MODLOGS_CHANNEL).send({ embeds: [log] });
                return itx.editReply(`✅ Issued **${type} // Case ${caseId}**.`);
            }
        }

        // --- ECONOMY ---
        if (["daily", "work_points", "check_points"].includes(commandName)) {
            if (commandName === "check_points") {
                const top = db.getTopPoints(10) || [];
                const list = top.map((u, i) => `${i+1}. <@${u.userId}>: ${u.points}`).join("\n");
                return itx.reply({ embeds: [new EmbedBuilder().setTitle("🏦 Bank").setDescription(list || "No data").setColor(0x00AE86)] });
            }
            if (itx.channelId !== GAMES_CHANNEL_ID) return itx.reply({ content: "Wrong channel.", ephemeral: true });
            const key = `${commandName}_${user.id}`;
            const cd = db.getCooldown(key) || 0;
            if (Date.now() < cd) return itx.reply({ content: `⏳ Wait ${ms(cd - Date.now())}`, ephemeral: true });
            const amt = commandName === "daily" ? 5 : 2;
            db.addPoints(user.id, amt);
            db.setCooldown(key, Date.now() + (commandName === "daily" ? 86400000 : 1800000));
            return itx.reply(`💰 **+${amt} Points!**`);
        }

        if (commandName === "verify_panel") {
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("verify_btn").setLabel("Verify").setStyle(ButtonStyle.Success));
            await itx.channel.send({ content: "## Verification\nClick below to access the server.", components: [row] });
            return itx.reply({ content: "Deployed.", ephemeral: true });
        }
    } catch (e) { console.error(e); }
});

// --- GUESS LISTENER ---
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || msg.channel.id !== GUESS_CHANNEL_ID) return;
    const engine = getEngine(msg.channel.id);
    if (engine.status !== 'ACTIVE' || !engine.currentAnswer) return;
    if (msg.content.toLowerCase().trim() === engine.currentAnswer.toLowerCase().trim()) {
        engine.status = 'LOCKED';
        await msg.react("✅").catch(() => {});
        db.addPoints(msg.author.id, 2);
        setTimeout(() => { if (msg.deletable) msg.delete().catch(() => {}); startNewRound(msg.channel); }, 2000);
    } else if (msg.content.length > 2) {
        await msg.react("❌").catch(() => {});
        setTimeout(() => { if (msg.deletable) msg.delete().catch(() => {}); }, 3000);
    }
});

// --- REGISTRATION ---
client.once(Events.ClientReady, async () => {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const cmds = [
        new SlashCommandBuilder().setName("daily").setDescription("Daily points"),
        new SlashCommandBuilder().setName("work_points").setDescription("Work points"),
        new SlashCommandBuilder().setName("check_points").setDescription("Leaderboard"),
        new SlashCommandBuilder().setName("verify_panel").setDescription("Deploy verification"),
        new SlashCommandBuilder().setName("timeout").setDescription("Mute user").addUserOption(o=>o.setName("target").setDescription("User").setRequired(true)).addStringOption(o=>o.setName("duration").setDescription("Duration").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(true)).addStringOption(o=>o.setName("evidence").setDescription("Evidence URL").setRequired(true)),
        new SlashCommandBuilder().setName("punish").setDescription("Punish user").addUserOption(o=>o.setName("target").setDescription("User").setRequired(true)).addStringOption(o=>o.setName("type").setDescription("Punishment type").setRequired(true).addChoices({name:'Verbal Warning',value:'Verbal Warning'},{name:'Staff Warning',value:'Staff Warning'},{name:'Suspension',value:'Suspension'},{name:'Termination',value:'Termination'},{name:'Kick',value:'Kick'},{name:'Ban',value:'Ban'})).addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(true)).addStringOption(o=>o.setName("evidence").setDescription("Evidence URL").setRequired(true))
    ].map(c => c.toJSON());
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: cmds });
    console.log("🚀 LAGGING LEGENDS SYSTEM ONLINE");
    const chan = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
    if (chan) startNewRound(chan);
});

client.login(DISCORD_TOKEN);
