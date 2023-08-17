"use strict";

import type { Guild } from "discord.js";
import type { Command } from "../types/config.js";
// Guild commands, for those that need different options depending on the server

import checkCommand, { LoadError } from "./check.function.js";

const guildCommands = (exports.commands = {});
const defaultShouldCreateFor = () => true;

/**
 * Create a command for the given server.
 * @param {object|string} command The command (or command name).
 * @param {Guild} guild The guild it should be created in.
 * @param {boolean} skipCheck If true, the command will be created even if shouldCreateFor returns false.
 * @returns {false|Promise <Map>} false if the command should no
const { LoadError } = checkCommand;r a list of ApplicationCommand corresponding to this command, mapped by server id.
 */
exports.createCmd = createCmd;

/**
 * Updates a command for the given server, creating or deleting it if needed. Always obeys shouldCreateFor.
 * @param {object|string} command The command (or command name).
 * @param {Guild} guild The guild it should be updated for.
 * @param {boolean} createIfNotExists If true, the command will be created if it does not exist.
 * @returns {false|Promise} false if the command should not be created, or a Promise that resolves when the command is updated.
 */
exports.updateCmd = updateCmd;

/**
 * Delete a command for the given server. Ignores shouldCreateFor.
 * @param {object|string} command The command (or command name).
 * @param {Guild} guild The guild it should be updated for.
 * @returns {?Promise<ApplicationCommand>}
 */
exports.deleteCmd = deleteCmd;

/**
 * Checks if the given command is in a guild.
 * @param {object|string} command The command (or command name).
 * @param {Guild} guild The guild it should be checked for.
 * @returns {boolean}
 */
exports.isIn = (command, { id }) => {
	if (typeof command === "string") command = guildCommands[command];
	return command.apiCommands.has(id);
};

/**
 * Loads guild commands.
 * @param {Client} client The Discord.js client
 * @param {string} folder The absolute path of folder where the commands are.
 * @param {function} middleware (optional) A function to run on the commands once they are loaded.
 * @returns {Promise <Collection <Snowflake, ApplicationCommand>>}
 */
exports.init = (client, folder, middleware) => {
	for (const file of require("fs").readdirSync(folder, {
		withFileTypes: true,
	})) {
		let { name } = file;
		if (name[0] === "#" || !name.endsWith("js") || !file.isFile()) continue;

		const command = require(`${folder}/${name}`);
		name = name.slice(0, -3);
		command.apiCommands = new Map();

		if ("shouldCreateFor" in command) {
			if (typeof command.shouldCreateFor !== "function")
				throw new LoadError(
					name,
					`Guild command 'shouldCreateFor' must be a function, got ${typeof command.shouldCreateFor}.`,
				);
		} else command.shouldCreateFor = defaultShouldCreateFor;

		if ("getOptions" in command && typeof command.getOptions !== "function")
			throw new LoadError(
				name,
				`Guild command 'getOptions' must be a function, got ${typeof command.getOptions}.`,
			);

		middleware?.(name, command);
		command.name = name;
		if (!command.options) command.options = []; // So we can remove options
		checkCommand(command);
		guildCommands[name] = command;
	}

	const guilds = client.guilds.cache;
	for (const command of Object.values(guildCommands)) {
		for (const guild of guilds.values()) {
			const apiCmd = guild.commands.cache.find(
				({ name }) => name === command.name,
			);
			if (apiCmd) command.apiCommands.set(guild.id, apiCmd);
			else createCmd(command, guild);
		}
	}

	client.on("guildCreate", ({ id, commands }) => {
		commands
			.set(
				Object.values(guildCommands)
					.filter((cmd) => cmd.shouldCreateFor(id))
					.map((cmd) => ({ ...cmd, options: cmd.getOptions(id) })),
			)
			.then((apiCommands) => {
				for (const apiCmd of apiCommands)
					guildCommands[apiCmd.name]?.apiCommands.set(id, apiCmd);
			}, error);
	});

	client.on("guildDelete", ({ id }) => {
		for (const { apiCommands } of Object.values(guildCommands))
			apiCommands.delete(id);
	});
};

function getOptions({ getOptions, options }, id) {
	return getOptions?.(id) || options || [];
}

export async function createCmd(
	command: Command,
	{ id, commands }: Guild,
	skipCheck = false,
): Promise<void> {
	if (typeof command === "string") command = guildCommands[command];
	if (skipCheck || command.shouldCreateFor(id)) {
		const apiCommand = await commands.create({
			...command,
			options: getOptions(command, id),
		});
		command.apiCommands.set(id, apiCommand);
	}
}

function updateCmd(command, { id, commands }, createIfNotExists = true) {
	if (typeof command === "string") command = guildCommands[command];
	let apiCmd = command.apiCommands.get(id);
	if (!apiCmd) {
		apiCmd = commands.cache.find(({ name }) => name === command.name);
		command.apiCommands.set(id, apiCmd);
	}

	if (!command.shouldCreateFor(id) && apiCmd) {
		command.apiCommands.delete(id);
		return apiCmd.delete().catch(error);
	} else {
		const cmdData = { ...command, options: getOptions(command, id) };
		if (apiCmd)
			return apiCmd.edit(cmdData).catch((err) => {
				if (err.status === 404)
					return createCmd(command, { id, commands }, true);
				throw err;
			});
		else if (createIfNotExists)
			return commands
				.create(cmdData)
				.then((apiCmd) => command.apiCommands.set(id, apiCmd), createFailed);
		else
			throw new Error(
				`Tried to update command ${command.name} for guild ${guild}, but the API command couldn't be found.`,
			);
	}
}

function deleteCmd(command, { id, commands }) {
	if (typeof command === "string") command = guildCommands[command];
	const apiCmd =
		command.apiCommands.get(id) ||
		commands.cache.find(({ name }) => name === command.name);
	command.apiCommands.delete(id);
	return apiCmd?.delete().catch(error);
}

const failed = new Set();

function createFailed(err) {
	if (!err.message.includes("daily application command creates")) throw err;

	const guildId = err.url.match(/guilds\/([0-9]+)\/commands/)?.[1];
	if (!guildId) throw err;
	if (failed.has(guildId)) return;

	failed.add(guildId);
	setTimeout(failed.delete.bind(failed, guildId), 86400_000); // 24h
	error.guildId = guildId;
	throw err;
}
