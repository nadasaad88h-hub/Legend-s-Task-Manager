"use strict";
require("dotenv").config();
const { 
    Client, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, REST, Routes, SlashCommandBuilder 
} = require("discord.js");
const db = require("./db"); 
const ms = require("ms");

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

// ================= [ CONFIGURATION ] =================
const GUESS_CHANNEL_ID = "1497453944702500864";
const MODLOGS_CHANNEL = "1494273679951925248";
const STAFF_ADMIN_CHANNEL = "1494273679951925248";
const VERIFIED_ROLE_ID = "1494237255148371998";
const VERIFY_ADMIN_ROLE = "1494274846912417812";

const PUNISH_ACCESS_ROLES = ["1494276990700753018", "1494277529614159893", "1494284826747076619"];
const BAN_ONLY_ROLE = "1494284826747076619";
const BYPASS_SELF_ROLE = "1494274846912417812";

const MILESTONE_ROLE_1 = "1494921889313984552";
const MILESTONE_ROLE_2 = "1494922588428697654";
const MILESTONE_RANK_INDEX = 6; 

const rankHierarchy = [
  { id: "1494281388092952576" }, { id: "1494918304211402833" }, 
  { id: "1494919385654235276" }, { id: "1494919521922846790" },
  { id: "1494919940526964883" }, { id: "1494920068667146251" },
  { id: "1494920425346433045" }, { id: "1494920607366647979" },
  { id: "1494920909130301490" }, { id: "1494921290061053992" }
];

const placeDatabase = [
    { name: "Morocco", url: "https://images.pexels.com/photos/2339036/pexels-photo-2339036.jpeg" },
    { name: "Egypt", url: "https://images.pexels.com/photos/2359006/pexels-photo-2359006.jpeg" },
    { name: "USA", url: "https://images.pexels.com/photos/1590924/pexels-photo-1590924.jpeg" },
    { name: "Japan", url: "https://images.pexels.com/photos/590471/pexels-photo-590471.jpeg" },
    { name: "France", url: "https://images.pexels.com/photos/699466/pexels-photo-699466.jpeg" },
    { name: "Italy", url: "https://images.pexels.com/photos/1797161/pexels-photo-1797161.jpeg" }
];

const client = new Client({ intents: [3276799] });

// --- GAME STATE ---
let currentCountry = "";
let engineStatus = "IDLE";
let hintUsed = false;

async function startNextRound(channel) {
    if (!channel) return;
    engineStatus = "LOCKED";
    const data = placeDatabase[Math.floor(Math.random() * placeDatabase.length)];
    currentCountry = data.name;
    hintUsed = false;

    const embed = new EmbedBuilder()
        .setTitle("🌍 Guess the Place!")
        .setDescription("Type the **Country Name** to win 2 points!")
        .setImage(data.url).setColor(0xFFD700);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("reveal_letter").setLabel("Reveal Letter").setStyle(ButtonStyle.Warning),
        new ButtonBuilder().setCustomId("skip_flag").setLabel("Skip").setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embed], components: [row] });
    engineStatus = "ACTIVE";
}

// ================= [ INTERACTION HANDLER ] =================
client.on(Events.InteractionCreate, async (itx) => {
    const { commandName, options, member, user, guild, customId } = itx;

    if (itx.isButton()) {
        if (customId === "verify_btn") {
            await member.roles.add(VERIFIED_ROLE_ID);
            return itx.reply({ content: "✅ Verified!", ephemeral: true });
        }
        if (customId === "reveal_letter" && engineStatus === "ACTIVE") {
            if (hintUsed) return itx.deferUpdate();
            hintUsed = true;
            return itx.reply(`The first letter is: **${currentCountry[0].toUpperCase()}**`);
        }
        if (customId === "skip_flag" && engineStatus === "ACTIVE") {
            await itx.reply(`Skipped! It was **${currentCountry}**.`);
            return startNextRound(itx.channel);
        }
    }

    if (!itx.isChatInputCommand()) return;

    // --- POINTS COMMANDS ---
    if (commandName === "check_points") {
        const target = options.getUser("user") || user;
        return itx.reply(`💰 **${target.username}** has **${db.getPoints(target.id)} points**.`);
    }
    if (commandName === "daily") {
        const reward = db.claimDaily(user.id);
        return itx.reply(reward ? `✅ You claimed **${reward} points**!` : "⏳ Already claimed today.");
    }
    if (commandName === "work_points") {
        db.addPoints(user.id, 5);
        return itx.reply("🛠️ Work recorded. **5 points** added.");
    }

    // --- PUNISHMENT REVERT ---
    if (commandName === "punish_revert") {
        if (!member.roles.cache.has(VERIFY_ADMIN_ROLE)) return itx.reply("❌ LL Leadership only.");
        const target = options.getUser("target");
        const type = options.getString("type");
        
        await target.send(`## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT REVERSAL\n\n🟢 Punishment Reversal\n\nHello, <@${target.id}>\n\nYour **${type}** record has been officially removed from your modlogs in the Lagging Legends Community.\n\nRepeating actions will result in harsher disciplinary action.`).catch(()=>{});
        db.removePunishment(options.getString("case_id"));
        return itx.reply(`✅ Reversal issued for Case ${options.getString("case_id")}.`);
    }

    // --- TIMEOUT COMMAND ---
    if (commandName === "timeout") {
        const target = options.getUser("target");
        const targetMember = options.getMember("target");
        if (target.id === user.id && !member.roles.cache.has(BYPASS_SELF_ROLE)) return itx.reply({ content: "⚠️ You cannot timeout yourself!", ephemeral: true });
        if (!PUNISH_ACCESS_ROLES.some(id => member.roles.cache.has(id))) return itx.reply({ content: "❌ Unauthorized.", ephemeral: true });
        
        const durationStr = options.getString("duration");
        const durationMs = ms(durationStr);
        if (!durationMs || durationMs > 2419200000) return itx.reply({ content: "⚠️ Invalid duration (Max 28d).", ephemeral: true });

        await itx.deferReply({ ephemeral: true });
        const reason = options.getString("reason");
        const evidence = options.getString("evidence");
        const caseId = db.addPunishment(target.id, "Mute", reason, evidence, user.id);

        const muteDM = `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## ⚫️ Mute (${durationStr})\n\n**Hello, <@${target.id}>**\n\nYou have been Muted by the LL Server Administration due to a violation of the community rules. During this time, you will be unable to send messages in designated channels.\n\n**Duration: ${durationStr}**\nReason: ${reason}\nEvidence: ${evidence}\n\nRepeated violations after your mute expires may result in stronger punishments, including kicks, longer mutes, or permanent removal from the server.`;

        await target.send(muteDM).catch(() => {}); 
        await targetMember.timeout(durationMs, reason).catch(()=>{});

        const log = new EmbedBuilder().setTitle(`Mute // Case ${caseId}`).setDescription(`**Target:** <@${target.id}>\n**Reason:** ${reason}`).setColor(0x000000);
        guild.channels.cache.get(MODLOGS_CHANNEL).send({ embeds: [log] });
        return itx.editReply(`✅ Issued **Mute // Case ${caseId}**.`);
    }

    // --- PUNISH COMMAND ---
    if (commandName === "punish") {
        const type = options.getString("type");
        const target = options.getUser("target");
        if (target.id === user.id && !member.roles.cache.has(BYPASS_SELF_ROLE)) return itx.reply({ content: "⚠️ You cannot punish yourself!", ephemeral: true });

        const isGen = member.roles.cache.has("1494276990700753018") || member.roles.cache.has("1494277529614159893");
        if (member.roles.cache.has(BAN_ONLY_ROLE) && !isGen && type !== "Ban") return itx.reply({ content: "❌ Only Bans permitted.", ephemeral: true });
        if (!isGen && !member.roles.cache.has(BAN_ONLY_ROLE)) return itx.reply({ content: "❌ Unauthorized.", ephemeral: true });

        await itx.deferReply({ ephemeral: true });
        const reason = options.getString("reason");
        const evidence = options.getString("evidence");
        const caseId = db.addPunishment(target.id, type, reason, evidence, user.id);

        const templates = {
            "Verbal Warning": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## 🔴 Verbal Warning\n\n**Hello, <@${target.id}>**\n\nYou have received a Verbal Warning from the LL Server Administration due to a rule violation. Please review the server rules and ensure this behavior is not repeated.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nRepeating this behavior may result in further disciplinary action, including stronger punishments depending on the severity of future violations.`,
            "Staff Warning": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## 🟡 Staff Warning\n\n**Hello, <@${target.id}>**\n\nYou have received a Staff Warning from the LL Server Administration due to misconduct or failure to meet staff expectations. This serves as a formal notice to improve your behavior and performance.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nFailure to improve or repeated issues may result in stronger action, including suspension or termination from your staff position.`,
            "Suspension": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## 🟣 Suspension\n\n**Hello, <@${target.id}>**\n\nYou have been placed under Suspension by the LL Server Administration due to a serious rule violation or staff misconduct. During this period, your permissions and responsibilities may be restricted while management reviews the situation.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nFurther violations or failure to cooperate during this review may result in permanent removal from your position or additional disciplinary action.`,
            "Termination": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## 🟤 Termination\n\n**Hello, <@${target.id}>**\n\nYou have been Terminated by the LL Server Administration due to repeated violations, misconduct, or failure to meet expectations. Your staff permissions and responsibilities have been removed.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nThis decision is considered final unless management decides otherwise. If appeals are permitted, they must be made respectfully through the proper process.`,
            "Kick": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## ⚫️ Kick\n\n**Hello, <@${target.id}>**\n\nYou have been Kicked by the LL Server Administration due to a violation of the rules or disruptive behavior. You may be able to rejoin depending on the situation.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nReturning and repeating the same behavior may lead to stronger disciplinary action, including a temporary or permanent ban from the community.`,
            "Ban": `## LAGGING LEGENDS COMMUNITY — OFFICIAL NOTICE OF PUNISHMENT\n\n## ⚫️ Ban\n\n**Hello, <@${target.id}>**\n\nYou have been Banned from Lagging Legends by the LL Server Administration due to severe rule violations, repeated misconduct, or actions harmful to the community. Your access to the server has been permanently removed.\n\nReason: ${reason}\nEvidence: ${evidence}\n\nAny appeal, if allowed, must be submitted respectfully through the proper appeal process. False or disrespectful appeals may be denied immediately.`
        };

        await target.send(templates[type]).catch(() => {}); 
        if (type === "Kick") await guild.members.kick(target.id, reason).catch(()=>{});
        if (type === "Ban") await guild.members.ban(target.id, { reason }).catch(()=>{});

        const log = new EmbedBuilder().setTitle(`${type} // Case ${caseId}`).setDescription(`**Target:** <@${target.id}>\n**Reason:** ${reason}`).setColor(0xFF0000);
        guild.channels.cache.get(MODLOGS_CHANNEL).send({ embeds: [log] });
        return itx.editReply(`✅ Issued **${type} // Case ${caseId}**.`);
    }

    // --- PROMOTION ---
    if (commandName === "promote") {
        if (itx.channelId !== STAFF_ADMIN_CHANNEL) return itx.reply("⚠️ Wrong channel.");
        const targetMember = options.getMember("target");
        const move = parseInt(options.getString("type"));
        const hierarchyIds = rankHierarchy.map(r => r.id);
        let currentIdx = hierarchyIds.findIndex(id => targetMember.roles.cache.has(id));
        if (currentIdx === -1) currentIdx = 0;
        const newIdx = Math.min(currentIdx + move, hierarchyIds.length - 1);

        if (currentIdx !== 0) await targetMember.roles.remove(hierarchyIds[currentIdx]);
        await targetMember.roles.add(hierarchyIds[newIdx]);
        if (newIdx >= MILESTONE_RANK_INDEX) await targetMember.roles.add([MILESTONE_ROLE_1, MILESTONE_ROLE_2]);

        return itx.reply(`## *<@${targetMember.id}> Promoted by ${user.username}. 🎉*\n**Reason: ${options.getString("reason")}**`);
    }

    if (commandName === "verify_panel") {
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("verify_btn").setLabel("Verify").setStyle(ButtonStyle.Success));
        return itx.reply({ content: "## Lagging Legends Verification\nClick below to verify.", components: [row] });
    }
});

// --- GAME LOGIC ---
client.on(Events.MessageCreate, async (msg) => {
    if (msg.channel.id !== GUESS_CHANNEL_ID || msg.author.bot || engineStatus !== "ACTIVE") return;
    if (msg.content.toLowerCase().trim() === currentCountry.toLowerCase().trim()) {
        engineStatus = "LOCKED";
        await msg.react("✅");
        db.addPoints(msg.author.id, 2);
        setTimeout(() => { if (msg.deletable) msg.delete().catch(()=>{}); startNextRound(msg.channel); }, 2000);
    }
});

// --- STARTUP ---
client.once(Events.ClientReady, async () => {
    const commands = [
        new SlashCommandBuilder().setName('check_points').setDescription('Check points').addUserOption(o=>o.setName('user').setDescription('User')),
        new SlashCommandBuilder().setName('daily').setDescription('Claim daily'),
        new SlashCommandBuilder().setName('work_points').setDescription('Staff work'),
        new SlashCommandBuilder().setName('verify_panel').setDescription('Admin only'),
        new SlashCommandBuilder().setName('punish_revert').setDescription('Revert punishment').addUserOption(o=>o.setName('target').setRequired(true)).addStringOption(o=>o.setName('type').setRequired(true)).addStringOption(o=>o.setName('case_id').setRequired(true)),
        new SlashCommandBuilder().setName('promote').setDescription('Promote staff').addUserOption(o=>o.setName('target').setRequired(true)).addStringOption(o=>o.setName('type').setRequired(true).addChoices({name:'+1',value:'1'},{name:'+2',value:'2'})).addStringOption(o=>o.setName('reason').setRequired(true)),
        new SlashCommandBuilder().setName('punish').setDescription('Punish').addUserOption(o=>o.setName('target').setRequired(true)).addStringOption(o=>o.setName('type').setRequired(true).addChoices({name:'Verbal Warning',value:'Verbal Warning'},{name:'Staff Warning',value:'Staff Warning'},{name:'Suspension',value:'Suspension'},{name:'Termination',value:'Termination'},{name:'Kick',value:'Kick'},{name:'Ban',value:'Ban'})).addStringOption(o=>o.setName('reason').setRequired(true)).addStringOption(o=>o.setName('evidence').setRequired(true)),
        new SlashCommandBuilder().setName('timeout').setDescription('Mute').addUserOption(o=>o.setName('target').setRequired(true)).addStringOption(o=>o.setName('duration').setRequired(true)).addStringOption(o=>o.setName('reason').setRequired(true)).addStringOption(o=>o.setName('evidence').setRequired(true))
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    
    console.log("🚀 ONLINE | COMMANDS REGISTERED");
    const chan = await client.channels.fetch(GUESS_CHANNEL_ID).catch(() => null);
    if (chan) startNextRound(chan);
});

client.login(DISCORD_TOKEN);
