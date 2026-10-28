import {
  Client,
  GatewayIntentBits,
  Partials,
  type Message,
  type TextChannel,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from "discord.js";
import { ENV } from "./_core/env";
import {
  getDiscordBotConfig,
  recordDiscordChatMessage,
  getRecentDiscordChannelMessages,
  getOrCreateDiscordMemberProfile,
  updateDiscordMemberPersonaNotes,
  getDiscordChannelSummary,
  saveDiscordChannelSummary,
  listDiscordMemberProfiles,
  type DiscordBotConfig,
  findUserByDiscordId,
  getCreditProfile,
  getUserTier,
  getQuotaStatus,
  getUsageSummary,
} from "./db";

let client: Client | null = null;
let isStarting = false;
let proactiveTimer: NodeJS.Timeout | null = null;
let summarizationInProgress = false;
const lastReplyTimestamp: Record<string, number> = {};

// Playful emoji sets for automatic reactions
const FUNNY_REACTIONS = ["💀", "👀", "🤡", "🔥", "🚀", "😈", "😭", "💯", "🗿", "⚡"];

/**
 * Normalizes text to extract plain content without bot mention tag.
 */
function stripBotMention(content: string, botId?: string): string {
  if (!botId) return content.trim();
  return content
    .replace(new RegExp(`<@!?${botId}>`, "g"), "")
    .trim();
}

/**
 * Calls Qronos LLM Gateway using the configured model and API key.
 */
async function callQronosLLM(
  config: DiscordBotConfig,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxTokens = 65536
): Promise<string | null> {
  try {
    let baseUrl = (config.apiBaseUrl || "https://api.qronos.me/v1").trim().replace(/\/+$/, "");
    if (!baseUrl.endsWith("/v1")) {
      baseUrl = `${baseUrl}/v1`;
    }
    const url = `${baseUrl}/chat/completions`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey || "qr_cMdnshQRg6pYmRHo4kJadHRLm8B0Zd7FPQTR0X8asNA"}`,
      },
      body: JSON.stringify({
        model: config.modelId || "glm-5.3-flash",
        messages,
        max_tokens: maxTokens,
        temperature: 0.85,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[DiscordBot] LLM call failed with status ${res.status}:`, errText.slice(0, 200));
      return null;
    }

    const data: any = await res.json();
    const choice = data?.choices?.[0];
    const rawContent = choice?.message?.content || choice?.message?.reasoning_content || "";
    return rawContent?.trim() || null;
  } catch (err) {
    console.error("[DiscordBot] LLM fetch error:", err);
    return null;
  }
}

/**
 * Background worker: Summarizes older channel history when conversation grows long.
 */
async function maybeSummarizeChannelContext(channelId: string, guildId: string, config: DiscordBotConfig) {
  if (summarizationInProgress) return;
  summarizationInProgress = true;

  try {
    const existingSummary = await getDiscordChannelSummary(channelId);
    const messages = await getRecentDiscordChannelMessages(channelId, 40);

    if (messages.length < 20) return;

    // Check if we already summarized up to the latest messages
    const latestMessage = messages[messages.length - 1];
    if (existingSummary?.lastMessageId === latestMessage.messageId) return;

    const transcript = messages
      .map((m) => `${m.authorDisplayName || m.authorUsername}: ${m.content}`)
      .join("\n");

    const summaryPrompt = `You are an AI memory manager for a Discord server.
Summarize the conversation transcript below into concise, bulleted semantic memory points.
Focus on:
• User topics, coding projects, questions asked, and solutions discussed
• Running jokes, member nicknames, teasing moments, and banter
• Notable opinions or preferences expressed by specific members

Prior Context Summary:
${existingSummary?.summary || "None"}

New Conversation to summarize:
${transcript}

Output ONLY 3-6 bullet points summarizing the key context. Keep it compact.`;

    const newSummary = await callQronosLLM(
      config,
      [
        { role: "system", content: "You are a concise semantic memory summarizer." },
        { role: "user", content: summaryPrompt },
      ],
      8192
    );

    if (newSummary) {
      await saveDiscordChannelSummary({
        channelId,
        guildId,
        summary: newSummary,
        lastMessageId: latestMessage.messageId,
        messageCount: messages.length,
      });
      console.log(`[DiscordBot] Successfully updated rolling summary for channel ${channelId}`);
    }
  } catch (err) {
    console.error("[DiscordBot] Error in background summarizer:", err);
  } finally {
    summarizationInProgress = false;
  }
}

/**
 * Background worker: Extracts notable user traits or inside jokes for member profile.
 */
async function maybeExtractMemberTraits(
  memberId: string,
  username: string,
  messageContent: string,
  guildId: string,
  config: DiscordBotConfig
) {
  if (messageContent.length < 15 || messageContent.startsWith("http")) return;

  try {
    const extractPrompt = `Analyze this Discord message from user "${username}":
"${messageContent}"

If the message reveals something specific about the user (e.g. favorite tech stack, languages they code in, what they are building, where they live, a funny quirk, or self-deprecating joke), output a 1-sentence note to remember about them.
If the message is generic or trivial banter with no personal fact, reply with "NONE".`;

    const note = await callQronosLLM(
      config,
      [
        { role: "system", content: "You are a member personality fact extractor. Output the fact or NONE." },
        { role: "user", content: extractPrompt },
      ],
      4096
    );

    if (note && !note.includes("NONE") && note.length > 5 && note.length < 150) {
      await updateDiscordMemberPersonaNotes(memberId, note.trim(), guildId);
      console.log(`[DiscordBot] Remembered fact for ${username}: ${note.trim()}`);
    }
  } catch {}
}

/**
 * Proactive Icebreaker / Silence Breaker:
 * Randomly pings a member with a fun teasing debate or dev roast when quiet.
 */
async function runProactiveIcebreaker(config: DiscordBotConfig) {
  if (!client || !client.isReady() || !config.enabled || !config.proactiveEnabled) return;

  const targetChannelId = config.allowedChannelIds[0];
  if (!targetChannelId) return;

  try {
    const channel = await client.channels.fetch(targetChannelId).catch(() => null);
    if (!channel || !("send" in channel)) return;

    // Check last message time in channel
    const textChan = channel as TextChannel;
    const recent = await textChan.messages.fetch({ limit: 1 }).catch(() => null);
    const lastMsg = recent?.first();

    if (lastMsg) {
      const elapsedMinutes = (Date.now() - lastMsg.createdTimestamp) / (1000 * 60);
      if (elapsedMinutes < config.proactiveIntervalMinutes) {
        // Channel was recently active; skip proactive trigger
        return;
      }
    }

    // Pick an active member to playfully tease or ping
    const profiles = await listDiscordMemberProfiles(config.guildId, 25);
    const activeProfiles = profiles.filter((p) => p.interactionCount > 2);
    const targetMember = activeProfiles.length > 0
      ? activeProfiles[Math.floor(Math.random() * activeProfiles.length)]
      : null;

    const mentionSnippet = targetMember ? `<@${targetMember.discordUserId}>` : "everyone";
    const memberNote = targetMember?.personaNotes ? `(Note about this user: ${targetMember.personaNotes})` : "";

    const icebreakerPrompt = `The Discord channel has been quiet. Generate a single, punchy, funny, and slightly cheeky message to revive the conversation.
Target member to playfully tease or ping: ${mentionSnippet} ${memberNote}

Guidelines:
• Include the exact mention ${mentionSnippet} in your text.
• Ask a spicy developer question, roast a tech stack, or make a playful comment (e.g. asking if they are still debugging, or tabs vs spaces, or why their code isn't deployed yet).
• Keep it under 2 sentences with emojis (💀, 👀, 🚀, 😈).
• Make it irresistible for them to reply!`;

    const icebreaker = await callQronosLLM(
      config,
      [
        { role: "system", content: config.systemPrompt },
        { role: "user", content: icebreakerPrompt },
      ],
      65536
    );

    if (icebreaker) {
      await textChan.send(icebreaker);
      console.log(`[DiscordBot] Sent proactive icebreaker in channel ${targetChannelId}`);
    }
  } catch (err) {
    console.error("[DiscordBot] Proactive icebreaker error:", err);
  }
}

/**
 * Handles incoming messages from Discord channels.
 */
async function handleMessage(message: Message) {
  if (!client || !client.user) return;
  if (message.author.bot) return;

  const config = await getDiscordBotConfig();
  if (!config.enabled) return;

  const botId = client.user.id;
  const isDirectMention = message.mentions.has(botId);
  const isReplyToBot = message.reference?.messageId
    ? Boolean(message.channel.messages.cache.get(message.reference.messageId)?.author?.id === botId)
    : false;

  const isChannelAllowed = config.allowedChannelIds.length === 0 || config.allowedChannelIds.includes(message.channelId);

  // Record every message from allowed channels in persistent memory
  if (isChannelAllowed) {
    await recordDiscordChatMessage({
      messageId: message.id,
      channelId: message.channelId,
      guildId: message.guildId || config.guildId,
      authorId: message.author.id,
      authorUsername: message.author.username,
      authorDisplayName: message.member?.displayName || message.author.username,
      content: message.content,
      isBot: false,
      replyToMessageId: message.reference?.messageId ?? null,
    });

    // Update member profile
    await getOrCreateDiscordMemberProfile({
      guildId: message.guildId || config.guildId,
      discordUserId: message.author.id,
      username: message.author.username,
      displayName: message.member?.displayName || message.author.username,
    });

    // Background extract notable personal facts
    void maybeExtractMemberTraits(
      message.author.id,
      message.author.username,
      message.content,
      message.guildId || config.guildId,
      config
    );

    // Background check if rolling summary needed
    void maybeSummarizeChannelContext(message.channelId, message.guildId || config.guildId, config);
  }

  // 1. Emoji Reaction Trigger: Randomly react with playful/mischievous emojis based on probability
  if (isChannelAllowed && Math.random() * 100 < (config.reactionProbability || 40)) {
    const emoji = FUNNY_REACTIONS[Math.floor(Math.random() * FUNNY_REACTIONS.length)];
    try {
      await message.react(emoji);
    } catch {}
  }

  // 2. Chat Response Decision:
  // Should the bot talk?
  // - Always if directly mentioned (@QronosAI)
  // - Always if replying to bot's prior message
  // - Always if message mentions key conversation keywords (bot, roast, joke, ai, bro, etc.)
  // - High probability (75%) if message contains a question (?)
  // - Spontaneous natural chime-in (35%) in allowed channels
  const contentLower = message.content.toLowerCase();
  const CONVERSATION_KEYWORDS = [
    "qronos",
    "bot",
    "roast",
    "ai",
    "joke",
    "fun",
    "bro",
    "dude",
    "server",
    "model",
    "code",
    "bug",
    "help",
    "who",
    "talk",
    "active",
    "chat",
    "alive",
    "setting",
    "what",
    "tell me",
    "haha",
    "lol",
    "lmao",
  ];

  const keywordTrigger = CONVERSATION_KEYWORDS.some((kw) => contentLower.includes(kw));
  const isQuestion = message.content.includes("?") && Math.random() * 100 < 75;
  const spontaneousChimeIn = isChannelAllowed && Math.random() * 100 < 35;

  const shouldRespond = isDirectMention || isReplyToBot || keywordTrigger || isQuestion || spontaneousChimeIn;
  if (!shouldRespond || !isChannelAllowed) return;

  // Rate limiting: avoid back-to-back spam in the same channel (min 3.5s between autonomous replies)
  const now = Date.now();
  const lastSpoke = lastReplyTimestamp[message.channelId] || 0;
  if (!isDirectMention && !isReplyToBot && now - lastSpoke < 3500) {
    return;
  }
  lastReplyTimestamp[message.channelId] = now;

  // Send typing indicator
  if ("sendTyping" in message.channel) {
    try {
      await (message.channel as TextChannel).sendTyping();
    } catch {}
  }

  try {
    // Gather multi-tier memory:
    // A. Long-term Channel Semantic Summary
    const channelSummary = await getDiscordChannelSummary(message.channelId);

    // B. Member Profile Dossier
    const profiles = await listDiscordMemberProfiles(message.guildId || config.guildId, 50);
    const authorProfile = profiles.find((p) => p.discordUserId === message.author.id);

    // C. Recent 20 conversational turns
    const recentMessages = await getRecentDiscordChannelMessages(message.channelId, 20);

    const memoryBlocks: string[] = [];
    if (channelSummary?.summary) {
      memoryBlocks.push(`[PAST CONVERSATION SUMMARY & INSIDE JOKES]:\n${channelSummary.summary}`);
    }
    if (authorProfile?.personaNotes) {
      memoryBlocks.push(`[KNOWN FACTS ABOUT AUTHOR @${message.author.username}]:\n${authorProfile.personaNotes}`);
    }

    const conversationTranscript = recentMessages
      .map((m) => {
        const role = m.isBot ? "assistant" : "user";
        const speaker = m.authorDisplayName || m.authorUsername;
        return `${speaker}: ${m.content}`;
      })
      .join("\n");

    const cleanInput = stripBotMention(message.content, botId);

    const systemPromptWithMemory = `${config.systemPrompt}

CURRENT CHANNEL CONTEXT:
${memoryBlocks.join("\n\n") || "No prior history recorded yet."}

INSTRUCTIONS:
• You are speaking to @${message.author.username} (${message.member?.displayName || message.author.username}).
• Be witty, funny, teasing, and playful according to your naughty level (${config.naughtyLevel}%).
• Use the past conversation context or known facts to crack inside jokes or tease them.
• Keep your reply natural, punchy (1-3 sentences), with good emojis (💀, 👀, 🔥, 😈).
• Output ONLY the Discord message reply.`;

    const messagesForLLM: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPromptWithMemory },
      {
        role: "user",
        content: `Recent Channel Conversation:\n${conversationTranscript}\n\nLatest message from @${message.author.username}: "${cleanInput || message.content}"`,
      },
    ];

    const replyText = await callQronosLLM(config, messagesForLLM, 65536);

    if (replyText) {
      const cleanReply = replyText.length > 1950 ? replyText.slice(0, 1950) + "..." : replyText;
      let sent: Message | null = null;
      try {
        sent = await message.reply({
          content: cleanReply,
          allowedMentions: { repliedUser: true },
        });
      } catch {
        if ("send" in message.channel) {
          sent = await (message.channel as TextChannel).send(cleanReply);
        }
      }

      if (sent) {
        // Record bot's reply in memory
        await recordDiscordChatMessage({
          messageId: sent.id,
          channelId: sent.channelId,
          guildId: sent.guildId || config.guildId,
          authorId: botId,
          authorUsername: client.user?.username || "QronosAI",
          authorDisplayName: "QronosAI",
          content: cleanReply,
          isBot: true,
          replyToMessageId: message.id,
        });
        console.log(`[DiscordBot] Sent reply to ${message.author.username}: ${cleanReply.slice(0, 60)}...`);
      }
    }
  } catch (err) {
    console.error("[DiscordBot] Failed generating response:", err);
  }
}

/**
 * Initializes and connects the Discord Bot service.
 */
/**
 * Registers /balance and /usage slash commands to Discord guild or globally.
 */
async function registerDiscordSlashCommands(botClient: Client, guildId?: string) {
  try {
    const commands = [
      new SlashCommandBuilder()
        .setName("balance")
        .setDescription("Check your Qronos AI token & PAYG compute balance"),
      new SlashCommandBuilder()
        .setName("usage")
        .setDescription("Inspect your Qronos AI token throughput & request activity"),
    ];

    const targetGuildId = guildId || ENV.discordGuildId || "1553707015384207453";
    if (targetGuildId) {
      const guild = await botClient.guilds.fetch(targetGuildId).catch(() => null);
      if (guild) {
        await guild.commands.set(commands);
        console.log(`[DiscordBot] Registered slash commands (/balance, /usage) to guild ${targetGuildId}`);
        return;
      }
    }
    if (botClient.application) {
      await botClient.application.commands.set(commands);
      console.log("[DiscordBot] Registered global slash commands (/balance, /usage)");
    }
  } catch (err: any) {
    console.error("[DiscordBot] Failed to register slash commands:", err.message);
  }
}

/**
 * Handles incoming slash command interactions (/balance, /usage).
 */
async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
  const { commandName, user: discordUser } = interaction;

  if (commandName === "balance") {
    await interaction.deferReply({ ephemeral: true });

    const qronosUser = await findUserByDiscordId(discordUser.id);
    if (!qronosUser) {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🔗 Link Your Qronos AI Account")
        .setDescription(
          `Hey **${discordUser.username}**, your Discord account is not yet connected to a Qronos AI workspace.\n\nLink your account now to claim **10,000,000 Free Coding Tokens** and unlock high-throughput model routing:`
        )
        .setFooter({ text: "Qronos AI · Universal LLM Gateway", iconURL: client?.user?.displayAvatarURL() });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Connect Discord & Claim 10M Tokens")
          .setStyle(ButtonStyle.Link)
          .setURL("https://qronos.me/verify-discord"),
        new ButtonBuilder()
          .setLabel("Sign In / Register")
          .setStyle(ButtonStyle.Link)
          .setURL("https://qronos.me/signin")
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    const [profile, tier, quota] = await Promise.all([
      getCreditProfile(qronosUser.id),
      getUserTier(qronosUser.id),
      getQuotaStatus(qronosUser.id),
    ]);

    const codingPlanTokens = Number(profile?.codingPlanTokens ?? 0);
    const paygBalanceNanos = Number(profile?.paygBalanceNanos ?? 0);
    const paygBalanceUsd = (paygBalanceNanos / 1_000_000_000).toFixed(2);
    const formattedTokens =
      codingPlanTokens >= 1_000_000
        ? `${(codingPlanTokens / 1_000_000).toFixed(2)}M Tokens`
        : `${codingPlanTokens.toLocaleString()} Tokens`;

    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle("⚡ Qronos AI — Developer Portfolio")
      .setDescription(`Connected workspace for **${qronosUser.name || qronosUser.email || discordUser.username}**`)
      .addFields(
        {
          name: "🎁 Coding Plan Tokens",
          value: `**${formattedTokens}**\n*(Wholesale Frontier Pool)*`,
          inline: true,
        },
        {
          name: "💳 PAYG Compute",
          value: `**$${paygBalanceUsd} USD**\n*(On-Demand Mesh)*`,
          inline: true,
        },
        {
          name: "🏆 Developer Tier",
          value: `**${String(tier).toUpperCase()}**`,
          inline: true,
        },
        {
          name: "📊 Daily Allowance",
          value: `${quota?.remainingRequests?.toLocaleString() ?? "2,000"} requests / ${quota?.remainingTokens ? (quota.remainingTokens / 1_000_000).toFixed(1) + "M" : "unlimited"} tokens remaining`,
          inline: false,
        },
        {
          name: "🟢 Gateway Status",
          value: "Zero Artificial Rate Limits · Direct Streaming Active",
          inline: false,
        }
      )
      .setFooter({ text: "Qronos AI · Universal LLM Gateway", iconURL: client?.user?.displayAvatarURL() })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("Add Balance & Plans")
        .setStyle(ButtonStyle.Link)
        .setURL("https://qronos.me/dashboard/pricing"),
      new ButtonBuilder()
        .setLabel("Developer Dashboard")
        .setStyle(ButtonStyle.Link)
        .setURL("https://qronos.me/dashboard"),
      new ButtonBuilder()
        .setLabel("API Documentation")
        .setStyle(ButtonStyle.Link)
        .setURL("https://qronos.me/docs")
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
    return;
  }

  if (commandName === "usage") {
    await interaction.deferReply({ ephemeral: true });

    const qronosUser = await findUserByDiscordId(discordUser.id);
    if (!qronosUser) {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🔗 Link Your Qronos AI Account")
        .setDescription(
          `Hey **${discordUser.username}**, connect your Discord account to inspect your personal API key usage and gateway throughput in real time:`
        )
        .setFooter({ text: "Qronos AI · Universal LLM Gateway", iconURL: client?.user?.displayAvatarURL() });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Connect Discord")
          .setStyle(ButtonStyle.Link)
          .setURL("https://qronos.me/verify-discord")
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    const usage = await getUsageSummary(qronosUser.id);

    const embed = new EmbedBuilder()
      .setColor(0x06b6d4)
      .setTitle("📈 Qronos AI — Gateway Observability")
      .setDescription(`Throughput activity for **${qronosUser.name || qronosUser.email || discordUser.username}**`)
      .addFields(
        {
          name: "⚡ Lifetime Tokens",
          value: `**${(usage.totalTokens || 0).toLocaleString()}** tokens`,
          inline: true,
        },
        {
          name: "📡 Total Invocations",
          value: `**${(usage.totalRequests || 0).toLocaleString()}** requests`,
          inline: true,
        },
        {
          name: "🕒 Requests Available Today",
          value: `**${usage.quota?.remainingRequests?.toLocaleString() ?? "2,000"}** reqs`,
          inline: true,
        },
        {
          name: "🛡️ Security Vault",
          value: "SHA-256 Hashed Keys · Zero Plaintext Storage",
          inline: false,
        }
      )
      .setFooter({ text: "Qronos AI · Universal LLM Gateway", iconURL: client?.user?.displayAvatarURL() })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("View Detailed Request Logs")
        .setStyle(ButtonStyle.Link)
        .setURL("https://qronos.me/dashboard/usage"),
      new ButtonBuilder()
        .setLabel("Open Prompt Studio")
        .setStyle(ButtonStyle.Link)
        .setURL("https://qronos.me/dashboard/playground")
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
    return;
  }
}

export async function startDiscordBotService(): Promise<boolean> {
  if (client?.isReady()) return true;
  if (isStarting) return false;

  const FALLBACK_DISCORD_BOT_TOKEN = "***REMOVED***";
  const botToken = (process.env.DISCORD_BOT_TOKEN || ENV.discordBotToken || FALLBACK_DISCORD_BOT_TOKEN).trim();
  if (!botToken) {
    console.log("[DiscordBot] No DISCORD_BOT_TOKEN found; bot service idle.");
    return false;
  }

  isStarting = true;

  try {
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    });

    client.on("ready", async () => {
      console.log(`[DiscordBot] Logged in as ${client?.user?.tag} (ID: ${client?.user?.id})! Ready to chat.`);
      const config = await getDiscordBotConfig();

      // Register slash commands for /balance and /usage
      if (client) {
        void registerDiscordSlashCommands(client, config.guildId || ENV.discordGuildId);
      }

      // Start proactive icebreaker timer
      if (proactiveTimer) clearInterval(proactiveTimer);
      proactiveTimer = setInterval(() => {
        void getDiscordBotConfig().then((cfg) => runProactiveIcebreaker(cfg));
      }, Math.max(10, config.proactiveIntervalMinutes || 60) * 60 * 1000);
    });

    client.on("interactionCreate", (interaction) => {
      if (interaction.isChatInputCommand()) {
        void handleSlashCommand(interaction).catch((err) => {
          console.error("[DiscordBot] Slash command error:", err);
        });
      }
    });

    client.on("error", (err) => {
      console.error("[DiscordBot] WebSocket error:", err.message);
    });

    await client.login(botToken);
    isStarting = false;
    return true;
  } catch (err: any) {
    console.error("[DiscordBot] Login failed:", err.message);
    isStarting = false;
    client = null;
    return false;
  }
}

/**
 * Gracefully shuts down the bot client.
 */
export async function stopDiscordBotService(): Promise<void> {
  if (proactiveTimer) {
    clearInterval(proactiveTimer);
    proactiveTimer = null;
  }
  if (client) {
    try {
      await client.destroy();
    } catch {}
    client = null;
  }
}

/**
 * Returns live bot status for the admin panel.
 */
export async function getDiscordBotLiveStatus() {
  const config = await getDiscordBotConfig();
  const isConnected = Boolean(client?.isReady());
  const botTag = client?.user?.tag ?? null;
  const botId = client?.user?.id ?? null;

  return {
    isConnected,
    botTag,
    botId,
    config,
  };
}

/**
 * Sends a test message or manual banter ping from the admin panel to a channel.
 */
export async function sendDiscordBotTestMessage(
  channelId?: string,
  content?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!client || !client.isReady()) {
    return { success: false, error: "Discord bot client is not connected or ready." };
  }

  const config = await getDiscordBotConfig();
  const targetChannelId = channelId || config.allowedChannelIds[0] || "1562668900565393478";

  try {
    const channel = await client.channels.fetch(targetChannelId).catch(() => null);
    if (!channel || !("send" in channel)) {
      return { success: false, error: `Channel ${targetChannelId} not found or bot lacks permission.` };
    }

    const textChan = channel as TextChannel;
    const messageToSend =
      content?.trim() ||
      "💀 Yo! Qronos AI companion bot is active and calibrated. Ping me anytime or drop questions. 😈🚀";

    const sent = await textChan.send(messageToSend);

    // Record in database memory
    await recordDiscordChatMessage({
      messageId: sent.id,
      channelId: sent.channelId,
      guildId: sent.guildId || config.guildId,
      authorId: client.user?.id || "bot",
      authorUsername: client.user?.username || "QronosAI",
      authorDisplayName: "QronosAI",
      content: messageToSend,
      isBot: true,
      replyToMessageId: null,
    });

    return { success: true, messageId: sent.id };
  } catch (err: any) {
    console.error("[DiscordBot] Failed to send test message:", err);
    return { success: false, error: err.message || "Failed to send message to Discord." };
  }
}

export const MODEL_STATUS_CHANNEL_ID = "1565043170763341933";

export interface ModelStatusAlertPayload {
  modelId: string;
  modelName?: string;
  status: "degraded" | "operational" | "offline" | "rerouted";
  latencyMs?: number;
  message?: string;
}

/**
 * Sends a real-time model outage or operational recovery alert to #model-status.
 */
export async function sendDiscordModelStatusAlert(payload: ModelStatusAlertPayload): Promise<boolean> {
  if (!client || !client.isReady()) return false;

  const channelId = MODEL_STATUS_CHANNEL_ID;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !("send" in channel)) return false;

  const isDegraded = payload.status === "degraded" || payload.status === "offline";
  const color = isDegraded ? 0xef4444 : 0x10b981;
  const statusEmoji = isDegraded ? "🔴" : "🟢";
  const statusTitle = isDegraded ? "MODEL OUTAGE / DEGRADED" : "MODEL OPERATIONAL";

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${statusEmoji} [${statusTitle}] ${payload.modelName || payload.modelId}`)
    .setDescription(payload.message || (isDegraded ? "Upstream timeouts detected. Automatic failover routing active." : "Route operational with nominal latency."))
    .addFields(
      { name: "Model ID", value: `\`${payload.modelId}\``, inline: true },
      { name: "Status", value: isDegraded ? "⚠️ Degraded / Rerouted" : "✅ 100% Operational", inline: true },
      { name: "Latency", value: payload.latencyMs ? `${payload.latencyMs}ms` : "Sub-millisecond", inline: true }
    )
    .setFooter({ text: "Qronos AI · Live Gateway Telemetry", iconURL: client.user?.displayAvatarURL() })
    .setTimestamp();

  await (channel as TextChannel).send({ embeds: [embed] }).catch(() => null);
  return true;
}
