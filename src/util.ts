export async function importCommand(path: string) {
	const command = await import(path);
	return command.default || command; // potentially switch to nullish coalescing
}
