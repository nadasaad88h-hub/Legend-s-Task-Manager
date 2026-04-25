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

const GUESS_CHANNEL_ID = "1497453944702500864";
const GAMES_CHANNEL_ID = "1497454650880950322";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ]
});

let currentCountry = "Morocco"; 
let lastGameMessageId = null;

const placeDatabase = [
    { name: "Morocco", url: "https://images.unsplash.com/photo-1539020140153-e479b8c22e70?auto=format&fit=crop&w=1000" },
    { name: "Egypt", url: "https://images.unsplash.com/photo-1503177119275-0aa32b3a9368?auto=format&fit=crop&w=1000" },
    { name: "Palestine", url: "https://images.unsplash.com/photo-1558002048-97c7ee59f24b?auto=format&fit=crop&w=1000" },
    { name: "Japan", url: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1000" }
];

async function startNextRound(channel) {
    if (!channel) return;
    try {
        if (lastGameMessageId) {
            const oldMsg = await channel.messages.fetch(lastGameMessageId).catch(() => null);
            if (oldMsg && oldMsg.deletable) await oldMsg.delete().catch(() => {});
        }
        const data = placeDatabase[Math.floor(Math.random() * placeDatabase.length)];
        currentCountry = data.name;
        const embed = new EmbedBuilder().setTitle("🌍 Guess the Place!").setDescription("Type the **Country Name** in chat!").setImage(data.url).setColor(0xFFD700);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("reveal_letter").setLabel("Hint").setStyle(ButtonStyle.Warning),
            new ButtonBuilder().setCustomId("skip_flag").setLabel("Skip").setStyle(ButtonStyle.Danger)
        );
        const sent = await channel.send({ embeds: [embed], components: [row] });
        lastGameMessageId = sent.id;
    } catch (e) { console.error("Round Start Error:", e); }
}

client.once(Events.ClientReady, async () => {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const commands = [
        new SlashCommandBuilder().setName("daily").setDescription("Claim 5 daily points"),
        new SlashCommandBuilder().setName("work").setDescription("Earn points (30m CD)"),
        new SlashCommandBuilder().setName("check_points").setDescription("View leaderboard"),
    ].map(c => c.toJSON());

    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`✅ Logged in as ${client.user.tag}`);
    const channel = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
    if (channel) startNextRound(channel);
});

client.on(Events.InteractionCreate, async (itx) => {
    if (itx.isButton()) {
        if (itx.customId === "reveal_letter") {
            return itx.reply({ content: `💡 First letter is: **${currentCountry[0].toUpperCase()}**`, ephemeral: true });
        }
        if (itx.customId === "skip_flag") {
            await itx.reply(`🚩 Skipped! It was **${currentCountry}**.`);
            return startNextRound(itx.channel);
        }
    }

    if (!itx.isChatInputCommand()) return;
    if (itx.channelId !== GAMES_CHANNEL_ID) return itx.reply({ content: "❌ Use #games!", ephemeral: true });

    if (itx.commandName === "check_points") {
        const top = db.getTopPoints(10);
        const list = top.map((u, i) => `${i+1}. <@${u.userId}>: ${u.points}`).join("\n") || "No data.";
        const balance = db.getPoints(itx.user.id);
        return itx.reply({ embeds: [new EmbedBuilder().setTitle("🏦 Bank").setDescription(`${list}\n\n**You:** ${balance} pts`).setColor(0xFFD700)] });
    }

    const key = `${itx.commandName}_${itx.user.id}`;
    const cd = db.getCooldown(key);
    if (Date.now() < cd) return itx.reply({ content: `⏳ Wait **${ms(cd - Date.now())}**`, ephemeral: true });

    const amt = itx.commandName === "daily" ? 5 : Math.floor(Math.random() * 3) + 1;
    db.addPoints(itx.user.id, amt);
    db.setCooldown(key, Date.now() + (itx.commandName === "daily" ? 86400000 : 1800000));
    return itx.reply(`💰 Added **${amt}** points!`);
});

client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || msg.channel.id !== GUESS_CHANNEL_ID) return;
    if (msg.content.toLowerCase().trim() === currentCountry.toLowerCase()) {
        db.addPoints(msg.author.id, 2);
        await msg.react("✅").catch(() => {});
        setTimeout(async () => {
            if (msg.deletable) await msg.delete().catch(() => {});
            startNextRound(msg.channel);
        }, 2000);
    } else if (msg.content.length > 2) {
        setTimeout(() => { if (msg.deletable) msg.delete().catch(() => {}); }, 3000);
    }
});

client.login(DISCORD_TOKEN);
