"use strict";

import type { Client, GuildApplicationCommandManager } from "discord.js";
import { ChannelType } from "discord.js";
export const ALL_TEXT_CHANNEL_TYPES = [
	ChannelType.GuildText,
	ChannelType.PublicThread,
	ChannelType.PrivateThread,
	ChannelType.GuildAnnouncement,
	ChannelType.AnnouncementThread,
];
import type { Config } from "./types/config.js";
import type { InitOptions } from "./commands/index.js";
import { statSync } from "node:fs";
import { commands, init as initCommands, specialFolders } from "./commands/index.js";
import { load as loadOwnerCommands, /*reload as reloadOwnerCommands,*/ command as ownerCommand } from "./commands/owner.js";
import interactionHandler from "./interactionCreate.js";
import { fileURLToPath } from "node:url";

export { commands/*, reload*/ } from "./commands/index.js";
export * as guildCommands from "./commands/guild.js";
/*
export async function reloadOwner() {
	const { name } = ownerCommand;
	const command = ownerManager?.cache.find((cmd) => cmd.name === name);
	if(command) {
		const newCommand = await reloadOwnerCommands();
		return newCommand ? command.edit(newCommand) : command.delete();
	}
};*/

export function getPath(metaURL: string, relative: string) {
	return fileURLToPath(new URL(relative, metaURL));;
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
	}: Config,
) {
	if(!folder)
		throw new TypeError("You must provide the commands folder.");

	if (!statSync(folder).isDirectory())
		throw new TypeError("'folder' must be a path to a folder");

	if (middleware && typeof middleware === "function")
		middleware = [middleware];

	if (!folder.startsWith("/") && !folder.match(/^[A-Z]:/))
		throw new Error("Relative paths are not supported. Please provide the absolute path to your commands folder.");

	if (singleServer && !ownerServerId)
		throw new Error("Need to specify the ownerServer is singleServer is set to true.");

	const initOptions: InitOptions = {
		debug,
		middleware,
		autoSubCommands,
		defaultDmPermission,
	};
	if (ownerServerId) {
		if (ownerSubfolderExists(ownerCommand)) {
			specialFolders.push(ownerCommand);
			const ownerServer = await client.guilds.fetch(ownerServerId);
			ownerManager = ownerServer.commands;
			if(singleServer) initOptions.allAsGuild = ownerServer;

			const ownerCmd = await loadOwnerCommands(folder, { name: ownerCommand });
			if(ownerCmd) {
				if (singleServer) commands[ownerCommand] = ownerCmd;
				else ownerManager.set([ownerCmd]);
			}
		}
	}

	const load = initCommands(client, folder, initOptions);

	if (statSync(folder + "/$guild", { throwIfNoEntry: false })?.isDirectory())
		load.then(async () => {
			const {
				init: initGuildCmds,
				commands: guildCommands,
			} = await import("./commands/guild.js");
			await initGuildCmds(client, folder + "/$guild", middleware);
			Object.assign(commands, guildCommands);
		});

	load.then(() =>
		client.on("interactionCreate", interactionHandler),
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
