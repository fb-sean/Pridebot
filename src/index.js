require("dotenv").config();
const { token, databaseToken, topggToken, botlisttoken, botlistauth } =
  process.env;
const { connect } = require("mongoose");
const {
  Client,
  Collection,
  ChannelType,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
} = require("discord.js");
const fs = require("fs");
const { AutoPoster } = require("topgg-autoposter");
const BotlistMeClient = require("botlist.me.js");
const CommandUsage = require("../mongo/models/usageSchema.js");
const ProfileData = require("../mongo/models/profileSchema.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageTyping,
  ],
});
client.commands = new Collection();
client.commandArray = [];
client.botStartTime = Math.floor(Date.now() / 1000);

const functionFolders = fs.readdirSync(`./src/functions`);
for (const folder of functionFolders) {
  const functionFolders = fs
    .readdirSync(`./src/functions/${folder}`)
    .filter((file) => file.endsWith(".js"));
  for (const file of functionFolders)
    require(`./functions/${folder}/${file}`)(client);
}

const eventHandlers = {
  updateChannelName: require("./events/client/statsTracker.js"),
  handleGuildCreate: require("./events/client/guildCreate.js"),
  handleGuildDelete: require("./events/client/guildDelete.js"),
  handleReportFeedback: require("./events/client/modals.js"),
};

const userprofile = require("./commands/Profile/userprofile.js");
const usergaydar = require("./commands/Fun/usergaydar.js");
const usertransdar = require("./commands/Fun/usertransdar.js");

client.on(Events.GuildCreate, (guild) =>
  eventHandlers.handleGuildCreate(client, guild)
);
client.on(Events.GuildDelete, (guild) =>
  eventHandlers.handleGuildDelete(client, guild)
);
client.on("interactionCreate", (interaction) => {
  eventHandlers.handleReportFeedback(client, interaction);
});

setInterval(() => eventHandlers.updateChannelName(client), 5 * 60 * 1000);
client.once("ready", () => {
  eventHandlers.updateChannelName(client);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isUserContextMenuCommand()) {
    if (interaction.commandName === "User Profile") {
      await userprofile.execute(interaction);
    }
    if (interaction.commandName === "User Gaydar") {
      await usergaydar.execute(interaction);
    }
    if (interaction.commandName === "User Transdar") {
      await usertransdar.execute(interaction);
    }
  }
});

const ap = AutoPoster(topggToken, client);
ap.on("posted", () => {
  console.log("Posted stats to Top.gg!");
});

const botlistme = new BotlistMeClient(botlisttoken, client);
botlistme.on("posted", () => {
  console.log("Server count posted!");
});

const commandsPath = "./src/commands";
const clientId = "1101256478632972369";
client.handleCommands(commandsPath, clientId);
client.handleEvents();
client.login(token);

connect(databaseToken)
  .then(() => console.log("Connected to MongoDB"))
  .catch(console.error);

const express = require("express");
const cors = require("cors");
const app = express();

const port = 2610;

app.listen(port, () => {
  console.log(`API is running on port ${port}`);
});

async function getRegisteredCommandsCount(client) {
  if (!client.application) {
    console.error("Client application is not ready.");
    return 0;
  }
  const commands = await client.application.commands.fetch();
  return commands.size;
}
/*
const apiKeyAuth = (req, res, next) => {
  const userApiKey = req.header('x-api-key');
  const validApiKey = 'testing';

  if (userApiKey && userApiKey === validApiKey) {
    next(); // Allow the request to proceed
  } else {
    res.status(401).json({ message: 'Unauthorized: Incorrect API Key' });
  }
};
*/

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.get("/api/stats", cors(), async (req, res) => {
  const currentGuildCount = client.guilds.cache.size;

  const totalUserCount = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);

  try {
    const usages = await CommandUsage.aggregate([
      {
        $group: {
          _id: null,
          totalUsage: {$sum: "$count"}
        }
      }
    ]).exec();
    const totalUsage = usages.length > 0 ? usages[0].totalUsage : 0;

    const commandsCount = (await getRegisteredCommandsCount(client)) + 2;

    const botuptime = client.botStartTime;

    res.json({ totalUserCount, currentGuildCount, totalUsage, commandsCount, botuptime });
  } catch (error) {
    console.error("Failed to get API stats:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/profiles/:userId", cors(), async (req, res) => {
  try {
    const profile = await ProfileData.findOne({ userId: req.params.userId });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    return res.json(profile);
  } catch (error) {
    console.error("Failed to retrieve profile:", error);
    return res.status(500).send("Internal Server Error");
  }
});

async function handleVote(userId, botId, botListUrl, res) {
  const user = await client.users.fetch(userId).catch(() => {
  });
  if (!user) {
    console.error("Error fetching user from Discord. User ID:", userId);
    return res.status(500).send("Internal Server Error");
  }

  const channel = await client.channels.fetch("1224815141921624186").catch(() => {
  });
  if (!channel || channel.type !== ChannelType.GuildText) {
    return res
        .status(400)
        .send("Channel not found or is not a text channel");
  }

  await channel.send({
    embeds: [
      new EmbedBuilder()
          .setDescription(
              `**Thank you <@${userId}> for voting for <@${botId}> on ${botListUrl} <:_:1198663251580440697>** \nYou can vote again <t:${~~(Date.now() / 1000) + 12 * 60 * 60}:R>.`
          )
          .setColor("#FF00EA")
          .setThumbnail(user.displayAvatarURL())
          .setTimestamp()
    ]
  }).catch(console.error);

  return res.status(200).send("Success!");
}

app.post("/wumpus-votes", async (req, res) => {
  return handleVote(req.body.userId, req.body.botId, '[Wumpus.Store](https://wumpus.store/bot/' + req.body.botId + '/vote "Opens wumpus.store in your browser.")', res);
});

app.post("/topgg-votes", async (req, res) => {
  return handleVote(req.body.user, req.body.bot, '[Top.gg](https://top.gg/bot/' + req.body.botId + '/vote "Opens top.gg in your browser.")', res);
});

app.post("/botlist-votes", async (req, res) => {
  if (req.header("Authorization") !== botlistauth) {
    return res.status(401).send('Unauthorized');
  }

  return handleVote(req.body.user, req.body.bot, '[Botlist.me](https://botlist.me/bots/' + req.body.botId + '/vote "Opens botlist.me in your browser.")', res);
});

app.post(
  "/github",
  express.json({ type: "application/json" }),
  async (request, response) => {
    const githubEvent = request.headers["x-github-event"];
    const data = request.body;
    let embed = new EmbedBuilder();

    if (githubEvent === "push") {
      const commitCount = data.commits.length;
      const commitMessages = data.commits
        .map(
          (commit) =>
            `[\`${commit.id.slice(0, 7)}\`](${commit.url}) - **${
              commit.message
            }**`
        )
        .join("\n");
      const title = `${commitCount} New ${data.repository.name} ${
        commitCount > 1 ? "Commits" : "Commit"
      }`;
      const fieldname = `${commitCount > 1 ? "Commits" : "Commit"}`;

      embed
        .setColor("#FF00EA")
        .setAuthor({
          name: `${data.pusher.name}`,
          iconURL: `https://cdn.discordapp.com/emojis/1226912165982638174.png`,
          url: `https://github.com/${data.pusher.name}`,
        })
        .setTitle(title)
        .setTimestamp()
        .addFields({ name: fieldname, value: commitMessages });
    } else if (githubEvent === "star" && data.action === "created") {
      embed
        .setColor("#FF00EA")
        .setDescription(
          `## :star: New Star \n**Thank you [${data.sender.login}](https://github.com/${data.sender.name}) for starring [${data.repository.name}](https://github.com/${data.repository.full_name})**`
        )
        .setTimestamp();
    } else if (githubEvent === "star" && data.action === "deleted") {
      console.log(`${data.sender.login} removed their star ;-;`);
    } else {
      console.log(`Unhandled event: ${githubEvent}`);
      return;
    }

    try {
      const channel = await client.channels.fetch("1101742377372237906");
      if (!channel) {
        console.log("Could not find channel");
        return;
      }

      await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error sending message to Discord:");
    }
  }
);
