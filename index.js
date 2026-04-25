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
const MODLOGS_CHANNEL = "1494273679951925248";
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

// --- STATE MACHINE ---
const gameEngines = new Map();

function getEngine(channelId) {
    if (!gameEngines.has(channelId)) {
        gameEngines.set(channelId, {
            status: 'IDLE',
            currentAnswer: null,
            lastMsgId: null,
            lastUpdate: Date.now(),
            hintCooldowns: new Map()
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

async function startNewRound(channel) {
    const engine = getEngine(channel.id);
    if (engine.status === 'LOCKED' && (Date.now() - engine.lastUpdate < 10000)) return;
    
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
    } catch (err) {
        console.error("Engine Error:", err);
        engine.status = 'IDLE';
    }
}

// --- INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async (itx) => {
    try {
        // BUTTON HANDLERS
        if (itx.isButton()) {
            const engine = getEngine(itx.channelId);

            if (itx.customId === "reveal_letter") {
                if (engine.status !== 'ACTIVE' || !engine.currentAnswer) return itx.reply({ content: "No round active.", ephemeral: true });
                return itx.reply({ content: `💡 First letter: **${engine.currentAnswer[0].toUpperCase()}**`, ephemeral: true });
            }

            if (itx.customId === "skip_flag") {
                if (engine.status !== 'ACTIVE') return itx.reply({ content: "Please wait...", ephemeral: true });
                await itx.reply(`🚩 Skipped! It was **${engine.currentAnswer}**.`);
                return startNewRound(itx.channel);
            }

            if (itx.customId === "verify_btn") {
                await itx.deferReply({ ephemeral: true });
                await itx.member.roles.add(VERIFIED_ROLE_ID).catch(() => {});
                return itx.editReply("✅ Verification Complete!");
            }
        }

        if (!itx.isChatInputCommand()) return;

        // ECONOMY COMMANDS
        if (itx.commandName === "check_points") {
            const top = db.getTopPoints(10);
            const list = Array.isArray(top) ? top.map((u, i) => `${i+1}. <@${u.userId}>: ${u.points}`).join("\n") : "Empty.";
            return itx.reply({ embeds: [new EmbedBuilder().setTitle("🏦 Bank").setDescription(list).setColor(0x00AE86)] });
        }

        if (["daily", "work_points"].includes(itx.commandName)) {
            if (itx.channelId !== GAMES_CHANNEL_ID) return itx.reply({ content: "❌ Wrong channel.", ephemeral: true });
            const key = `${itx.commandName}_${itx.user.id}`;
            const cd = Number(db.getCooldown(key)) || 0;
            if (Date.now() < cd) return itx.reply({ content: `Wait ${ms(cd - Date.now())}`, ephemeral: true });

            const amt = itx.commandName === "daily" ? 5 : 2;
            db.addPoints(itx.user.id, amt);
            db.setCooldown(key, Date.now() + (itx.commandName === "daily" ? 86400000 : 1800000));
            return itx.reply(`💰 **+${amt} Points!**`);
        }

        // STAFF COMMANDS + DM SYSTEM (THE FIX)
        if (itx.commandName === "punish" || itx.commandName === "timeout" || itx.commandName === "promote") {
            const target = itx.options.getMember("target");
            if (!target) return itx.reply({ content: "User not found.", ephemeral: true });

            if (itx.commandName === "punish") {
                const type = itx.options.getString("type");
                const reason = itx.options.getString("reason");
                const dm = new EmbedBuilder().setTitle("⚖️ Punishment Issued").addFields({name:"Type", value:type}, {name:"Reason", value:reason}).setColor(0xFF0000);
                await target.send({ embeds: [dm] }).catch(() => {});
                return itx.reply({ content: "Punishment logged and DM sent.", ephemeral: true });
            }

            if (itx.commandName === "timeout") {
                const duration = itx.options.getString("duration");
                const reason = itx.options.getString("reason");
                await target.timeout(ms(duration), reason);
                const dm = new EmbedBuilder().setTitle("⏳ Timeout").setDescription(`Reason: ${reason}`).setColor(0xFFA500);
                await target.send({ embeds: [dm] }).catch(() => {});
                return itx.reply({ content: "User timed out.", ephemeral: true });
            }

            if (itx.commandName === "promote") {
                const reason = itx.options.getString("reason");
                const dm = new EmbedBuilder().setTitle("🎊 Promoted!").setDescription(`Reason: ${reason}`).setColor(0x00FF00);
                await target.send({ embeds: [dm] }).catch(() => {});
                return itx.reply({ content: "Promotion DM sent.", ephemeral: true });
            }
        }

        if (itx.commandName === "verify_panel") {
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("verify_btn").setLabel("Verify").setStyle(ButtonStyle.Success));
            await itx.channel.send({ content: "Verify here:", components: [row] });
            return itx.reply({ content: "Sent.", ephemeral: true });
        }

    } catch (err) {
        console.error("Interaction Error:", err);
    }
});

// --- GUESSING LOGIC ---
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || msg.channel.id !== GUESS_CHANNEL_ID) return;
    const engine = getEngine(msg.channel.id);
    if (engine.status !== 'ACTIVE' || !engine.currentAnswer) return;

    if (msg.content.toLowerCase().trim() === engine.currentAnswer.toLowerCase().trim()) {
        engine.status = 'LOCKED';
        await msg.react("✅").catch(() => {});
        db.addPoints(msg.author.id, 2);
        setTimeout(() => {
            if (msg.deletable) msg.delete().catch(() => {});
            startNewRound(msg.channel);
        }, 2000);
    }
});

// --- REGISTRATION ---
client.once(Events.ClientReady, async () => {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const cmds = [
        new SlashCommandBuilder().setName("daily").setDescription("Points"),
        new SlashCommandBuilder().setName("work_points").setDescription("Points"),
        new SlashCommandBuilder().setName("check_points").setDescription("Bank"),
        new SlashCommandBuilder().setName("verify_panel").setDescription("Panel"),
        new SlashCommandBuilder().setName("punish").setDescription("Punish").addUserOption(o=>o.setName("target").setRequired(true).setDescription("U")).addStringOption(o=>o.setName("type").setRequired(true).setDescription("T")).addStringOption(o=>o.setName("reason").setRequired(true).setDescription("R")).addStringOption(o=>o.setName("evidence").setRequired(true).setDescription("E")),
        new SlashCommandBuilder().setName("timeout").setDescription("Mute").addUserOption(o=>o.setName("target").setRequired(true).setDescription("U")).addStringOption(o=>o.setName("duration").setRequired(true).setDescription("D")).addStringOption(o=>o.setName("reason").setRequired(true).setDescription("R")),
        new SlashCommandBuilder().setName("promote").setDescription("Promote").addUserOption(o=>o.setName("target").setRequired(true).setDescription("U")).addStringOption(o=>o.setName("reason").setRequired(true).setDescription("R"))
    ].map(c => c.toJSON());

    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: cmds });
        console.log("🚀 ONLINE");
        const chan = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
        if (chan) startNewRound(chan);
    } catch (e) { console.error(e); }
});

client.login(DISCORD_TOKEN);
