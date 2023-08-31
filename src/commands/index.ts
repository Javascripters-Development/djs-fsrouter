import {
	Client,
	ApplicationCommandManager,
	GuildApplicationCommandManager,
	ApplicationCommandType,
	ApplicationCommandOptionType,
	ChatInputCommandInteraction,
	AutocompleteInteraction,
	Guild,
} from "discord.js";
const { ChatInput } = ApplicationCommandType;
const { Subcommand, SubcommandGroup } = ApplicationCommandOptionType;
import type {
	Command,
	CommandGroup,
	Middleware,
	Subcommand,
	SubcommandGroup,
} from "../types.js";

import { readdirSync, existsSync } from "node:fs";

import checkCommand, { LoadError } from "./check.function.js";
import { pathToFileURL } from "node:url";
import { importCommand } from "../util.js";

export function toFileURL(path: string) {
	return pathToFileURL(path).href;
}

export const specialFolders: Array<string> = [];

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
	async init(allAsGuild?: Guild) {
		const { commands: commandManager } =
			allAsGuild || this.client.application || {};
		if (commandManager) {
			this.commandManager = commandManager;
			try {
				await this.loadFolder(this.root);
				await commandManager.set(Object.values(this.commands));
			} catch (err) {
				throw new Error(`Error loading commands: ${err}`);
			}
		} else {
			throw new Error("Couldn't get a command manager.");
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
				await this.load(name, subfolder);
			else if (file.isDirectory()) {
				if (this.autoSubCommands && name !== "$debug")
					await this.createCommandGroup(name);
				else await this.loadFolder(`${path}/${name}`);
			}
		}
	}
	async load(name: string, subfolder = "") {
		if (this.commandFileExtension.some((ext) => name.endsWith(`.${ext}`)))
			name = name.split(".")[0];

		if (this.commands[name]) {
			if (this.commands[name].subfolder !== subfolder)
				throw new LoadError(
					name,
					`Can't load command ${name} of subfolder "${subfolder}", it already exists in subfolder "${this.commands[name].subfolder}"`,
				);
		}

		const file = toFileURL(`${this.root}/${subfolder}/${name}.js`);
		let command: Command = {
			type: ChatInput,
			dmPermission: this.defaultDmPermission,
			...(await importCommand(file)),
			name,
			subfolder,
		};
		if (command.type === ChatInput && !command.options) command.options = [];
		Object.defineProperties(command, {
			name: readonly,
			subfolder: readonly,
		});
		for (const func of this.middleware) command = func(command);
		checkCommand(command);
		this.commands[name] = command;
		return command;
	}
	async createCommandGroup(cmdName: string) {
		const path = `${this.root}/${cmdName}`;
		const options: (Subcommand | SubcommandGroup)[] = [];
		const subcommands: { [name: string]: Subcommand } = {};
		const subcommandGroups: { [name: string]: SubcommandGroup } = {};
		const cmd: CommandGroup = {
			...(existsSync(`${path}/$info.js`)
				? await importCommand(toFileURL(`${path}/$info.js`))
				: { description: `/${cmdName}` }),
			name: cmdName,
			type: ChatInput,
			options,
			subcommands,
			subcommandGroups,
			run: runCommandGroup,
			autocomplete: commandGroupAutocomplete,
		};

		for (const file of readdirSync(path, { withFileTypes: true })) {
			const { name } = file;
			if (name[0] === "$") continue;

			if (file.isDirectory()) {
				const group = await this.createSubCommandGroup(cmdName, name);
				options.push(group);
				subcommandGroups[name] = group;
			} else {
				const ext = this.commandFileExtension.find((ext) =>
					name.endsWith(`.${ext}`),
				);
				if (ext) {
					const subCmd: Subcommand = {
						...(await importCommand(toFileURL(`${path}/${name}`))),
						name: name.slice(0, -(ext.length + 1)),
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
		const ext: string | undefined = this.commandFileExtension.find((ext) =>
			existsSync(`${path}/$info.${ext}`),
		);
		const group: SubcommandGroup = {
			...(ext
				? await importCommand(toFileURL(`${path}/$info.${ext}`))
				: { description: `/${parent} ${groupName}` }),
			name: groupName,
			type: SubcommandGroup,
			options,
			subcommands,
		};

		for (const file of readdirSync(path, { withFileTypes: true })) {
			const { name } = file;
			if (name[0] === "$") continue;

			if (file.isDirectory())
				throw new LoadError(
					parent,
					`Cannot have a subcommand group inside another subcommand group (in '${groupName}')`,
				);

			if (this.commandFileExtension.some((ext) => name.endsWith(`.${ext}`))) {
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
			await importCommand(toFileURL(`${directory}/${name}`));
		const { autocomplete } = subcommandData;
		name = name.slice(
			0,
			-(
				(
					this.commandFileExtension.find((ext) =>
						name.endsWith(`.${ext}`),
					) as string
				).length + 1
			),
		);
		if (!autocomplete)
			return {
				...subcommandData,
				name,
				type: Subcommand,
			};

		if (typeof autocomplete !== "function")
			throw new LoadError(name, "Subcommand autocomplete must be a function.");
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
