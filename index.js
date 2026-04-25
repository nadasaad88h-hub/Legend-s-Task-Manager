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

const commands = [
    new SlashCommandBuilder().setName("daily").setDescription("Claim 5 daily points"),
    new SlashCommandBuilder().setName("work").setDescription("Earn points (30m CD)"),
    new SlashCommandBuilder().setName("check_points").setDescription("View leaderboard"),
].map(c => c.toJSON());

let currentCountry = "Morocco";
const flags = [
    { name: "Morocco", url: "https://flagcdn.com/w1280/ma.png" },
    { name: "USA", url: "https://flagcdn.com/w1280/us.png" },
    { name: "Palestine", url: "https://flagcdn.com/w1280/ps.png" },
    { name: "Egypt", url: "https://flagcdn.com/w1280/eg.png" }
];

async function startRound(channel) {
    if (!channel) return;
    const data = flags[Math.floor(Math.random() * flags.length)];
    currentCountry = data.name;
    const embed = new EmbedBuilder()
        .setTitle("🌍 Guess the Flag!")
        .setDescription("Type the country name in chat!")
        .setImage(data.url)
        .setColor(0xFFD700);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("skip").setLabel("Skip").setStyle(ButtonStyle.Danger)
    );
    await channel.send({ embeds: [embed], components: [row] }).catch(e => console.error("Send Error:", e));
}

client.once(Events.ClientReady, async () => {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log(`✅ Logged in as ${client.user.tag}`);
        const channel = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
        if (channel) startRound(channel);
    } catch (err) { console.error("Sync Error:", err); }
});

client.on(Events.InteractionCreate, async (itx) => {
    if (itx.isButton() && itx.customId === "skip") {
        await itx.reply(`🚩 Skipped! It was **${currentCountry}**`);
        return startRound(itx.channel);
    }

    if (!itx.isChatInputCommand()) return;
    if (itx.channelId !== GAMES_CHANNEL_ID) return itx.reply({ content: "❌ Use #games!", ephemeral: true });

    if (itx.commandName === "check_points") {
        const top = db.getTopPoints(10);
        const list = top.map((u, i) => `${i+1}. <@${u.userId}>: ${u.points}`).join("\n");
        const balance = db.getPoints(itx.user.id);
        const embed = new EmbedBuilder().setTitle("🏦 Bank").setDescription(`${list || "Empty"}\n\n**You:** ${balance} pts`).setColor(0xFFD700);
        return itx.reply({ embeds: [embed] });
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
        await msg.reply("✅ Correct! +2 Points.");
        setTimeout(() => startRound(msg.channel), 2000);
    }
});

client.login(DISCORD_TOKEN);
