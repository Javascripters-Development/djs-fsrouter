import { commands } from "./commands/index.js";
import {
	type AutocompleteInteraction,
	type CommandInteraction,
	InteractionType,
} from "discord.js";
export default async (
	interaction: CommandInteraction | AutocompleteInteraction,
) => {
	if (
		interaction.type !== InteractionType.ApplicationCommand &&
		interaction.type !== InteractionType.ApplicationCommandAutocomplete
	)
		return;

	const command = commands[interaction.commandName];
	if (!command)
		console.error(`Received unknown command: ${interaction.commandName}`);
	else if (interaction.type === InteractionType.ApplicationCommand)
		command.run(interaction);
	else if (typeof command.autocomplete === "function")
		command.autocomplete(interaction);
	else
		console.error(
			`Received autocomplete interaction for a command without autocomplete (${command.name})`,
		);
};
