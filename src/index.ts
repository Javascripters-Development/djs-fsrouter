import type { Client, GuildApplicationCommandManager } from "discord.js";
import { ChannelType } from "discord.js";
export const ALL_TEXT_CHANNEL_TYPES = [
	ChannelType.GuildText,
	ChannelType.PublicThread,
	ChannelType.PrivateThread,
	ChannelType.GuildAnnouncement,
	ChannelType.AnnouncementThread,
];
import type {
	Config,
	GuildFileCommand,
	FileCommand,
	MessageFileCommand,
	UserFileCommand,
} from "./types.js";
import type { InitOptions } from "./commands/index.js";
import { statSync } from "node:fs";
import CommandLoader, { specialFolders } from "./commands/index.js";
import { load as loadOwnerCommands } from "./commands/owner.js";
import interactionHandler from "./interactionCreate.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export * as guildCommands from "./commands/guild.js";

export function getPath(metaURL: string, relative: string) {
	return fileURLToPath(new URL(relative, metaURL));
}

let ownerManager: GuildApplicationCommandManager;

export default async function loadCommands(
	client: Client,
	{
		folder,
		ownerCommand = "owner",
		ownerServer: ownerServerId,
		singleServer,
		autoSubCommands = true,
		debug = false,
		defaultDmPermission = false,
		middleware = [],
		commandFileExtension = ["js"],
	}: Config,
) {
	if (!folder) throw new TypeError("You must provide the commands folder.");
	folder = resolve(folder);
	if (!statSync(folder).isDirectory())
		throw new TypeError("'folder' must be a path to a folder");
	if (!Array.isArray(commandFileExtension))
		commandFileExtension = [commandFileExtension];
	if (middleware && typeof middleware === "function") middleware = [middleware];

	if (singleServer && !ownerServerId)
		throw new Error(
			"Need to specify the ownerServer is singleServer is set to true.",
		);

	const initOptions: InitOptions = {
		debug,
		middleware,
		autoSubCommands,
		defaultDmPermission,
		commandFileExtension,
	};
	const commandManager = new CommandLoader(client, folder, initOptions);
	let ownerCmd: Awaited<ReturnType<typeof loadOwnerCommands>> = false;
	if (ownerServerId) {
		if (ownerSubfolderExists(ownerCommand)) {
			specialFolders.push(ownerCommand);
			const ownerServer = await client.guilds.fetch(ownerServerId);
			ownerManager = ownerServer.commands;

			ownerCmd = await loadOwnerCommands(folder, { name: ownerCommand });
			if (ownerCmd) {
				if (singleServer) commandManager.commands[ownerCommand] = ownerCmd;
				else ownerManager.set([ownerCmd]);
			}
		}
	}

	const load = commandManager.init(
		singleServer
			? await client.guilds.fetch(ownerServerId as string)
			: undefined,
	);
	if (ownerCmd && !singleServer) {
		const ownerCmdClosure = ownerCmd;
		load.then(() => {
			commandManager.commands[ownerCmdClosure.name] = ownerCmdClosure;
		});
	}

	if (statSync(`${folder}/$guild`, { throwIfNoEntry: false })?.isDirectory())
		load.then(async () => {
			const { init: initGuildCmds, commands: guildCommands } = await import(
				"./commands/guild.js"
			);
			await initGuildCmds(
				client,
				`${folder}/$guild`,
				commandManager.middleware,
				commandFileExtension as string[],
			);
			Object.assign(commandManager.commands, guildCommands);
		});

	load.then(() =>
		client.on("interactionCreate", (interaction) =>
			interactionHandler(interaction, commandManager),
		),
	);
	return load;

	function ownerSubfolderExists(name: string) {
		if (name === "owner")
			return statSync(`${folder}/owner`, {
				throwIfNoEntry: false,
			})?.isDirectory();
		if (!statSync(`${folder}/${name}`).isDirectory())
			throw new Error(
				"Owner command must not be a file but a subfolder with subcommand files.",
			);
		return true;
	}
}
export type {
	GuildFileCommand as GuildCommand,
	FileCommand as Command,
	MessageFileCommand as MessageCommand,
	UserFileCommand as UserCommand,
};
