#!/usr/bin/env node

var minimist = require("minimist");
var glob = require("glob");
var lcovSourcemap = require("./index");
var path = require("path");

var args = minimist(process.argv.slice(2));
if (!args["lcov"] || !args["source-dir"] || !args["source-maps"]) {
	usage();
}

if (!isArray(args["source-maps"])) {
	args["source-maps"] = [args["source-maps"]];
}
var sourceMaps = Array.prototype.concat.apply([], args["source-maps"].map(function(dir) {
	return glob.sync(dir);
})).reduce(function(map, file) {
	map[file] = file;
	return map;
}, {});

lcovSourcemap(args["lcov"], sourceMaps, args["source-dir"]).then(function (lcov) {
    console.log(lcov);
});

function isArray(input) {
	return Object.prototype.toString.call(input) == "[object Array]";
}

function usage() {
	console.error("Usage: lcov-sourcemap --lcov <path/to/lcov-file> --source-dir <path/to/sources> --source-maps <glob/for/source-maps>");
	console.error("\t--source-maps could be specified multiple times");
	process.exit(1);
}
