// ... (Keep your Configuration and Initialization the same)

// ================= [ MESSAGE GAME LOGIC ] =================
client.on(Events.MessageCreate, async (msg) => {
  // Only monitor the specific guess channel and ignore other bots
  if (msg.author.bot || msg.channel.id !== GUESS_CHANNEL_ID) return;

  // If there is no active round, just clean up the "nonsense" chat
  if (!currentRound) {
    return msg.delete().catch(() => {});
  }

  const userGuess = msg.content.toLowerCase().trim();
  const correctAnswer = currentRound.name.toLowerCase();

  // --- CASE 1: CORRECT ANSWER ---
  if (userGuess === correctAnswer) {
    currentRound = null; // Lock round immediately to prevent double-wins
    
    await msg.react("✅").catch(() => {});
    db.addPoints(msg.author.id, 2);

    const successMsg = await msg.reply(`🌟 Correct! **${msg.author.username}** identified the location. +2 Points.`);

    setTimeout(async () => {
      try {
        await msg.delete().catch(() => {});
        await successMsg.delete().catch(() => {});
        if (activeGameMessage) {
          await activeGameMessage.delete().catch(() => {});
          activeGameMessage = null;
        }
        nextRound(msg.channel);
      } catch (err) {
        console.log("Cleanup error (likely message already deleted):", err.message);
      }
    }, 2500);
    return;
  }

  // --- CASE 2: INCORRECT / NONSENSE ---
  // If they reached this point, the answer was wrong.
  try {
    await msg.react("❌");
    // Short delay so they see the X before the message vanishes
    setTimeout(() => {
      msg.delete().catch(() => {});
    }, 800);
  } catch (err) {
    msg.delete().catch(() => {});
  }
});

client.login(TOKEN);
