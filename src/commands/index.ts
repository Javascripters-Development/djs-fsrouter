"use strict";

/** Information expected from each command file:
 * description
 * run
 ** Optional:
 * global
 * options
 * autocomplete
 * defaultMemberPermissions
 */

const { readdirSync, existsSync } = require("fs");
var skipDebug = true;
var defaultManager, root, middleware, foldersAreGroups;

const checkCommand = require("./check.function");
const { LoadError } = checkCommand;
const { SUBCOMMAND, SUBCOMMAND_GROUP } = require("../enums");

const commands = (exports.commands = {});
const specialFolders = (exports.specialFolders = []);
exports.load = load;
exports.reload = reload;

exports.DEFAULT_DM_PERMISSION = false;

Object.defineProperty(commands, "$reload", { value: reload });

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
exports.init = (
	client,
	folder,
	{
		debug = false,
		allAsGuild = null,
		autoSubCommands,
		middleware: _middleware,
	},
) => {
	skipDebug = !debug;
	root = folder;
	middleware = _middleware;
	foldersAreGroups = autoSubCommands;
	const { commands: commandManager } = allAsGuild || client.application;
	defaultManager = commandManager;
	return loadFolder(folder, commandManager);
};

function loadFolder(path, commandManager) {
	const subfolder = path.substring(root.length + 1);

	for (const file of readdirSync(path, { withFileTypes: true })) {
		const { name } = file;
		if (
			(name[0] === "#" && (name !== "#debug" || skipDebug)) ||
			specialFolders.includes(name)
		)
			continue;

		if (name.endsWith(".js") && file.isFile()) load(name, subfolder);
		else if (file.isDirectory()) {
			if (foldersAreGroups && name !== "#debug") createCommandGroup(name);
			else loadFolder(`${path}/${name}`);
		}
	}

	if (commandManager) return commandManager.set(Object.values(commands));
}

function load(name, subfolder = "", reloadIfExists = false) {
	if (typeof name !== "string") throw new TypeError("'name' must be a string");

	if (name.endsWith(".js")) name = name.slice(0, -3);

	const file = `${root}/${subfolder}${subfolder ? "/" : ""}${name}.js`;

	if (commands[name]) {
		if (commands[name].module !== subfolder)
			throw new LoadError(
				name,
				`Can't load command ${name} of subfolder "${subfolder}", it already exists in module "${commands[name].module}"`,
			);

		if (reloadIfExists) delete require.cache[require.resolve(file)];
		else return commands[name];
	}

	const command = require(file);
	command.module = subfolder;
	middleware?.(name, command);
	command.name = name;
	if (!command.options) command.options = []; // So we can remove options
	if (!("dmPermission" in command))
		command.dmPermission = exports.DEFAULT_DM_PERMISSION;

	checkCommand(command);
	return (commands[name] = command);
}

export function reload(cmdName, subfolder = "", cmdManager = defaultManager) {
	let cmd;
	if (foldersAreGroups && !existsSync(`${root}/${subfolder}/${cmdName}.js`)) {
		uncacheCommandFolder(cmdName);
		cmd = createCommandGroup(cmdName);
	} else cmd = load(cmdName, subfolder, true);
	return (
		cmdManager.cache.find(({ name }) => name === cmdName)?.edit(cmd) ||
		cmdManager.create(cmd)
	);
}

function createCommandGroup(cmdName) {
	const path = `${root}/${cmdName}`;
	const cmd = existsSync(`${path}/#info.js`)
		? require(`${path}/#info.js`)
		: { description: `/${cmdName}` };
	const options = [];
	const subcommands = {};
	const subcommandGroups = {};
	Object.assign(cmd, {
		name: cmdName,
		options,
		subcommands,
		subcommandGroups,
		run: runCommandGroup,
	});

	for (const file of readdirSync(path, { withFileTypes: true })) {
		let { name } = file;
		if (name[0] === "#") continue;

		if (file.isDirectory()) options.push(createSubCommandGroup(cmdName, name));
		else if (name.endsWith(".js")) {
			name = name.slice(0, -3);
			const subCmd = Object.assign(require(`${path}/${name}.js`), {
				name,
				type: SUBCOMMAND,
			});
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
	commands[cmdName] = cmd;
	return cmd;
}

function createSubCommandGroup(parent, groupName) {
	const path = `${root}/${parent}/${groupName}`;
	if (existsSync(`${path}/#info.js`))
		throw new LoadError(
			parent,
			`Subfolder ${groupName} is missing a #info.js file.`,
		);

	const group = existsSync(`${path}/#info.js`)
		? require(`${path}/#info.js`)
		: { description: `/${parent} ${groupName}` };
	const options = [];
	const subcommands = {};
	Object.assign(group, {
		name: groupName,
		type: SUBCOMMAND_GROUP,
		options,
		subcommands,
	});

	for (const file of readdirSync(path, { withFileTypes: true })) {
		let { name } = file;
		if (name[0] === "#") continue;

		if (file.isDirectory())
			throw new LoadError(
				parent,
				`Cannot have a subcommand group inside another subcommand group (in '${groupName}')`,
			);

		if (name.endsWith(".js")) {
			name = name.slice(0, -3);
			const subCmd = Object.assign(require(`${path}/${name}.js`), {
				name,
				type: SUBCOMMAND,
			});
			if (typeof subCmd.run !== "function")
				throw new LoadError(
					name,
					`Subcommand ${groupName}/${name} is missing a 'run' function.`,
				);

			subcommands[name] = subCmd;
			options.push(subCmd);
		}
	}

	return group;
}

function runCommandGroup(interaction) {
	const { options } = interactions;
	const group = options.getSubcommandGroup();
	const subcmd = options.getSubcommand();
	let subcommands;
	if (group) {
		if (group in this.subcommandGroups)
			subcommands = this.subcommandGroups.subcommands;
		else
			return console.error(
				`Received unknown subcommand group: '/${this.name} ${group}'`,
			);
	} else subcommands = this.subcommands;

	if (subcmd in subcommands) subcommands[subcmd].run(inter);
	else
		console.error(
			`Received unknown subcommand: '/${this.name} ${group || ""} ${subcmd}'`,
		);
}

function uncacheCommandFolder(folder) {
	const path = `${root}/${folder}`;
	if (existsSync(`${path}/#info.js`))
		delete require.cache[require.resolve(`${path}/#info.js`)];

	for (const file of readdirSync(path, { withFileTypes: true })) {
		let { name } = file;
		if (name[0] === "#") continue;

		if (file.isDirectory()) uncacheCommandFolder(`${folder}/${name}`);
		else if (name.endsWith(".js"))
			delete require.cache[require.resolve(`${path}/${name}`)];
	}
}
