import CommandLoader from "./commands/index.js";
import { type Interaction, InteractionType } from "discord.js";
export default async (
	interaction: Interaction,
	commandManager: CommandLoader,
) => {
	if (
		interaction.type !== InteractionType.ApplicationCommand &&
		interaction.type !== InteractionType.ApplicationCommandAutocomplete
	)
		return;

	const command = commandManager.commands[interaction.commandName];
	if (!command)
		console.error(`Received unknown command: ${interaction.commandName}`);
	else if (interaction.isChatInputCommand()) command.run(interaction);
	else if (interaction.isAutocomplete()) {
		if (typeof command.autocomplete === "function")
			command.autocomplete(interaction);
		else
			console.error(
				`Received autocomplete interaction for a command without autocomplete (${command.name})`,
			);
	}
};
