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

// Staff Permissions
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

// --- GAME ENGINE ---
const gameEngines = new Map();
function getEngine(channelId) {
    if (!gameEngines.has(channelId)) {
        gameEngines.set(channelId, { status: 'IDLE', currentAnswer: null, lastMsgId: null, lastUpdate: Date.now() });
    }
    return gameEngines.get(channelId);
}

const placeDatabase = [
    { name: "Morocco", url: "https://images.unsplash.com/photo-1539020140153-e479b8c22e70?auto=format&fit=crop&w=1000" },
    { name: "Egypt", url: "https://images.unsplash.com/photo-1503177119275-0aa32b3a9368?auto=format&fit=crop&w=1000" },
    { name: "Palestine", url: "https://images.unsplash.com/photo-1558002048-97c7ee59f24b?auto=format&fit=crop&w=1000" },
    { name: "Japan", url: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1000" }
];

async function startNewRound(channel) {
    const engine = getEngine(channel.id);
    // Prevent spam starts
    if (engine.status === 'LOCKED' && (Date.now() - engine.lastUpdate < 4000)) return;
    
    engine.status = 'LOCKED';
    engine.lastUpdate = Date.now();

    try {
        if (engine.lastMsgId) {
            const oldMsg = await channel.messages.fetch(engine.lastMsgId).catch(() => null);
            if (oldMsg?.deletable) await oldMsg.delete().catch(() => {});
        }
        
        const data = placeDatabase[Math.floor(Math.random() * placeDatabase.length)];
        const embed = new EmbedBuilder()
            .setTitle("🌍 Guess the Place!")
            .setDescription("Win **2 points** by being the first to guess correctly!")
            .setImage(data.url)
            .setColor(0x00AE86);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("reveal_letter").setLabel("Hint").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("skip_flag").setLabel("Skip").setStyle(ButtonStyle.Danger)
        );

        const sent = await channel.send({ embeds: [embed], components: [row] });
        engine.currentAnswer = data.name;
        engine.lastMsgId = sent.id;
        engine.status = 'ACTIVE';
    } catch (e) { 
        engine.status = 'IDLE'; 
        console.error("Game Loop Error:", e);
    }
}

// --- INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async (itx) => {
    // BUTTON HANDLERS
    if (itx.isButton()) {
        const engine = getEngine(itx.channelId);
        if (itx.customId === "reveal_letter") {
            if (engine.status !== 'ACTIVE' || !engine.currentAnswer) return itx.reply({ content: "No round active.", ephemeral: true });
            return itx.reply({ content: `💡 First letter: **${engine.currentAnswer[0].toUpperCase()}**`, ephemeral: true });
        }
        if (itx.customId === "skip_flag") {
            if (engine.status !== 'ACTIVE') return itx.reply({ content: "Wait...", ephemeral: true });
            await itx.reply(`🚩 Skipped! It was **${engine.currentAnswer}**.`);
            return startNewRound(itx.channel);
        }
        if (itx.customId === "verify_btn") {
            await itx.member.roles.add(VERIFIED_ROLE_ID).catch(() => {});
            return itx.reply({ content: "✅ Verification Complete!", ephemeral: true });
        }
    }

    if (!itx.isChatInputCommand()) return;
    const { commandName, options, member, user, guild } = itx;

    // --- NEW: MODLOGS COMMAND ---
    if (commandName === "modlogs") {
        const target = options.getUser("target");
        const logs = db.getPunishments(target.id) || []; // Assumes your db.js has this
        if (logs.length === 0) return itx.reply({ content: "No history found for this user.", ephemeral: true });

        const history = logs.map(l => `**Case ${l.id}**: ${l.type} - ${l.reason}`).join("\n");
        const embed = new EmbedBuilder().setTitle(`Logs: ${target.tag}`).setDescription(history).setColor(0x000000);
        return itx.reply({ embeds: [embed], ephemeral: true });
    }

    // --- PUNISH & TIMEOUT ---
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
            if (member.roles.cache.has(BAN_ONLY_ROLE) && !isGen && type !== "Ban") return itx.editReply("❌ Unauthorized for this type.");

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
        return itx.reply({ content: "Sent.", ephemeral: true });
    }
});

// --- IMPROVED GUESS LISTENER ---
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || msg.channel.id !== GUESS_CHANNEL_ID) return;
    const engine = getEngine(msg.channel.id);
    if (engine.status !== 'ACTIVE' || !engine.currentAnswer) return;

    const input = msg.content.toLowerCase().trim();
    const answer = engine.currentAnswer.toLowerCase().trim();

    if (input === answer) {
        engine.status = 'LOCKED'; // LOCK IMMEDIATELY
        await msg.react("✅").catch(() => {});
        db.addPoints(msg.author.id, 2);
        
        setTimeout(() => {
            if (msg.deletable) msg.delete().catch(() => {});
            startNewRound(msg.channel);
        }, 2000);
    } else if (msg.content.length > 2) {
        // Quick visual fail for wrong guesses
        await msg.react("❌").catch(() => {});
        setTimeout(() => { if (msg.deletable) msg.delete().catch(() => {}); }, 3000);
    }
});

// --- CORRECTED REGISTRATION ---
client.once(Events.ClientReady, async () => {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    
    const cmds = [
        new SlashCommandBuilder()
            .setName("daily")
            .setDescription("Claim your daily points reward"),

        new SlashCommandBuilder()
            .setName("work_points")
            .setDescription("Work to earn a small amount of points"),

        new SlashCommandBuilder()
            .setName("check_points")
            .setDescription("View the server points leaderboard"),

        new SlashCommandBuilder()
            .setName("verify_panel")
            .setDescription("Deploy the verification button panel"),

        new SlashCommandBuilder()
            .setName("modlogs")
            .setDescription("View the punishment history for a specific user")
            .addUserOption(o => o.setName("target").setRequired(true).setDescription("The user whose logs you want to view")),

        new SlashCommandBuilder()
            .setName("timeout")
            .setDescription("Mute a user for a specific duration")
            .addUserOption(o => o.setName("target").setRequired(true).setDescription("The user to timeout"))
            .addStringOption(o => o.setName("duration").setRequired(true).setDescription("Duration (e.g., 1h, 1d, 30m)"))
            .addStringOption(o => o.setName("reason").setRequired(true).setDescription("Reason for the timeout"))
            .addStringOption(o => o.setName("evidence").setRequired(true).setDescription("Link to evidence")),

        new SlashCommandBuilder()
            .setName("punish")
            .setDescription("Issue a formal staff punishment")
            .addUserOption(o => o.setName("target").setRequired(true).setDescription("The user to punish"))
            .addStringOption(o => o.setName("type").setRequired(true).setDescription("The type of punishment to issue")
                .addChoices(
                    { name: 'Verbal Warning', value: 'Verbal Warning' },
                    { name: 'Staff Warning', value: 'Staff Warning' },
                    { name: 'Suspension', value: 'Suspension' },
                    { name: 'Termination', value: 'Termination' },
                    { name: 'Kick', value: 'Kick' },
                    { name: 'Ban', value: 'Ban' }
                ))
            .addStringOption(o => o.setName("reason").setRequired(true).setDescription("Reason for the punishment"))
            .addStringOption(o => o.setName("evidence").setRequired(true).setDescription("Link to evidence"))
    ].map(c => c.toJSON());

    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: cmds });
        console.log("🚀 LAGGING LEGENDS SYSTEM ONLINE");
        
        // Start the first game round
        const chan = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
        if (chan) startNewRound(chan);
    } catch (e) { 
        console.error("Failed to register commands:", e); 
    }
    
});

client.login(DISCORD_TOKEN);
