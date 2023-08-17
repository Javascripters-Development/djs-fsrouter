"use strict";

import type { Client } from "discord.js";
import type { Config } from "./types/config.js";
import { statSync } from "node:fs";
import { reload, commands } from "./commands/index.js";
import { load as loadOwnerCommands } from "./commands/owner.js";
export { commands, reload } from "./commands/index.js";
exports.reloadOwner = () => {
	if (!ownerManager) return null;
	const {
		command: { name },
		reload,
	} = require("./commands/owner");
	return ownerManager.cache.find((cmd) => cmd.name === name).edit(reload());
};
exports.guildCommands = require("./commands/guild");
exports.enums = require("./enums");

let ownerManager;

export default async function loadCommands(
	client: Client,
	{
		folder = "commands",
		ownerCommand = "owner",
		ownerServer,
		singleServer,
		autoSubCommands = true,
		debug = false,
		defaultDmPermission,
		middleware,
	}: Config = {},
) {
	if (!statSync(folder).isDirectory())
		throw new TypeError("'folder' must be a path to a folder");

	if (middleware && typeof middleware !== "function")
		throw new TypeError("'middleware' must be a function");

	if (defaultDmPermission) commands.defaultDmPermission = true;

	if (folder.endsWith("/") || folder.endsWith("\\"))
		folder = folder.slice(0, -1);

	if (!folder.startsWith("/") && !folder.match(/^[A-Z]:/))
		folder = `${import.meta.url}/${folder}`;

	if (debug) {
		if (!singleServer)
			singleServer = ownerServer
				? await client.guilds.fetch(ownerServer)
				: client.guilds.cache.first();
	}
	if (singleServer) {
		singleServer =
			singleServer === true
				? client.guilds.cache.first()
				: await client.guilds.fetch(singleServer);
		ownerServer = singleServer;
	}

	if (ownerServer) {
		if (ownerSubfolderExists(ownerCommand)) {
			commands.specialFolders.push(ownerCommand);
			ownerServer = await client.guilds.fetch(ownerServer);
			const ownerCmd = require("./commands/owner").load(folder, ownerCommand);
			if (singleServer) commands.commands[ownerCmdName] = ownerCmd;
			else ownerServer.commands.set([ownerCmd]);
		}
	}

	const load = commands.init(client, folder, {
		debug,
		singleServer,
		middleware,
		autoSubCommands,
	});

	if (statSync(folder + "/#guild", { throwIfNoEntry: false })?.isDirectory())
		load.then(() => {
			const {
				init: initGuildCmds,
				commands: guildCommands,
			} = require("./commands/guild");
			initGuildCmds(client, folder + "/#guild", middleware);
			Object.assign(commands.commands, guildCommands);
		});

	load.then(() =>
		client.on("interactionCreate", require("./interactionCreate.ts")),
	);

	return load;

	function ownerSubfolderExists(name) {
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
