    // --- SAFE STAFF COMMANDS ---
    if (itx.commandName === "punish") {
        const target = itx.options.getMember("target");
        const type = itx.options.getString("type");
        const reason = itx.options.getString("reason");
        const evidence = itx.options.getString("evidence");

        if (!target) return itx.reply({ content: "User not found.", ephemeral: true });

        const dm = new EmbedBuilder()
            .setTitle("⚖️ Punishment Issued: Lagging Legends")
            .setColor(0xFF0000)
            .addFields(
                { name: "Type", value: `**${type}**`, inline: true },
                { name: "Reason", value: reason },
                { name: "Evidence", value: `[Link](${evidence})` }
            )
            .setTimestamp();
        
        await target.send({ embeds: [dm] }).catch(() => console.log("DMs locked."));
        
        const log = client.channels.cache.get(MODLOGS_CHANNEL) || await client.channels.fetch(MODLOGS_CHANNEL).catch(() => null);
        if (log) log.send({ embeds: [dm.setTitle(`🚨 Log: ${target.user.tag}`).addFields({name: "Staff", value: `${itx.user}`})] });
        
        return itx.reply({ content: `✅ Logged punishment for ${target.user.tag}`, ephemeral: true });
    }
