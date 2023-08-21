import {
	Client,
	ApplicationCommandManager,
	GuildApplicationCommandManager,
	ApplicationCommandOptionType,
	ChatInputCommandInteraction,
	AutocompleteInteraction,
	Guild,
} from "discord.js";
const { Subcommand, SubcommandGroup } = ApplicationCommandOptionType;
import type {
	Command,
	CommandGroup,
	Middleware,
	Subcommand,
	SubcommandGroup,
} from "../types/config.js";

import { readdirSync, existsSync } from "node:fs";

import checkCommand, { LoadError } from "./check.function.js";
import { pathToFileURL } from "node:url";

export function toFileURL(path: string) {
	return pathToFileURL(path).href;
}

export const specialFolders: Array<string> = [];
//Object.defineProperty(commands, "$reload", { value: reload });

export type InitOptions = {
	debug: boolean;
	autoSubCommands: boolean;
	defaultDmPermission: boolean;
	middleware: Middleware[];
	commandFileExtension: string[];
};
export default class CommandLoader {
	debug: boolean;
	autoSubCommands: boolean;
	middleware: Middleware[];
	client: Client;
	root: string;
	commands: Record<string, Command> = {};
	commandManager?: ApplicationCommandManager | GuildApplicationCommandManager;
	defaultDmPermission?: boolean;
	commandFileExtension: string[];
	constructor(
		client: Client,
		folder: string,
		{
			debug = false,
			autoSubCommands = true,
			middleware = [],
			defaultDmPermission = true,
			commandFileExtension = ["js"],
		}: Partial<InitOptions> = {},
	) {
		this.commandFileExtension = commandFileExtension;
		this.debug = debug;
		this.autoSubCommands = autoSubCommands;
		this.middleware = middleware;
		this.client = client;
		this.root = folder;
		this.defaultDmPermission = defaultDmPermission;
	}
	init(allAsGuild?: Guild) {
		const { commands: commandManager } =
			allAsGuild || this.client.application || {};
		if (commandManager) {
			this.commandManager = commandManager;
			return this.loadFolder(this.root).then(() =>
				commandManager.set(Object.values(this.commands)),
			);
		} else {
			return Promise.reject("Couldn't get a command manager.");
		}
	}
	async loadFolder(path: string) {
		const subfolder = path.substring(this.root.length + 1);

		for (const file of readdirSync(path, { withFileTypes: true })) {
			const { name } = file;
			if (
				(name[0] === "$" && (name !== "$debug" || !this.debug)) ||
				specialFolders.includes(name)
			)
				continue;

			if (
				file.isFile() &&
				this.commandFileExtension.some((ext) => name.endsWith(`.${ext}`))
			)
				this.load(name, subfolder);
			else if (file.isDirectory()) {
				if (this.autoSubCommands && name !== "$debug")
					await this.createCommandGroup(name);
				else this.loadFolder(`${path}/${name}`);
			}
		}
	}
	async load(name: string, subfolder = "") {
		if (name.endsWith(".js")) name = name.slice(0, -3);

		if (this.commands[name]) {
			if (this.commands[name].subfolder !== subfolder)
				throw new LoadError(
					name,
					`Can't load command ${name} of subfolder "${subfolder}", it already exists in subfolder "${this.commands[name].subfolder}"`,
				);

			//if (!reloadIfExists) return commands[name];
		}

		const file = toFileURL(`${this.root}/${subfolder}/${name}.js`);
		let command: Command = {
			options: [],
			dmPermission: this.defaultDmPermission,
			...(await import(file)),
			name,
			subfolder,
		};
		Object.defineProperties(command, {
			name: readonly,
			subfolder: readonly,
		});
		for (const func of this.middleware) command = func(command);
		checkCommand(command);
		return (this.commands[name] = command);
	}
	async createCommandGroup(cmdName: string) {
		const path = `${this.root}/${cmdName}`;
		const options: (Subcommand | SubcommandGroup)[] = [];
		const subcommands: { [name: string]: Subcommand } = {};
		const subcommandGroups: { [name: string]: SubcommandGroup } = {};
		const cmd: CommandGroup = {
			...(existsSync(`${path}/$info.js`)
				? await import(toFileURL(`${path}/$info.js`))
				: { description: `/${cmdName}` }),
			name: cmdName,
			options,
			subcommands,
			subcommandGroups,
			run: runCommandGroup,
			autocomplete: commandGroupAutocomplete,
		};

		for (const file of readdirSync(path, { withFileTypes: true })) {
			let { name } = file;
			if (name[0] === "$") continue;

			if (file.isDirectory()) {
				const group = await this.createSubCommandGroup(cmdName, name);
				options.push(group);
				subcommandGroups[name] = group;
			} else if (name.endsWith(".js")) {
				const subCmd: Subcommand = {
					...(await import(toFileURL(`${path}/${name}`))),
					name: name.slice(0, -3),
					type: Subcommand,
				};
				if (typeof subCmd.run !== "function")
					throw new LoadError(
						cmdName,
						`Subcommand ${name} is missing a 'run' function.`,
					);

				subcommands[name] = subCmd;
				options.push(subCmd);
			}
		}

		checkCommand(cmd);
		this.commands[cmdName] = cmd;
		return cmd;
	}

	async createSubCommandGroup(parent: string, groupName: string) {
		const path = `${this.root}/${parent}/${groupName}`;
		if (existsSync(`${path}/$info.js`))
			throw new LoadError(
				parent,
				`Subfolder ${groupName} is missing a $info.js file.`,
			);

		const options: Subcommand[] = [];
		const subcommands: { [name: string]: Subcommand } = {};
		const group: SubcommandGroup = {
			...(existsSync(`${path}/$info.js`)
				? await import(toFileURL(`${path}/$info.js`))
				: { description: `/${parent} ${groupName}` }),
			name: groupName,
			type: SubcommandGroup,
			options,
			subcommands,
		};

		for (const file of readdirSync(path, { withFileTypes: true })) {
			let { name } = file;
			if (name[0] === "$") continue;

			if (file.isDirectory())
				throw new LoadError(
					parent,
					`Cannot have a subcommand group inside another subcommand group (in '${groupName}')`,
				);

			if (name.endsWith(".js")) {
				const subCmd = await this.createSubCommand(path, name);
				if (typeof subCmd.run !== "function")
					throw new LoadError(
						name,
						`Subcommand ${groupName}/${name} is missing a 'run' function.`,
					);

				subcommands[subCmd.name] = subCmd;
				options.push(subCmd);
			}
		}

		return group;
	}

	async createSubCommand(directory: string, name: string): Promise<Subcommand> {
		const subcommandData: Omit<Subcommand, "autocompleteHandler"> =
			await import(toFileURL(`${directory}/${name}`));
		const { autocomplete } = subcommandData;
		name = name.slice(0, -3);
		if (!autocomplete)
			return {
				...subcommandData,
				name,
				type: Subcommand,
			};

		if (typeof autocomplete !== "function")
			throw new LoadError(name, `Subcommand autocomplete must be a function.`);
		return {
			...subcommandData,
			name,
			type: Subcommand,
			autocompleteHandler: autocomplete,
			autocomplete: !!autocomplete,
		};
	}
}

/**
 * Load all the commands to Discord.
 * @param {Client} client The Discord.js client
 * @param {string} folder The absolute path of folder where the commands are.
 * @param {object} options Additional options
 * @param {boolean|string} options.debug Enable debug mode (all commands defined as guild commands; if debug is a server id, that server is used, otherwise the first one in the cache is used)
 * @param {Guild} options.allAsGuild If defined, all commands will be defined as guild commands of this guild.
 * @param {boolean} options.autoSubCommands If true, folders will be treated as subcommand groups.
 * @param {function} options.middleware (optional) A function to run on the commands just before they are sent to Discord.
 * @returns {Promise <Collection <Snowflake, ApplicationCommand>>}
 */

const readonly = { writable: false, configurable: false, enumerable: true };

function runCommandGroup(
	this: CommandGroup,
	interaction: ChatInputCommandInteraction,
) {
	getSubcommand(this, interaction).run(interaction);
}

function commandGroupAutocomplete(
	this: CommandGroup,
	interaction: AutocompleteInteraction,
) {
	getSubcommand(this, interaction).autocompleteHandler?.(interaction);
}

function getSubcommand(
	commandGroup: CommandGroup,
	{ options }: ChatInputCommandInteraction | AutocompleteInteraction,
) {
	const group = options.getSubcommandGroup();
	const subcmd = options.getSubcommand();
	let subcommands: { [name: string]: Subcommand };
	if (group) {
		if (group in commandGroup.subcommandGroups)
			subcommands = commandGroup.subcommandGroups[group].subcommands;
		else
			throw new Error(
				`Received unknown subcommand group: '/${commandGroup.name} ${group}'`,
			);
	} else subcommands = commandGroup.subcommands;

	if (subcmd in subcommands) return subcommands[subcmd];
	else
		throw new Error(
			`Received unknown subcommand: '/${commandGroup.name} ${
				group || ""
			} ${subcmd}'`,
		);
}
