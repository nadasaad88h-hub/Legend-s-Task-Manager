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

// --- CONFIG ---
const GUESS_CHANNEL_ID = "1497453944702500864";
const GAMES_CHANNEL_ID = "1497454650880950322";
const VERIFIED_ROLE_ID = "1494237255148371998";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// --- THE STATE MACHINE ---
const gameEngines = new Map();

function getEngine(channelId) {
    if (!gameEngines.has(channelId)) {
        gameEngines.set(channelId, {
            status: 'IDLE', // 'IDLE', 'ACTIVE', 'LOCKED'
            currentAnswer: null,
            lastMsgId: null,
            lastUpdate: Date.now(),
            hintCooldowns: new Map() // Per-user hint limiting
        });
    }
    return gameEngines.get(channelId);
}

const placeDatabase = [
    { name: "Morocco", url: "https://images.unsplash.com/photo-1539020140153-e479b8c22e70?auto=format&fit=crop&w=1000" },
    { name: "Egypt", url: "https://images.unsplash.com/photo-1503177119275-0aa32b3a9368?auto=format&fit=crop&w=1000" },
    { name: "Palestine", url: "https://images.unsplash.com/photo-1558002048-97c7ee59f24b?auto=format&fit=crop&w=1000" },
    { name: "Japan", url: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1000" }
];

// --- CORE LOGIC WITH WATCHDOG ---

async function startNewRound(channel) {
    const engine = getEngine(channel.id);
    
    // 🛡️ ATOMIC LOCK: If we are already doing something, stop immediately.
    if (engine.status === 'LOCKED') return;
    engine.status = 'LOCKED'; 
    engine.lastUpdate = Date.now();

    try {
        // Cleanup previous
        if (engine.lastMsgId) {
            const oldMsg = await channel.messages.fetch(engine.lastMsgId).catch(() => null);
            if (oldMsg?.deletable) await oldMsg.delete().catch(e => console.error(`[Cleanup Error] ${e.message}`));
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
        engine.status = 'ACTIVE'; // Open for business
    } catch (err) {
        console.error("Critical Engine Error:", err);
        engine.status = 'IDLE'; // Reset so it doesn't freeze
    }
}

// 🛡️ WATCHDOG: Check every 30s if a channel is stuck in 'LOCKED'
setInterval(() => {
    const now = Date.now();
    gameEngines.forEach((engine, channelId) => {
        if (engine.status === 'LOCKED' && (now - engine.lastUpdate) > 15000) {
            console.warn(`[Watchdog] Unfreezing channel ${channelId}`);
            engine.status = 'IDLE';
            const chan = client.channels.cache.get(channelId);
            if (chan) startNewRound(chan);
        }
    });
}, 30000);

// --- HANDLERS ---

client.on(Events.InteractionCreate, async (itx) => {
    if (itx.isButton()) {
        const engine = getEngine(itx.channelId);

        if (itx.customId === "reveal_letter") {
            if (engine.status !== 'ACTIVE') return itx.reply({ content: "Please wait...", ephemeral: true });
            
            // Per-user hint cooldown to prevent spam
            const lastHint = engine.hintCooldowns.get(itx.user.id) || 0;
            if (Date.now() - lastHint < 10000) return itx.reply({ content: "Wait 10s for another hint!", ephemeral: true });
            
            engine.hintCooldowns.set(itx.user.id, Date.now());
            const first = engine.currentAnswer?.[0]?.toUpperCase() || "?";
            return itx.reply({ content: `💡 First letter is: **${first}**`, ephemeral: true });
        }

        if (itx.customId === "skip_flag") {
            if (engine.status !== 'ACTIVE') return itx.reply({ content: "Processing...", ephemeral: true });
            await itx.reply(`🚩 Skipped! It was **${engine.currentAnswer}**.`);
            return startNewRound(itx.channel);
        }

        if (itx.customId === "verify_btn") {
            await itx.deferReply({ ephemeral: true });
            if (itx.member.roles.cache.has(VERIFIED_ROLE_ID)) return itx.editReply("Already verified.");
            await itx.member.roles.add(VERIFIED_ROLE_ID);
            return itx.editReply("✅ Verified!");
        }
    }

    if (!itx.isChatInputCommand()) return;

    if (itx.commandName === "check_points") {
        const top = db.getTopPoints(10) || [];
        const leaderboard = top.map((u, i) => `${i+1}. <@${u.userId}>: ${u.points}`).join("\n");
        return itx.reply({ embeds: [new EmbedBuilder().setTitle("🏦 LL Bank").setDescription(leaderboard || "Empty").setColor(0x00AE86)] });
    }

    if (itx.channelId !== GAMES_CHANNEL_ID) return itx.reply({ content: "Wrong channel.", ephemeral: true });
    
    const key = `${itx.commandName}_${itx.user.id}`;
    const cd = Number(db.getCooldown(key)) || 0;
    if (Date.now() < cd) return itx.reply({ content: `Wait ${ms(cd - Date.now(), { long: true })}`, ephemeral: true });

    const rewards = { daily: 5, work: Math.floor(Math.random() * 4) + 1 };
    const amount = rewards[itx.commandName];
    db.addPoints(itx.user.id, amount);
    db.setCooldown(key, Date.now() + (itx.commandName === "daily" ? 86400000 : 1800000));
    return itx.reply(`💰 **+${amount} Points!**`);
});

client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || msg.channel.id !== GUESS_CHANNEL_ID) return;

    const engine = getEngine(msg.channel.id);
    if (engine.status !== 'ACTIVE') return;

    const input = msg.content.toLowerCase().trim();
    const answer = (engine.currentAnswer || "").toLowerCase().trim();

    if (input === answer && answer !== "") {
        // 🔒 IMMEDIATE ATOMIC LOCK
        engine.status = 'LOCKED';
        engine.lastUpdate = Date.now();
        
        await msg.react("✅").catch(() => {});
        db.addPoints(msg.author.id, 2);
        
        // Final Delay for effect
        setTimeout(() => {
            if (msg.deletable) msg.delete().catch(e => console.error(`[Msg Delete] ${e.message}`));
            startNewRound(msg.channel);
        }, 2000);
    } else if (msg.content.length > 2) {
        await msg.react("❌").catch(() => {});
        setTimeout(() => {
            if (msg.deletable) msg.delete().catch(() => {});
        }, 3000);
    }
});

client.once(Events.ClientReady, async () => {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const cmds = [
        new SlashCommandBuilder().setName("daily").setDescription("Daily points"),
        new SlashCommandBuilder().setName("work").setDescription("Work points"),
        new SlashCommandBuilder().setName("check_points").setDescription("Leaderboard"),
        new SlashCommandBuilder().setName("verify_panel").setDescription("Verify panel")
    ].map(c => c.toJSON());

    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: cmds });
    console.log(`🚀 Engine Started: ${client.user.tag}`);
    
    const chan = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
    if (chan) startNewRound(chan);
});

client.login(DISCORD_TOKEN);
