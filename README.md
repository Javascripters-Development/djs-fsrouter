# Discord.js Filesystem Router

A simple slash commands module for Discord.js that utilizes Next.js style filesystem routing to create subcommands mimicking folder structures automatically. Fork of [djs commands](https://framagit.org/GlanVonBrylan/djs-commands/-/tree/master/)

**Made for Discord.js 14.** Use with other versions is not guaranteed to work.

## Table of contents

- [Discord.js Filesystem Router](#discordjs-filesystem-router)
  - [Table of contents](#table-of-contents)
- [How to use](#how-to-use)
- [Command structure](#command-structure)
  - [Subfolders and subcommands](#subfolders-and-subcommands)
  - [Special folders](#special-folders)
    - [Owner commands](#owner-commands)
    - [Guild commands](#guild-commands)
- [Managing commands](#managing-commands)

# How to use

Put all your commands in a folder (see [Command structure](#command-structure)) and write the following code in your main file to load and register all your commands:

```JavaScript
import loadCommands from "djs-fsrouter"
client.once("ready", () => {
    loadCommands(client, options);
});
```

Where `client` is your Discord.js Client, and `options` an object with the following properties:

- `folder`: defaults to "commands". The folder where your commands are.
- `ownerCommand`: defaults to "owner". The name of the subfolder under `folder` where your [owner commands](#owner-commands) are. Ignored if you do not also set an `ownerServer`.
- `ownerServer`: the id of your server, where the owner commands will be set (if you defined any).
- `singleServer`: defaults to false. If true, all commands will function as guild commands for the guild id specified in `ownerServer`
- `autoSubcommands`: defaults to true. If true, files in subfolders will be treated as subcommands, and further subfolders as subcommand groups. See [Subfolders and subcommands](#subfolders-and-subcommands).
- `debug`: defaults to false. If true, debug commands will not be ignored.
- `defaultDmPermission`: defaults to false. The default value for dmPermission. Incompatible with `singleServer`.
- `middleware`: a function to apply to each command when it is loaded (excluding owner commands), before it is sent to Discord. Takes the command name and command object as it sole argument.

All options are... well, optional. You can skip this argument entirely.

Example:

```JavaScript
import loadCommands from "djs-fsrouter"
client.once("ready", () => {
    loadCommands(client, {
        ownerServer: "1234567890123456789",
        defaultDmPermission: true,
        middleware: (name, command) => console.log(`Command ${name} loaded:`, command.description)),
    });
});
```

`loadCommands` returns a Promise that resolves to a Collection of commands. It registers all commands, updating the existing ones, and deleting the ones you removed from your code.

Commands are run in an async context, even if their `run` function itself is not async.

# Command structure

If you need an example you can check out [the source code for Steam News](https://framagit.org/GlanVonBrylan/steam-news/-/tree/master/commands).

Each file is one command. The file has to be `.js`; ESM and TypeScript are not supported. Each file must export a description and a run function. The run function takes a [CommandInteraction](https://discord.js.org/#/docs/main/stable/class/CommandInteraction) as its sole argument.

It may also export an `autocomplete` function that will handle its autocomplete options. It should take a [AutocompleteInteraction](https://discord.js.org/#/docs/main/stable/class/AutocompleteInteraction) as its sole argument.

You can also export any other [ApplicationCommandData](https://discord.js.org/#/docs/main/stable/typedef/ApplicationCommandData).

**Important note:** if you export the name, it will be ignored. The file name (without `.js`) is always used as the command name. You can however export nameLocalizations.

Example of a simple command with options:

```JavaScript
const { enums: { STRING, CHANNEL, ALL_TEXT_CHANNEL_TYPES } } = require("@brylan/djs-commands");

exports.description = "Send a message to a channel";
exports.options = [{
    type: STRING, name: "message", required: true,
    description: "The essage to send",
}, {
    type: CHANNEL, name: "channel",
    channelTypes: ALL_TEXT_CHANNEL_TYPES,
    description: "The channel where to send the message (defaults to current channel if not provided)",
}];
exports.run = interaction => {
    const message = interaction.options.getString("message");
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    channel.send(message).catch(console.error);
}
```

Note: you do not need to `require` those enum values if you set `makeEnumsGlobal` to true;

If you want to add JS files in your command folder that aren't commands, just prefix their name with # and they will be ignored. Folders starting will # will also be ignored, as will files not ending in `.js`.

## Subfolders and subcommands

Unless `autoSubcommands` was set to `false`, any subfolders of the commands folder will be treated as a command, and the files within it its subcommands. A second-level subfolder would be a subcommand group. Subcommand groups cannot contain other groups, so any further subfolder will cause an error.

Subfolders can have a `#info.js` file that exports at least command properties the description, `defaultMemberPermissions` or localizations. It should not however export any options, as these will be defined by the files of the folder. If it does not exist, its description is set to its name.

Consider the following file tree:

```
commands
 └ shop
   └ offer
     ├ create.js
     ├ delete.js
   ├ #info.js
   ├ buy.js
 ├ inventory.js
```

This would create the following commands:

- /shop offer create
- /shop offer delete
- /shop buy
- /inventory

Where `#info.js` can be something like this:

```JavaScript
exports.description = "Shop commands";
```

## Special folders

- **#debug**: commands only created if the `debug` option is set. Meant for commands that help you debug your code but should not exist in production.
- **owner**: (or whatever you set as `ownerCommand.name`) Owner commands are only available in the provided ownerServer and can only be used by its admins. This is intended for commands only the bot owner should have access to, for instance a `/shutdown` command.
- **#guild**: folder for guild commands (or if `singleServer` was set, optional commands).

### Owner commands

The `ownerCommand` parameter is `"owner"` by default. It should be either a string, which will be its name, or an object with its name, description and default member permissions. For example:

```JavaScript
const { PermissionsBitField: {Flags: { ManageChannels, ManageMessages, BanMembers }} } = require("discord.js");
loadCommands(client, {
    ownerCommand: {
        name: "admin",
        description: "Admin commands",
        defaultMemberPermissions: ManageChannels | ManageMessages | BanMembers,
    }
});
```

_Note: the `defaultMemberPermissions` is `"0"` by default, which only lets administrators use it._

The command name **must** be the name of the subfolder in your commands folder where all the owner commands will be.

Owner commands are grouped as subcommands of a single command named `/owner` (or whatever you set as the name). If you have another command with that name, it will be overriden. However, the names of each subcommand can be used.

Note that the owner folder is not read recursively. Any of its subfolders will be ignored.

Since your owner commands will get the SUBCOMMAND type by default, if you need to have subcommands for an owner command, you will need to set its type to SUBCOMMAND_GROUP.

```JavaScript
const { enums: { SUBCOMMAND, SUBCOMMAND_GROUP } } = require("@brylan/djs-commands");
exports.type = SUBCOMMAND_GROUP;
exports.choices = [{
    type: SUBCOMMAND, // etc
}];
```

The owner command can be reloaded with the `reloadOwner` function. It returns `null` if the owner command does not exist, a Promise resolving to an [ApplicationCommand](https://discord.js.org/#/docs/main/stable/class/ApplicationCommand) otherwise.

```JavaScript
const { reloadOwner } = require("@brylan/djs-commands");
const promise = reloadOwner();
if(promise)
    promise.then(apiCmd => console.log("Owner commands reloaded:", apiCmd));
else
    console.error("The owner commands do not exist (yet?)");
```

### Guild commands

Guild commands require another export: `shouldCreateFor`, a function that takes a guild id as its sole argument, and should return a boolean value: `true` if the command should be present in that guild, false otherwise.
If `shouldCreateFor` is not defined, the command will be created for all guilds.

It may also have a `getOptions` function that takes the same argument. It should return an array of options, that can be different for every server. If `getOptions` does not exist or returns a falsy value, `options` will be used instead; or an empty array if it is not defined.

You can import the following functions from `guildCommands` to control guild commands:

**`createCmd(command, guild, skipCheck = false)`**
Creates a command if its `shouldCreateFor` function returns true for the provided Guild.
This is automatically called when the bot joins a server.

- command: the command name
- guild: the Guild object
- [skipCheck]: If true, `shouldCreateFor` will not be called and the command will be added to the guild regardless of what its return value would have been.
  Returns false if `shouldCreateFor` returned false, or a Promise that resolves when the command has been created.

**`updateCmd(command, guild, createIfNotExists = true)`**
Updates a command if its `shouldCreateFor` function returns true for the provided Guild, deletes it otherwise.

- command: the command name
- guild: the Guild object
- [createIfNotExists]: If true, the command will be created if it does not exist.
  Returns a Promise that resolves when the command has been updated.
  Throws an Error if the command did not exist and `createIfNotExists` was set to `false`.

**`deleteCmd(command, guild)`**
Deletes the command.

- command: the command name
- guild: the Guild object
  Returns `false` if the command was not in that guild, or `false` if it was not in that guild.

**`isIn(command, guild)`**
Checkes if the given command is in a guild.

- command: the command name
- guild: the Guild object
  Returns true or false.

**Example:** an optional `/hello` command. It is managed by a `/set-hello` command that only admins can use, which lets them choose the style of greetings to enable.

**commands/set-hello.js**

```JavaScript
const {
    guildCommands: { isIn },
    enums: { STRING },
} = require("@brylan/djs-commands");
const { setStyle, removeStyle } = require("./guild/hello");
exports.defaultMemberPermissions = "0";
exports.description = "Sets the type of greeting for /hello";
exports.options = [{
    type: STRING, name: "style", required: true,
    description: "The greeting style. 'none' deleted the command.",
    choices: [
        { name: "Formal", value: "formal" },
        { name: "Normal", value: "normal" },
        { name: "Informal", value: "informal" },
        { name: "None", value: "none" },
    ],
}];
exports.run = interaction => {
    const style = interaction.options.getString("style");
    const { guild } = interaction;
    if(style === "none") {
        if(isIn("hello", guild)) {
            removeStyle(guild)
                .then(() => interaction.reply("Command `/hello` removed."))
                .catch(console.error);
        }
        else {
            interaction.reply("The `/hello` command was not in this server.").catch(console.error);
        }
    }
    else {
        setStyle(guild, style)
            .then(() => interaction.reply("`/hello` command updated."))
            .catch(console.error);
    }
}
```

**commands/guild/hello.js**

```JavaScript
const styles = new Map();
const thisCmd = exports;

const { guildCommands: { updateCmd, deleteCmd } } = require("@brylan/djs-commands");

exports.setStyle = (guild, style) => {
    styles.set(guild.id, style);
    return updateCmd(thisCmd, guild);
}
exports.removeStyle = (guild) => {
    styles.delete(guild.id);
    return deleteCmd(thisCmd, guild);
}
exports.shouldCreateFor = styles.has.bind(styles);
import loadCommands from "djs-fsrouter"
const greetings = {
    formal: ["Greetings", "Salutations", "Good day"],
    normal: ["Hello", "Hi"],
    informal: ["Wassup", "'sup", "Yo"],
};

function toChoices(choice) {
    return { name: choice, value: choice };
}
exports.getOptions = guildId => [{
    type: STRING, name: "greeting", required: true,
    description: "The greeting to use",
    choices: greetings[styles.get(guildId)].map(toChoices),
}];
exports.description = "Say hello";
exports.run = interaction => {
    interaction.reply(`${interaction.options.getString("greeting")} ${interaction.user}!`).catch(console.error);
}
```

# Managing commands

You can import the `commands` object that contains all the command files. For instance if your commands folder has `hello.js`, `roles/get-role.js` and `roles/remove-role.js`, its keys will be `'hello'`, `'get-role'` and `'remove-role'`, and the values are these files' `exports` object.
The list includes all guild commands and the owner command.

There is also a `$reload` function. It takes the command name as its first argument and its subfolder as its second. Leave the second argument out if the file is in the root of the command folder. It returns a Promise that resolves to an [ApplicationCommand](https://discord.js.org/#/docs/main/stable/class/ApplicationCommand).

```JavaScript
const { commands, reload } = require("@brylan/djs-commands");
console.log("All registered commands:", Object.keys(commands));
reload("get-role", "role").then(apiCommand => console.log("Command role/get-role reloaded", apiCommand));
reload("hello").then(apiCommand => console.log("Command hello reloaded", apiCommand));
```

This resets the command object, so if you changed your code, you can update the command without rebooting the bot. This also means that if you saved references to it, they will need to be updated.

`reload` is also available in `commands` under the alias `$reload` as a non-enumerable properrty.

```JavaScript
const { commands, reload } = require("@brylan/djs-commands");
console.log(reload === commands.$reload); // true
```
