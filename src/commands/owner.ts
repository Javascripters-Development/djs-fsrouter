"use strict";

const { SUBCOMMAND, SUBCOMMAND_GROUP } = require("../enums");
const checkCommand = require("./check.function");

exports.command = {};
const ownerCmds = (exports.commands = {});
let _parentFolder;

/**
 * Loads owner comands.
 * @param {string} parentFolder The absolute path of the parent folder to owner commands.
 * @param {string} data Data about the command
 * @param {string} data.name The command name. Must be a subfolder under parentFolder. Default: "owner"
 * @param {string} data.description The command description. Default: "Execute an owner command"
 * @param {number|"0"} data.defaultMemberPermissions Default permissions required to execute the command. Default: "0"
 * @returns {object} the command object, ready to be registered.
 */
exports.load = (
	parentFolder,
	{
		name,
		description = "Execute an owner command",
		defaultMemberPermissions = "0",
	},
) => {
	if (!name) name = "owner";
	else if (!checkCommand.NAME_REGEX.test(name))
		throw new Error(
			`Owner subfolder must have a valid command name; got '${name}'`,
		);

	const folder = `${parentFolder}/${name}`;
	const ownerCmdFiles = require("fs")
		.readdirSync(folder)
		.filter((f) => f.endsWith(".js") && f[0] !== "#");
	if (!ownerCmdFiles) return false;

	for (const cmd of ownerCmdFiles.map((f) => f.slice(0, -3))) {
		const command = require(`${folder}/${cmd}`);
		if (!("type" in command)) command.type = SUBCOMMAND;
		else if (command.type !== SUBCOMMAND && command.type !== SUBCOMMAND_GROUP)
			throw new LoadError(
				cmd,
				`Owner commands can only have the SUBCOMMAND or SUBCOMMAND_GROUP type.`,
			);
		command.name = cmd;
		checkCommand(command);
		ownerCmds[cmd] = command;
	}

	_parentFolder = parentFolder;
	return Object.assign(exports.command, {
		name,
		description,
		defaultMemberPermissions,
		options: Object.values(ownerCmds),
		run: (inter) => ownerCmds[inter.options.getSubcommand()].run(inter),
	});
};

/**
 * Reloads all owner commands, using the same arguments as the first one.
 * @returns {object} The owner command object, ready te be re-registered.
 */
exports.reload = () => {
	const {
		load,
		command,
		command: { name },
	} = exports;
	if (!name)
		throw new Error(
			"Cannot reload owner commands unless they have already been loaded.",
		);

	const folder = `${_parentFolder}/${name}`;
	const files = require("fs").readdirSync(folder);
	for (const cmd in ownerCmds) {
		if (files.includes(cmd + ".js"))
			delete require.cache[require.resolve(`${folder}/${cmd}`)];
		else delete ownerCmds[cmd];
	}

	return load(_parentFolder, command);
};
