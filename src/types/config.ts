import type {
	ChatInputCommandInteraction,
	ChatInputApplicationCommandData,
	AutocompleteInteraction,
} from "discord.js";

export interface Command extends ChatInputApplicationCommandData {
	run: ChatInputHandler;
	autocomplete?: AutocompleteHandler;
}
export interface GuildCommand extends Command {
	shouldCreateFor: (id: string) => boolean;
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
