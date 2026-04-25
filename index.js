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
const VERIFY_CHANNEL_ID = "1494235821899907153";
const STAFF_ADMIN_CHANNEL = "1494273679951925248";
const MODLOGS_CHANNEL = "1494273679951925248";

const VERIFY_ADMIN_ROLE = "1494274846912417812";
const VERIFIED_ROLE_ID = "1494237255148371998";
const BYPASS_SELF_ROLE = "1494274846912417812";
const HIGH_STAFF_ROLE = "1494278992402972733";

const rankHierarchy = [
  { id: "1494281388092952576", cd: 86400000 },
  { id: "1494918304211402833", cd: 259200000 },
  { id: "1494919385654235276", cd: 432000000 },
  { id: "1494919521922846790", cd: 604800000 },
  { id: "1494919940526964883", cd: 1209600000 },
  { id: "1494920068667146251", cd: 1209600000 },
  { id: "1494920425346433045", cd: 2160000000 },
  { id: "1494920607366647979", cd: 2160000000 },
  { id: "1494920909130301490", cd: 2592000000 },
  { id: "1494921290061053992", cd: 0 }
];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration
    ]
});

let currentCountry = "Morocco";
let lastGameMessageId = null;
let skipCooldowns = new Map();

const placeDatabase = [
    { name: "Morocco", url: "https://images.unsplash.com/photo-1539020140153-e479b8c22e70?auto=format&fit=crop&w=1000" },
    { name: "Egypt", url: "https://images.unsplash.com/photo-1503177119275-0aa32b3a9368?auto=format&fit=crop&w=1000" },
    { name: "Palestine", url: "https://images.unsplash.com/photo-1558002048-97c7ee59f24b?auto=format&fit=crop&w=1000" },
    { name: "Japan", url: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1000" }
];

// --- STARTUP ---
client.once(Events.ClientReady, async () => {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const commands = [
        new SlashCommandBuilder().setName("daily").setDescription("Claim daily points"),
        new SlashCommandBuilder().setName("work").setDescription("Work for points"),
        new SlashCommandBuilder().setName("check_points").setDescription("Leaderboard"),
        new SlashCommandBuilder().setName("verify_panel").setDescription("Deploy verification"),
        new SlashCommandBuilder().setName("timeout").setDescription("Mute user")
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
            .addStringOption(o => o.setName("duration").setDescription("1h, 1d...").setRequired(true))
            .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
            .addStringOption(o => o.setName("evidence").setDescription("Link").setRequired(true)),
        new SlashCommandBuilder().setName("punish").setDescription("Formal punishment")
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
            .addStringOption(o => o.setName("type").setDescription("Type").setRequired(true).addChoices(
                {name:'Verbal Warning', value:'Verbal Warning'}, {name:'Staff Warning', value:'Staff Warning'},
                {name:'Suspension', value:'Suspension'}, {name:'Termination', value:'Termination'},
                {name:'Kick', value:'Kick'}, {name:'Ban', value:'Ban'}
            ))
            .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
            .addStringOption(o => o.setName("evidence").setDescription("Link").setRequired(true)),
        new SlashCommandBuilder().setName("promote").setDescription("Promote staff")
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
            .addStringOption(o => o.setName("type").setDescription("Amount").setRequired(true).addChoices(
                {name:'Normal', value:'1'}, {name:'2 Ranks', value:'2'}, {name:'3 Ranks', value:'3'}
            ))
            .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
            .addStringOption(o => o.setName("approved_by").setDescription("@Mention or N/A").setRequired(true))
    ].map(c => c.toJSON());

    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`✅ ${client.user.tag} Online.`);
    
    setTimeout(async () => {
        const chan = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
        if (chan) startNextRound(chan);
    }, 5000);
});

// --- GAME LOGIC ---
async function startNextRound(channel) {
    if (!channel) return;
    if (lastGameMessageId) {
        const old = await channel.messages.fetch(lastGameMessageId).catch(() => null);
        if (old?.deletable) await old.delete().catch(() => {});
    }
    const data = placeDatabase[Math.floor(Math.random() * placeDatabase.length)];
    currentCountry = data.name;
    const embed = new EmbedBuilder().setTitle("🌍 Guess the Place!").setImage(data.url).setColor(0xFFD700);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("reveal_letter").setLabel("Hint").setStyle(ButtonStyle.Warning),
        new ButtonBuilder().setCustomId("skip_flag").setLabel("Skip").setStyle(ButtonStyle.Danger)
    );
    const sent = await channel.send({ embeds: [embed], components: [row] });
    lastGameMessageId = sent.id;
}

// --- INTERACTIONS ---
client.on(Events.InteractionCreate, async (itx) => {
    if (itx.isButton()) {
        if (itx.customId === "reveal_letter") return itx.reply({ content: `💡 First letter: **${currentCountry[0].toUpperCase()}**`, ephemeral: true });
        if (itx.customId === "skip_flag") {
            const now = Date.now();
            const skips = skipCooldowns.get(itx.user.id) || [];
            const valid = skips.filter(t => now - t < 3600000);
            if (valid.length >= 3) return itx.reply({ content: "⚠️ Skip limit reached (3/hr)!", ephemeral: true });
            valid.push(now); skipCooldowns.set(itx.user.id, valid);
            await itx.reply(`<@${itx.user.id}> skipped. It was **${currentCountry}**.`);
            return startNextRound(itx.channel);
        }
        if (itx.customId === "verify_btn") {
            if (itx.member.roles.cache.has(VERIFIED_ROLE_ID)) return itx.reply({ content: "Already verified!", ephemeral: true });
            await itx.member.roles.add(VERIFIED_ROLE_ID);
            const logCh = itx.guild.channels.cache.get(MODLOGS_CHANNEL);
            if (logCh) logCh.send(`<@${itx.user.id}> has verified in the server.`);
            return itx.reply({ content: "✅ You have been successfully verified, go to 🧻 | roles to unlock more features!", ephemeral: true });
        }
    }

    if (!itx.isChatInputCommand()) return;

    // PROMOTE LOGIC
    if (itx.commandName === "promote") {
        if (itx.channelId !== STAFF_ADMIN_CHANNEL) return itx.reply({ content: "⚠️ Wrong channel!", ephemeral: true });
        const targetMember = itx.options.getMember("target");
        const moveAmount = parseInt(itx.options.getString("type"));
        const reason = itx.options.getString("reason");
        const approvedInput = itx.options.getString("approved_by");

        const activeCD = db.getCooldown(targetMember.id);
        if (activeCD && Number(activeCD) > Date.now()) return itx.reply({ content: "⚠️ User is on cooldown!", ephemeral: true });

        const ids = rankHierarchy.map(r => r.id);
        const targetIdx = ids.findIndex(id => targetMember.roles.cache.has(id));
        const yourIdx = ids.findIndex(id => itx.member.roles.cache.has(id));

        if (targetIdx === -1) return itx.reply({ content: "⚠️ Target not in hierarchy.", ephemeral: true });
        const newIdx = targetIdx + moveAmount;

        if (newIdx >= ids.length) return itx.reply({ content: "⚠️ Max rank reached.", ephemeral: true });
        if (newIdx >= yourIdx && yourIdx !== -1) return itx.reply({ content: "⚠️ Cannot promote to/above your own rank!", ephemeral: true });

        await targetMember.roles.remove(ids[targetIdx]);
        await targetMember.roles.add(ids[newIdx]);
        if (newIdx >= 6) await targetMember.roles.add(["1494921889313984552", "1494922588428697654"]);
        
        db.setCooldown(targetMember.id, Date.now() + rankHierarchy[newIdx].cd);
        return itx.reply(`## *<@${targetMember.id}> Has been promoted by ${itx.user.username}. Congratulations! 🎉*\n**Reason: ${reason}**`);
    }

    // PUNISH LOGIC
    if (itx.commandName === "punish") {
        const target = itx.options.getUser("target");
        const type = itx.options.getString("type");
        const reason = itx.options.getString("reason");
        const evidence = itx.options.getString("evidence");

        const templates = {
            "Verbal Warning": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## 🔴 Verbal Warning\n\n**Hello, <@${target.id}>**\n\nYou have received a Verbal Warning from the LL Server Administration due to a rule violation.\n\nReason: ${reason}\nEvidence: ${evidence}`,
            "Ban": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## ⚫️ Ban\n\n**Hello, <@${target.id}>**\n\nYou have been Banned from Lagging Legends by the LL Server Administration.\n\nReason: ${reason}\nEvidence: ${evidence}`
            // ... (Other templates added same way)
        };

        await target.send(templates[type] || "Punished.").catch(() => {});
        if (type === "Ban") await itx.guild.members.ban(target.id, { reason });
        return itx.reply({ content: `✅ Issued **${type}** to <@${target.id}>.`, ephemeral: true });
    }

    // VERIFY PANEL
    if (itx.commandName === "verify_panel") {
        if (!itx.member.roles.cache.has(VERIFY_ADMIN_ROLE)) return itx.reply({ content: "❌ Unauthorized.", ephemeral: true });
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("verify_btn").setLabel("Verify").setStyle(ButtonStyle.Success));
        await itx.channel.send({ content: "Welcome to Lagging Legends! Click the button below to verify.", components: [row] });
        return itx.reply({ content: "Panel deployed.", ephemeral: true });
    }
});

// --- MESSAGE ENGINE (Fixes reaction flow) ---
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || msg.channel.id !== GUESS_CHANNEL_ID) return;
    const input = msg.content.toLowerCase().trim();
    const answer = currentCountry.toLowerCase();

    if (input === answer) {
        await msg.react("✅").catch(() => {});
        db.addPoints(msg.author.id, 2);
        setTimeout(async () => {
            if (msg.deletable) await msg.delete().catch(() => {});
            startNextRound(msg.channel);
        }, 2000);
    } else if (msg.content.length > 2) {
        await msg.react("❌").catch(() => {});
        setTimeout(() => { if (msg.deletable) msg.delete().catch(() => {}); }, 3000);
    }
});

client.login(DISCORD_TOKEN);
