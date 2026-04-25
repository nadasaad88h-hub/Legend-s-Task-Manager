const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
    new SlashCommandBuilder().setName('check_points').setDescription('Check points').addUserOption(o => o.setName('user').setDescription('Target')),
    new SlashCommandBuilder().setName('daily').setDescription('Claim daily points'),
    new SlashCommandBuilder().setName('work_points').setDescription('Claim staff work points'),
    new SlashCommandBuilder().setName('verify_panel').setDescription('Send the verification button'),
    new SlashCommandBuilder().setName('promote').setDescription('Promote staff')
        .addUserOption(o => o.setName('target').setDescription('Staff member').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Amount').setRequired(true).addChoices({name: '+1 Rank', value: '1'}, {name: '+2 Ranks', value: '2'}))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
    new SlashCommandBuilder().setName('punish').setDescription('Issue a punishment')
        .addUserOption(o => o.setName('target').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true).addChoices(
            {name: 'Ban', value: 'Ban'}, {name: 'Kick', value: 'Kick'}, {name: 'Staff Warning', value: 'Staff Warning'}
        ))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
        .addStringOption(o => o.setName('evidence').setDescription('Link').setRequired(true)),
    new SlashCommandBuilder().setName('timeout').setDescription('Mute a user')
        .addUserOption(o => o.setName('target').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('duration').setDescription('e.g. 1h, 1d').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
        .addStringOption(o => o.setName('evidence').setDescription('Link').setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🔄 Registering commands...');
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
        console.log('✅ Success! Commands should now appear in the / menu.');
    } catch (error) { console.error(error); }
})();
