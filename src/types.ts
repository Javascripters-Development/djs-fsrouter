import type {
	Snowflake,
	ChatInputCommandInteraction,
	ChatInputApplicationCommandData,
	ApplicationCommandSubCommandData,
	ApplicationCommandSubGroupData,
	ApplicationCommandOptionData,
	AutocompleteInteraction,
	ApplicationCommand,
} from "discord.js";
type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;
export interface Command extends ChatInputApplicationCommandData {
	run: ChatInputHandler;
	autocomplete?: AutocompleteHandler;
	subfolder: string;
}

export interface SubcommandGroup extends ApplicationCommandSubGroupData {
	subcommands: { [name: string]: Subcommand };
}
export interface Subcommand
	extends Omit<ApplicationCommandSubCommandData, "autocomplete"> {
	run: ChatInputHandler;
	autocomplete?: boolean | AutocompleteHandler;
	autocompleteHandler?: AutocompleteHandler;
}
export interface CommandGroup extends Command {
	subcommandGroups: { [name: string]: SubcommandGroup };
	subcommands: { [name: string]: Subcommand };
}

export interface GuildCommand extends Command {
	shouldCreateFor: (guildId: string) => boolean;
	getOptions?: (guildId: string) => ApplicationCommandOptionData[];
	apiCommands: Map<Snowflake, ApplicationCommand>;
}

export type ChatInputHandler = (
	interaction: ChatInputCommandInteraction,
) => void;
export type AutocompleteHandler = (
	interaction: AutocompleteInteraction,
) => void;

export type Middleware = (inputCommand: Command) => Command;
export interface Config {
	folder: string;
	ownerCommand?: string;
	ownerServer?: string;
	singleServer?: boolean;
	autoSubCommands?: boolean;
	debug?: boolean;
	defaultDmPermission?: boolean;
	middleware?: Middleware | Middleware[];
	commandFileExtension?: string | string[];
}
export type FileCommand = Optional<
	Omit<Command, "name" | "subfolder">,
	| "options"
	| "type"
	| "autocomplete"
	| "defaultMemberPermissions"
	| "descriptionLocalizations"
	| "dmPermission"
	| "nameLocalizations"
	| "nsfw"
>;
export type GuildFileCommand = Optional<
	Omit<GuildCommand, "name" | "subfolder" | "apiCommands">,
	| "options"
	| "type"
	| "autocomplete"
	| "defaultMemberPermissions"
	| "descriptionLocalizations"
	| "dmPermission"
	| "nameLocalizations"
	| "nsfw"
	| "getOptions"
>;