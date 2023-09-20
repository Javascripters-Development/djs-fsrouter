import { pathToFileURL } from "node:url";

export async function importCommand(path: string) {
	const command = await import(pathToFileURL(path).href);
	return command.default || command; // potentially switch to nullish coalescing
}
