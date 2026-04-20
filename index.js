"use strict";

const { Client, GatewayIntentBits, SlashCommandBuilder } = require("discord.js");
const { REST, Routes } = require("@discordjs/rest");
const db = require("./db");

// ================= ENV =================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// ================= ENV VALIDATION =================
if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    "[ERROR] Missing required environment variables: " +
    [!TOKEN && "DISCORD_TOKEN", !CLIENT_ID && "CLIENT_ID", !GUILD_ID && "GUILD_ID"]
      .filter(Boolean)
      .join(", ")
  );
}

// ================= CHANNEL =================
const LOG_CHANNEL = "1494273679951925248";

// ================= ROLES =================
const UNVERIFIED_ROLE = "1494279535108292709";
const VERIFIED_ROLE = "1494279460373926030";

const SUPPORT = "1494277529614159893";
const MOD = "1494276990700753018";
const HIGH_APPROVAL = "1494275089963810967";
const MID_APPROVAL = "1494278992402972733";

const DEPT_PUNISH_PERM = "1494275524766208081";

// ================= DEPARTMENT ROLES =================
// Map the names exactly as staff will type them to their IDs
const DEPT_ROLES = {
  "discord moderation high command": "ID_HERE",
  "discord moderation senior": "ID_HERE",
  "discord moderation junior": "ID_HERE",
  "discord moderation agent": "ID_HERE",
  "support agency high command": "ID_HERE",
  "support agency senior": "ID_HERE",
  "support agency junior": "ID_HERE",
  "support agency": "ID_HERE",
  "community management high command": "ID_HERE",
  "community management senior": "ID_HERE",
  "community management junior": "ID_HERE",
  "community management": "ID_HERE",
  "application management": "ID_HERE",
  "partnership team high command": "ID_HERE",
  "partnership team": "ID_HERE",
  "engagement team high command": "ID_HERE",
  "engagement team senior": "ID_HERE",
  "engagement team junior": "ID_HERE",
  "engagement team agent": "ID_HERE",
  "giveaway host": "ID_HERE",
  "quota officer": "ID_HERE"
};

const SPECIAL_ROLES = ["1494922588428697654", "1494921889313984552"];

// ================= RANKS =================
const ranks = [
  "1494281388092952576", "1494918304211402833", "1494919385654235276",
  "1494919521922846790", "1494919940526964883", "1494920068667146251",
  "1494920425346433045", "1494920607366647979", "1494920909130301490", 
  "1494921290061053992"
];

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const commands = [
  new SlashCommandBuilder().setName("verify").setDescription("Verify yourself").toJSON()
];
const rest = TOKEN ? new REST({ version: "10" }).setToken(TOKEN) : null;

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  if (rest && TOKEN && CLIENT_ID && GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  } else {
    console.error("[ERROR] Skipping slash command registration: TOKEN, CLIENT_ID, or GUILD_ID is missing.");
  }
});

// ================= HELPERS =================
const getRank = (member) => ranks.find(r => member.roles.cache.has(r));
const getRankIndex = (id) => ranks.indexOf(id);

function parseFields(content) {
  const data = {};
  content.split("\n").forEach(line => {
    const [k, ...v] = line.split(":");
    if (!v.length) return;
    data[k.trim().toLowerCase()] = v.join(":").trim();
  });
  return data;
}

function extractId(text) {
  if (!text) return null;
  const match = text.match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

// ================= LOGIC =================
client.on("guildMemberAdd", async (member) => {
  const role = member.guild.roles.cache.get(UNVERIFIED_ROLE);
  if (role) await member.roles.add(role).catch(() => {});
});

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand() || i.commandName !== "verify") return;
  if (i.member.roles.cache.has(VERIFIED_ROLE)) return i.reply({ content: "Already verified.", ephemeral: true });
  const unverified = i.guild.roles.cache.get(UNVERIFIED_ROLE);
  if (unverified) await i.member.roles.remove(unverified).catch(() => {});
  await i.member.roles.add(VERIFIED_ROLE).catch(() => {});
  return i.reply({ content: "Verified!", ephemeral: true });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.content.startsWith("!")) {
    const cmd = message.content.split(" ")[0].toLowerCase();
    if (cmd === "!points") {
      const row = (await db.getPoints(message.author.id)) || { points: 0 };
      return message.reply(`⭐ ${row.points} points`);
    }
    if (cmd === "!leaderboard") {
      const top = await db.getLeaderboard();
      return message.reply(top.slice(0, 10).map((u, i) => `${i + 1}. <@${u.staffId}> - ${u.points}`).join("\n") || "No data");
    }
    return;
  }

  if (message.channel.id !== LOG_CHANNEL) return;

  const data = parseFields(message.content);
  const type = message.content.split("\n")[0].toLowerCase().trim();

  try {
    // ================= DEPARTMENT PUNISH =================
    if (type === "department_punish" || type === "dept_punish") {
      if (!message.member.roles.cache.has(DEPT_PUNISH_PERM)) return message.react("🛡️");

      const targetId = extractId(data["their username"]);
      const roleName = data["role"]?.toLowerCase();
      const action = data["action"]?.toLowerCase();

      if (!targetId || !roleName || !action || !data["reason"]) return message.react("❓");

      const target = await message.guild.members.fetch(targetId).catch(() => null);
      const roleId = DEPT_ROLES[roleName];

      if (!target || !roleId) return message.react("❌");

      // Removes role for both suspension and ban as requested
      await target.roles.remove(roleId).catch(() => {});
      return message.react("✅");
    }

    // ================= STAFF SYSTEM =================
    const isStaff = message.member.roles.cache.has(SUPPORT) || message.member.roles.cache.has(MOD);
    if (!isStaff) return;

    if (!data["their username"] || !data["reason"]) return message.react("❓");
    const targetId = extractId(data["their username"]);
    if (!targetId || targetId === message.author.id) return message.react("🚫");
    const target = await message.guild.members.fetch(targetId).catch(() => null);
    if (!target) return message.react("❌");

    const reason = data["reason"];
    const approverId = extractId(data["approved by"]);
    const senderRank = getRank(message.member);
    if (!senderRank) return message.react("❌");
    const senderIndex = getRankIndex(senderRank);

    if (type === "promotion" || type === "demotion") {
      const currentRank = getRank(target);
      if (!currentRank) return message.react("❌");
      const targetIndex = getRankIndex(currentRank);
      if (senderIndex <= targetIndex) return message.react("🛡️");
      if (reason.length < 17) return message.react("📝");
      if (approverId === message.author.id) return message.react("❌");

      const isMulti = !!approverId;
      let newIndex = type === "promotion" ? (isMulti ? targetIndex + 2 : targetIndex + 1) : (isMulti ? targetIndex - 2 : targetIndex - 1);
      if (newIndex < 0 || newIndex >= ranks.length) return message.react("❌");

      if (isMulti) {
        const approver = await message.guild.members.fetch(approverId).catch(() => null);
        if (!approver || !(approver.roles.cache.has(HIGH_APPROVAL) || approver.roles.cache.has(MID_APPROVAL))) return message.react("❌");
      }

      await target.roles.add(ranks[newIndex]);
      await target.roles.remove(currentRank).catch(() => {});
      if (newIndex >= 6) for (const r of SPECIAL_ROLES) await target.roles.add(r).catch(() => {});
      return message.react("✅");
    }

    if (type === "termination") {
      if (reason.length < 17 || !approverId || approverId === message.author.id) return message.react("❌");
      const currentRank = getRank(target);
      if (currentRank && senderIndex <= getRankIndex(currentRank)) return message.react("🛡️");
      const approver = await message.guild.members.fetch(approverId).catch(() => null);
      if (!approver || !approver.roles.cache.has(MID_APPROVAL)) return message.react("❌");

      const rolesToSave = target.roles.cache.filter(r => ranks.includes(r.id)).map(r => r.id);
      await db.saveTermination(target.id, rolesToSave);
      await target.roles.remove(rolesToSave);
      return message.react("✅");
    }

    if (type === "termination-revert") {
      if (reason.length < 15 || !approverId || approverId === message.author.id) return message.react("❌");
      const saved = await db.getTermination(target.id);
      if (!saved) return message.react("❌");
      for (const r of saved.roles) await target.roles.add(r).catch(() => {});
      await db.deleteTermination(target.id);
      return message.react("✅");
    }

    return message.react("❓");
  } catch (err) {
    console.error(err);
    return message.react("⚠️");
  }
});

client.login(TOKEN);
