import CommandLoader from "./commands/index.js";
import { type Interaction, InteractionType, ApplicationCommandType } from "discord.js";
const { ChatInput, Message, User } = ApplicationCommandType;
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
	else {
		if (interaction.isAutocomplete()) {
			if (command.type !== ChatInput) {
				console.error(
					`Received autocomplete interaction for a non-ChatInput command (${command.name})`,
				);
			}
			else if (typeof command.autocomplete === "function")
				command.autocomplete(interaction);
			else
				console.error(
					`Received autocomplete interaction for a command without autocomplete (${command.name})`,
				);
		} else {
			// Repetition unfortunately needed to not confuse TypeScript
			if (interaction.isChatInputCommand() && command.type === ChatInput)
				command.run(interaction);
			else if (interaction.isMessageContextMenuCommand() && command.type === Message)
				command.run(interaction);
			else if (interaction.isUserContextMenuCommand() && command.type === User)
				command.run(interaction);
			else
				console.error(
					`Received command interaction of type ${interaction.type} for a command of type ${command.type}`
				);
		}
	}
};
