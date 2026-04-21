require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

// ─── Config ────────────────────────────────────────────────────────────────
const BASE_URL = process.env.VERCEL_URL || "https://YOUR_PROJECT.vercel.app";
const API_SECRET = process.env.API_SECRET;
const ADMIN_ROLE_ID = process.env.DISCORD_ADMIN_ROLE_ID;

// ─── Helper: panggil API ────────────────────────────────────────────────────
async function callAPI(method, endpoint, body = null) {
  const res = await fetch(`${BASE_URL}/api/${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_SECRET}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ─── Slash Commands ─────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("addkey")
    .setDescription("Tambah key baru")
    .addStringOption((o) => o.setName("label").setDescription("Label / nama untuk key ini"))
    .addIntegerOption((o) =>
      o.setName("expires_days").setDescription("Berlaku berapa hari? (kosong = selamanya)")
    )
    .addStringOption((o) =>
      o.setName("custom_key").setDescription("Custom key (opsional, default random)")
    ),

  new SlashCommandBuilder()
    .setName("deletekey")
    .setDescription("Hapus key")
    .addStringOption((o) =>
      o.setName("key").setDescription("Key yang mau dihapus").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("editkey")
    .setDescription("Edit key")
    .addStringOption((o) =>
      o.setName("key").setDescription("Key yang mau diedit").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("label").setDescription("Label baru")
    )
    .addStringOption((o) =>
      o.setName("status").setDescription("aktif / nonaktif").addChoices(
        { name: "Aktif", value: "aktif" },
        { name: "Nonaktif", value: "nonaktif" }
      )
    )
    .addIntegerOption((o) =>
      o.setName("expires_days").setDescription("Perpanjang berapa hari dari sekarang")
    )
    .addBooleanOption((o) =>
      o.setName("reset_hwid").setDescription("Reset HWID lock?")
    ),

  new SlashCommandBuilder()
    .setName("listkeys")
    .setDescription("Lihat semua key")
    .addStringOption((o) =>
      o.setName("filter").setDescription("Filter").addChoices(
        { name: "Semua", value: "all" },
        { name: "Aktif saja", value: "active" },
        { name: "Nonaktif saja", value: "inactive" }
      )
    ),

  new SlashCommandBuilder()
    .setName("checkkey")
    .setDescription("Cek status satu key")
    .addStringOption((o) =>
      o.setName("key").setDescription("Key yang mau dicek").setRequired(true)
    ),
];

// ─── Client ─────────────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function hasAdmin(interaction) {
  if (!ADMIN_ROLE_ID) return true; // Kalau tidak diset, semua boleh
  return interaction.member.roles.cache.has(ADMIN_ROLE_ID);
}

function formatDate(d) {
  if (!d) return "Selamanya ♾️";
  return new Date(d).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}

// ─── Ready ──────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Bot aktif sebagai ${client.user.tag}`);

  // Register slash commands ke guild
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.DISCORD_GUILD_ID), {
    body: commands.map((c) => c.toJSON()),
  });
  console.log("✅ Slash commands terdaftar!");
});

// ─── Interaction ────────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!hasAdmin(interaction)) {
    return interaction.reply({
      content: "❌ Kamu tidak punya izin untuk menggunakan command ini.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const { commandName } = interaction;

  // ── /addkey ────────────────────────────────────────────────────────────
  if (commandName === "addkey") {
    const label = interaction.options.getString("label");
    const expires_days = interaction.options.getInteger("expires_days");
    const custom_key = interaction.options.getString("custom_key");

    const data = await callAPI("POST", "keys", { label, expires_days, custom_key });

    if (data.error) {
      return interaction.editReply(`❌ Error: ${data.error}`);
    }

    const k = data.key;
    const embed = new EmbedBuilder()
      .setTitle("✅ Key Berhasil Ditambahkan!")
      .setColor(0x00ff88)
      .addFields(
        { name: "🔑 Key", value: `\`${k.key_value}\``, inline: false },
        { name: "🏷️ Label", value: k.label || "-", inline: true },
        { name: "⏰ Expired", value: formatDate(k.expires_at), inline: true },
        { name: "📅 Dibuat", value: formatDate(k.created_at), inline: true }
      )
      .setFooter({ text: "Roblox Key System" })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  // ── /deletekey ─────────────────────────────────────────────────────────
  if (commandName === "deletekey") {
    const key = interaction.options.getString("key");
    const data = await callAPI("DELETE", "keys", { key_value: key });

    if (data.error) return interaction.editReply(`❌ Error: ${data.error}`);

    return interaction.editReply(
      `🗑️ Key \`${key}\` berhasil dihapus!`
    );
  }

  // ── /editkey ───────────────────────────────────────────────────────────
  if (commandName === "editkey") {
    const key = interaction.options.getString("key");
    const label = interaction.options.getString("label");
    const status = interaction.options.getString("status");
    const expires_days = interaction.options.getInteger("expires_days");
    const reset_hwid = interaction.options.getBoolean("reset_hwid");

    const body = { key_value: key };
    if (label) body.label = label;
    if (status) body.is_active = status === "aktif";
    if (expires_days) body.expires_days = expires_days;
    if (reset_hwid !== null) body.reset_hwid = reset_hwid;

    const data = await callAPI("PUT", "keys", body);

    if (data.error) return interaction.editReply(`❌ Error: ${data.error}`);

    const k = data.key;
    const embed = new EmbedBuilder()
      .setTitle("✏️ Key Berhasil Diupdate!")
      .setColor(0xffaa00)
      .addFields(
        { name: "🔑 Key", value: `\`${k.key_value}\``, inline: false },
        { name: "🏷️ Label", value: k.label || "-", inline: true },
        { name: "📌 Status", value: k.is_active ? "✅ Aktif" : "❌ Nonaktif", inline: true },
        { name: "⏰ Expired", value: formatDate(k.expires_at), inline: true },
        { name: "💻 HWID", value: k.hwid ? `\`${k.hwid}\`` : "Belum terikat", inline: false }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  // ── /listkeys ──────────────────────────────────────────────────────────
  if (commandName === "listkeys") {
    const filter = interaction.options.getString("filter") || "all";
    const data = await callAPI("GET", "keys");

    if (data.error) return interaction.editReply(`❌ Error: ${data.error}`);

    let keys = data.keys;
    if (filter === "active") keys = keys.filter((k) => k.is_active);
    if (filter === "inactive") keys = keys.filter((k) => !k.is_active);

    if (keys.length === 0) {
      return interaction.editReply("📭 Tidak ada key yang ditemukan.");
    }

    // Split per 10 key biar tidak overflow embed
    const pages = [];
    for (let i = 0; i < keys.length; i += 10) pages.push(keys.slice(i, i + 10));

    const embed = new EmbedBuilder()
      .setTitle(`📋 Daftar Key (${keys.length} total)`)
      .setColor(0x5865f2)
      .setTimestamp();

    for (const k of pages[0]) {
      const status = k.is_active ? "✅" : "❌";
      const expired =
        k.expires_at && new Date(k.expires_at) < new Date() ? " ⚠️EXPIRED" : "";
      embed.addFields({
        name: `${status} \`${k.key_value}\`${expired}`,
        value: `Label: ${k.label || "-"} | Expired: ${formatDate(k.expires_at)}`,
        inline: false,
      });
    }

    if (pages.length > 1) {
      embed.setFooter({ text: `Menampilkan 10 dari ${keys.length} key. Gunakan filter untuk mempersempit.` });
    }

    return interaction.editReply({ embeds: [embed] });
  }

  // ── /checkkey ──────────────────────────────────────────────────────────
  if (commandName === "checkkey") {
    const key = interaction.options.getString("key");
    const data = await callAPI("GET", "keys");

    if (data.error) return interaction.editReply(`❌ Error: ${data.error}`);

    const k = data.keys.find((x) => x.key_value === key);
    if (!k) return interaction.editReply(`❌ Key \`${key}\` tidak ditemukan.`);

    const isExpired = k.expires_at && new Date(k.expires_at) < new Date();
    const embed = new EmbedBuilder()
      .setTitle("🔍 Info Key")
      .setColor(k.is_active && !isExpired ? 0x00ff88 : 0xff4444)
      .addFields(
        { name: "🔑 Key", value: `\`${k.key_value}\``, inline: false },
        { name: "🏷️ Label", value: k.label || "-", inline: true },
        {
          name: "📌 Status",
          value: !k.is_active ? "❌ Nonaktif" : isExpired ? "⚠️ Expired" : "✅ Aktif",
          inline: true,
        },
        { name: "⏰ Expired", value: formatDate(k.expires_at), inline: true },
        { name: "💻 HWID", value: k.hwid ? `\`${k.hwid}\`` : "Belum terikat", inline: false },
        {
          name: "🕐 Terakhir Digunakan",
          value: k.last_used_at ? formatDate(k.last_used_at) : "Belum pernah",
          inline: true,
        },
        { name: "📅 Dibuat", value: formatDate(k.created_at), inline: true }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
});

client.login(process.env.DISCORD_TOKEN);