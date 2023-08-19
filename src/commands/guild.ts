"use strict";

import type {
	Snowflake,
	Client,
	Guild,
	ApplicationCommandManager,
} from "discord.js";
import { DiscordAPIError } from "discord.js";
import type { GuildCommand, Middleware } from "../types/config.js";
import { readdirSync } from "node:fs";

import checkCommand, { LoadError } from "./check.function.js";
import { toFileURL } from "./index.js";

const guildCommands: { [name: string]: GuildCommand } = {};
export { guildCommands as commands };
const defaultShouldCreateFor = () => true;

/**
 * Checks if the given command is in a guild.
 * @param {object|string} command The command (or command name).
 * @param {Guild} guild The guild it should be checked for.
 * @returns {boolean}
 */
export function isIn(command: string | GuildCommand, { id }: Guild) {
	if (typeof command === "string") command = guildCommands[command];
	return command.apiCommands.has(id);
}

/**
 * Loads guild commands.
 * @param {Client} client The Discord.js client
 * @param {string} folder The absolute path of folder where the commands are.
 * @param {function} middleware (optional) A function to run on the commands once they are loaded.
 */
export async function init(
	client: Client,
	folder: string,
	middleware: Middleware = [],
) {
	if (typeof middleware === "function") middleware = [middleware];

	for (const file of readdirSync(folder, { withFileTypes: true })) {
		let { name: fileName } = file;
		if (fileName[0] === "$" || !fileName.endsWith("js") || !file.isFile())
			continue;

		const name = fileName.slice(0, -3);
		const command: GuildCommand = {
			shouldCreateFor: defaultShouldCreateFor,
			...(await import(toFileURL(`${folder}/${fileName}`))),
			name,
			apiCommands: new Map(),
		};
		Object.defineProperty(command, "name", {
			writable: false,
			configurable: false,
			enumerable: true,
		});

		if (command.shouldCreateFor === defaultShouldCreateFor)
			console.warn(
				`Guild command ${name} uses the default shouldCreateFor. Maybe it should be registered as a regular command?`,
			);

		if ("getOptions" in command && typeof command.getOptions !== "function")
			throw new LoadError(
				name,
				`Guild command 'getOptions' must be a function, got ${typeof command.getOptions}.`,
			);

		for (const func of middleware) func(command);
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
					.map((cmd) => ({ ...cmd, options: cmd.getOptions?.(id) || [] })),
			)
			.then((apiCommands) => {
				for (const apiCmd of apiCommands.values())
					guildCommands[apiCmd.name]?.apiCommands.set(id, apiCmd);
			}, console.error);
	});

	client.on("guildDelete", ({ id }) => {
		for (const { apiCommands } of Object.values(guildCommands))
			apiCommands.delete(id);
	});
}

function getOptions({ getOptions, options }: GuildCommand, id: Snowflake) {
	return getOptions?.(id) || options || [];
}

/**
 * Create a command for the given server.
 * @param {GuildCommand|string} command The command (or command name).
 * @param {Guild} guild The guild it should be created in.
 * @param {boolean} skipCheck If true, the command will be created even if shouldCreateFor returns false.
 * @returns {false|Promise <Map>} false if the command should not be created, or a list of ApplicationCommand corresponding to this command, mapped by server id.
 */
export function createCmd(
	command: GuildCommand | string,
	{ id, commands }: Guild,
	skipCheck = false,
) {
	if (typeof command === "string") command = guildCommands[command];
	if (skipCheck || command.shouldCreateFor(id)) {
		const { apiCommands } = command;
		return commands
			.create({
				...command,
				options: getOptions(command, id),
			})
			.then((apiCommand) => apiCommands.set(id, apiCommand));
	}
	return false;
}

/**
 * Updates a command for the given server, creating or deleting it if needed. Always obeys shouldCreateFor.
 * @param {GuildCommand|string} command The command (or command name).
 * @param {Guild} guild The guild it should be updated for.
 * @param {boolean} createIfNotExists If true, the command will be created if it does not exist.
 * @returns {false|Promise} false if the command should not be created, or a Promise that resolves when the command is updated.
 */
export function updateCmd(
	command: GuildCommand | string,
	guild: Guild,
	createIfNotExists = true,
) {
	const { id, commands } = guild;
	if (typeof command === "string") command = guildCommands[command];
	const { apiCommands, name } = command;
	let apiCmd = apiCommands.get(id);
	if (!apiCmd) {
		apiCmd = commands.cache.find(({ name: _name }) => _name === name);
		if (apiCmd) apiCommands.set(id, apiCmd);
	}

	if (!command.shouldCreateFor(id) && apiCmd) {
		apiCommands.delete(id);
		return apiCmd.delete().catch(console.error);
	} else {
		const cmdData = { ...command, options: getOptions(command, id) };
		if (apiCmd)
			return apiCmd.edit(cmdData).catch((err: Error) => {
				if (!(err instanceof DiscordAPIError) || err.status !== 404) throw err;
				else {
					const newCommand = createCmd(command, guild, true);
					if (newCommand) return newCommand;
				}
			});
		else if (createIfNotExists)
			return commands
				.create(cmdData)
				.then((apiCmd) => apiCommands.set(id, apiCmd), createFailed);
		else
			throw new Error(
				`Tried to update command ${name} for guild ${guild}, but the API command couldn't be found.`,
			);
	}
}

/**
 * Delete a command for the given server. Ignores shouldCreateFor.
 * @param {GuildCommand|string} command The command (or command name).
 * @param {Guild} guild The guild it should be updated for.
 * @returns {?Promise<ApplicationCommand>}
 */
export function deleteCmd(
	command: GuildCommand | string,
	{ id, commands }: Guild,
) {
	if (typeof command === "string") command = guildCommands[command];
	const { name: cmdName } = command;
	const apiCmd =
		command.apiCommands.get(id) ||
		commands.cache.find(({ name }) => name === cmdName);
	command.apiCommands.delete(id);
	return apiCmd?.delete().catch(console.error) || Promise.resolve(false);
}

const failed = new Set();

function createFailed(error: DiscordAPIError) {
	if (!error.message.includes("daily application command creates")) throw error;

	const guildId = error.url.match(/guilds\/([0-9]+)\/commands/)?.[1];
	if (!guildId) throw error;
	if (failed.has(guildId)) return;

	failed.add(guildId);
	setTimeout(failed.delete.bind(failed, guildId), 86400_000); // 24h
	throw { guildId, error };
}
