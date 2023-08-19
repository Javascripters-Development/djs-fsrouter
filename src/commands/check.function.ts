"use strict";
import {
	ApplicationCommandOptionType,
	ApplicationCommandType,
	type ApplicationCommandSubCommandData,
} from "discord.js";
const { Subcommand, SubcommandGroup } = ApplicationCommandOptionType;
const { ChatInput } = ApplicationCommandType;
import type { Command, AutocompleteHandler } from "../types/config.js";

export const NAME_REGEX = /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

export class LoadError extends Error {
	commandName: string;
	constructor(commandName: string, message: string) {
		super(message);
		this.commandName = commandName;
	}
}

export default function checkCommand(
	command: Command | ApplicationCommandSubCommandData,
) {
	const { name } = command;
	if (name.length > 32)
		throw new LoadError(name, `Command name too long (${name.length})/32`);
	if (!NAME_REGEX.test(name))
		throw new LoadError(name, "Invalid command name.");
	if (name !== name.toLowerCase())
		throw new LoadError(name, "Command names must be lowercase.");

	const { description, type = ChatInput } = command;

	if (
		"run" in command &&
		typeof command.run !== "function" &&
		type !== Subcommand
	)
		throw new LoadError(name, "Missing a 'run' function.");

	if (type === ChatInput || type === Subcommand) {
		if (!description) throw new LoadError(name, `Missing description.`);
		if (typeof description !== "string")
			throw new LoadError(name, "The description must be a string.");
		if (description.length < 4)
			throw new LoadError(name, `Description too short.`);
		if (description.length > 100)
			throw new LoadError(
				name,
				`Description too long (${description.length}/100).`,
			);

		if ("options" in command)
			checkOptions(name, command.options, command.autocomplete);
	} else {
		if ("description" in command)
			throw new LoadError(
				name,
				"Non-chat input commands cannot have a description.",
			);
		if ("options" in command)
			throw new LoadError(name, "Non-chat input commands cannot have options.");
	}
}

function checkOptions(
	cmdName: string,
	options: Command["options"],
	autocompleteHandler?: AutocompleteHandler,
) {
	if (!Array.isArray(options))
		throw new LoadError(cmdName, "'options' must be an Array.");
	if (!options.length) return;

	const firstIsSubcmd =
		options[0].type === Subcommand || options[0].type === SubcommandGroup;

	for (const option of options) {
		const { type, name, description } = option;
		const isSubCmd = type === Subcommand || type === SubcommandGroup;
		if (firstIsSubcmd !== isSubCmd)
			throw new LoadError(
				cmdName,
				"Cannot mix subcommands and subcommand groups with other option types.",
			);

		if (!name) throw new LoadError(cmdName, "Options must have a name.");
		if (!NAME_REGEX.test(name))
			throw new LoadError(cmdName, `Invalid option name: ${name}`);

		if (typeof description !== "string")
			throw new LoadError(cmdName, "Option description must be a string.");
		if (description.length < 4)
			throw new LoadError(
				cmdName,
				`Option ${name}'s description is too short.`,
			);
		if (description.length > 100)
			throw new LoadError(
				cmdName,
				`Option ${name}'s description is too long (${description.length}/100).`,
			);

		if (type === SubcommandGroup) {
			const { options: subCommands } = option;
			if (!subCommands?.length)
				throw new LoadError(
					cmdName,
					`Subcommand group ${name} is missing its subcommands.`,
				);
			if (
				subCommands.some(
					({ type }: { type: ApplicationCommandOptionType }) =>
						type !== Subcommand,
				)
			)
				throw new LoadError(
					cmdName,
					`Subcommand group options can only be subcommands.`,
				);
			subCommands.forEach(checkCommand);
		} else if (type === Subcommand) checkCommand(option);
		else if (option.autocomplete) {
			if (!autocompleteHandler)
				throw new LoadError(
					cmdName,
					`Command has an autocomplete option, but no autocomplete handler.`,
				);
			if (typeof autocompleteHandler !== "function")
				throw new LoadError(
					cmdName,
					`Autocomplete handler must be a function.`,
				);
			break;
		}
	}
}
