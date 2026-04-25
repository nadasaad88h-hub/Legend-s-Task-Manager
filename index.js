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
const GUESS_CHANNEL_ID = "1497522337757790258";
const MODLOGS_CHANNEL = "1494273679951925248";
const PUNISH_ACCESS_ROLES = ["1494276990700753018", "1494277529614159893", "1494284826747076619"];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// --- IMAGE DATABASE (FORCED RENDERING) ---
// Adding auto=format&q=80&w=1080 forces Unsplash to serve a static image file
const placeDatabase = [
    { name: "Morocco", url: "https://images.unsplash.com/photo-1539020140153-e479b8c22e70?auto=format&q=80&w=1080" },
    { name: "Egypt", url: "https://images.unsplash.com/photo-1503177119275-0aa32b3a9368?auto=format&q=80&w=1080" },
    { name: "Japan", url: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&q=80&w=1080" },
    { name: "Palestine", url: "https://images.unsplash.com/photo-1558002048-97c7ee59f24b?auto=format&q=80&w=1080" },
    { name: "France", url: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&q=80&w=1080" },
    { name: "Italy", url: "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?auto=format&q=80&w=1080" },
    { name: "Brazil", url: "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?auto=format&q=80&w=1080" },
    { name: "Australia", url: "https://images.unsplash.com/photo-1523482580672-f109ba8cb9be?auto=format&q=80&w=1080" },
    { name: "Canada", url: "https://images.unsplash.com/photo-1503614472-8c93d56e92ce?auto=format&q=80&w=1080" },
    { name: "Turkey", url: "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&q=80&w=1080" },
    { name: "Greece", url: "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&q=80&w=1080" },
    { name: "Thailand", url: "https://images.unsplash.com/photo-1528181304800-2f140819898f?auto=format&q=80&w=1080" },
    { name: "India", url: "https://images.unsplash.com/photo-1524492707947-282e7a465bab?auto=format&q=80&w=1080" },
    { name: "Portugal", url: "https://images.unsplash.com/photo-1555881450-236c39ee896d?auto=format&q=80&w=1080" },
    { name: "USA", url: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&q=80&w=1080" }
];

const gameEngines = new Map();
function getEngine(channelId) {
    if (!gameEngines.has(channelId)) {
        gameEngines.set(channelId, { 
            status: 'IDLE', currentAnswer: null, lastMsgId: null, lastUpdate: Date.now(),
            skipsUsed: 0, lastSkipReset: Date.now(), hintUsed: false, hintMsgId: null
        });
    }
    return gameEngines.get(channelId);
}

async function startNewRound(channel) {
    const engine = getEngine(channel.id);
    // Prevent double-firing during the check
    if (engine.status === 'CHECKING') return; 

    engine.status = 'LOCKED';
    engine.lastUpdate = Date.now();
    engine.hintUsed = false;
    
    // Cleanup old messages
    if (engine.hintMsgId) {
        const hMsg = await channel.messages.fetch(engine.hintMsgId).catch(() => null);
        if (hMsg?.deletable) await hMsg.delete().catch(() => {});
        engine.hintMsgId = null;
    }

    try {
        if (engine.lastMsgId) {
            const oldMsg = await channel.messages.fetch(engine.lastMsgId).catch(() => null);
            if (oldMsg?.deletable) await oldMsg.delete().catch(() => {});
        }
        
        const data = placeDatabase[Math.floor(Math.random() * placeDatabase.length)];
        const embed = new EmbedBuilder()
            .setTitle("🌍 Guess the Place!")
            .setDescription("Win **2 points** by being the first to guess correctly!")
            .setColor(0x00AE86)
            .setImage(data.url);
            
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("reveal_letter").setLabel("Hint").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("skip_flag").setLabel("Skip").setStyle(ButtonStyle.Danger)
        );
        
        const sent = await channel.send({ embeds: [embed], components: [row] });
        
        // --- IMPROVED EMBED GUARD ---
        engine.status = 'CHECKING'; 
        setTimeout(async () => {
            const verify = await channel.messages.fetch(sent.id).catch(() => null);
            // If Discord fails to show the image, delete and try a different one
            if (!verify || !verify.embeds[0]?.image?.url) {
                if (verify?.deletable) await verify.delete().catch(() => {});
                engine.status = 'IDLE'; 
                return startNewRound(channel);
            }
            engine.currentAnswer = data.name;
            engine.lastMsgId = sent.id;
            engine.status = 'ACTIVE';
        }, 2500); // Slightly longer wait for slow Discord API days

    } catch (e) { engine.status = 'IDLE'; }
}

// --- INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async (itx) => {
    try {
        const engine = getEngine(itx.channelId);

        if (itx.isButton()) {
            if (itx.customId === "reveal_letter") {
                if (engine.status !== 'ACTIVE' || engine.hintUsed) return itx.deferUpdate();
                engine.hintUsed = true;
                const letter = engine.currentAnswer[0].toUpperCase();
                const oldEmbed = EmbedBuilder.from(itx.message.embeds[0]).setDescription("Win **1 Point** by being the first to guess correctly!");
                const newRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("hint_disabled").setLabel("Hint Given").setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId("skip_flag").setLabel("Skip").setStyle(ButtonStyle.Danger)
                );
                await itx.update({ embeds: [oldEmbed], components: [newRow] });
                const hMsg = await itx.channel.send(`## *${itx.user} revealed the first letter!*\n**${letter}**`);
                engine.hintMsgId = hMsg.id;
                return;
            }

            if (itx.customId === "skip_flag") {
                if (engine.status !== 'ACTIVE') return itx.deferUpdate();
                if (Date.now() - engine.lastSkipReset > 3600000) { engine.skipsUsed = 0; engine.lastSkipReset = Date.now(); }
                if (engine.skipsUsed >= 3) return itx.reply({ content: "❌ Skip limit reached!", ephemeral: true });

                engine.skipsUsed++;
                const skipMsg = await itx.reply({ content: `It was **${engine.currentAnswer}**.`, fetchReply: true });
                await skipMsg.react("🚩").catch(() => {});
                setTimeout(() => skipMsg.delete().catch(() => {}), 3000);
                return startNewRound(itx.channel);
            }
        }

        if (!itx.isChatInputCommand()) return;
        const { commandName, options, member, user, guild } = itx;

        // Punish/Economy logic...
        if (commandName === "daily") {
            db.addPoints(user.id, 5);
            return itx.reply({ content: "🎁 +5 daily points!", ephemeral: true });
        }
        if (commandName === "work_points") {
            db.addPoints(user.id, 2);
            return itx.reply({ content: "🛠 +2 work points!", ephemeral: true });
        }
        if (commandName === "check_points") {
            const pts = db.getPoints(user.id);
            return itx.reply({ content: `💰 Points: **${pts}**`, ephemeral: true });
        }
        // ... rest of mod commands
    } catch (e) { console.error(e); }
});

// --- GUESS LISTENER ---
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || msg.channel.id !== GUESS_CHANNEL_ID) return;
    const engine = getEngine(msg.channel.id);
    if (engine.status !== 'ACTIVE') return msg.delete().catch(() => {});

    const input = msg.content.toLowerCase().trim();
    if (input === engine.currentAnswer.toLowerCase().trim()) {
        engine.status = 'LOCKED';
        await msg.react("✅").catch(() => {});
        db.addPoints(msg.author.id, engine.hintUsed ? 1 : 2);
        if (engine.hintMsgId) {
            const hMsg = await msg.channel.messages.fetch(engine.hintMsgId).catch(() => null);
            if (hMsg?.deletable) await hMsg.delete().catch(() => {});
        }
        setTimeout(() => { if (msg.deletable) msg.delete().catch(() => {}); startNewRound(msg.channel); }, 1500);
    } else {
        await msg.react("❌").catch(() => {});
        setTimeout(() => { if (msg.deletable) msg.delete().catch(() => {}); }, 1000);
    }
});

client.once(Events.ClientReady, async () => {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const cmds = [
        new SlashCommandBuilder().setName("daily").setDescription("Claim 5 daily points"),
        new SlashCommandBuilder().setName("work_points").setDescription("Earn 2 points"),
        new SlashCommandBuilder().setName("check_points").setDescription("View points")
        // ... include your mod/punish commands here
    ].map(c => c.toJSON());
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: cmds });
    console.log("🚀 LAGGING LEGENDS SYSTEM ONLINE");
    const chan = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
    if (chan) startNewRound(chan);
});

client.login(DISCORD_TOKEN);
