"use strict";

import { ApplicationCommandOptionType, PermissionResolvable } from "discord.js";
const { Subcommand, SubcommandGroup } = ApplicationCommandOptionType;
import checkCommand, { NAME_REGEX, LoadError } from "./check.function.js";
import type { Command, ChatInputHandler } from "../types/config.js";
import { readdirSync } from "node:fs";
import { toFileURL } from "./index.js";

export const command: Partial<Command> = {};
export const commands: { [name: string]: Command } = {};
let _parentFolder: string;

type OwnerConfig = {
	name: string,
	description: string,
	defaultMemberPermissions: PermissionResolvable | null,
};

/**
 * Loads owner comands.
 * @param {string} parentFolder The absolute path of the parent folder to owner commands.
 * @param {string} data Data about the command
 * @param {string} data.name The command name. Must be a subfolder under parentFolder. Default: "owner"
 * @param {string} data.description The command description. Default: "Execute an owner command"
 * @param {bigint|"0"} data.defaultMemberPermissions Default permissions required to execute the command. Default: "0"
 * @returns {object} the command object, ready to be registered.
 */
export async function load(
	parentFolder: string,
	{
		name,
		description = "Execute an owner command",
		defaultMemberPermissions = "0",
	}: Partial<OwnerConfig> = {},
): Promise<Command | false> {
	if (!name) name = "owner";
	else if (!NAME_REGEX.test(name))
		throw new Error(
			`Owner subfolder must have a valid command name; got '${name}'`,
		);

	const folder = `${parentFolder}/${name}`;
	const ownerCmdFiles = readdirSync(folder).filter((f) => f.endsWith(".js") && f[0] !== "$");
	if (!ownerCmdFiles) return false;

	for (const cmd of ownerCmdFiles.map((f) => f.slice(0, -3))) {
		const command = await import(toFileURL(`${folder}/${cmd}`));
		if (!("type" in command)) command.type = Subcommand;
		else if (command.type !== Subcommand && command.type !== SubcommandGroup)
			throw new LoadError(
				cmd,
				`Owner commands can only have the Subcommand or SubcommandGroup type.`,
			);
		command.name = cmd;
		checkCommand(command);
		commands[cmd] = command;
	}

	const run: ChatInputHandler = (inter) => commands[inter.options.getSubcommand()].run(inter);
	_parentFolder = parentFolder;
	return Object.assign(command, {
		name,
		subfolder: name,
		description,
		defaultMemberPermissions,
		options: Object.values(commands),
		run,
	});
};

/**
 * Reloads all owner commands, using the same arguments as the first one.
 * @returns {object} The owner command object, ready te be re-registered.
 */
/*
export function reload() {
	const { name } = command;
	if (!name)
		throw new Error(
			"Cannot reload owner commands unless they have already been loaded.",
		);

	const { description, defaultMemberPermissions } = command;
	return load(_parentFolder, { name, description, defaultMemberPermissions });
};
*/