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

export interface Command extends ChatInputApplicationCommandData {
	run: ChatInputHandler;
	autocomplete?: AutocompleteHandler;
	subfolder: string;
}

export interface SubcommandGroup extends ApplicationCommandSubGroupData {
	subcommands: { [name: string]: Subcommand };
}
export interface Subcommand extends Omit<ApplicationCommandSubCommandData, "autocomplete"> {
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

export type Middleware = ((inputCommand: Command) => Command)[] | ((inputCommand: Command) => Command);
export interface InternalConfig {
	folder: string;
	ownerCommand: string;
	ownerServer: string;
	singleServer: boolean;
	autoSubCommands: boolean;
	debug: boolean;
	defaultDmPermission: boolean;
	middleware: Middleware;
}
export type Config = Partial<InternalConfig>;
