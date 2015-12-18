var _ = require("lodash-node"),
	Promise = require("bluebird"),
	fs = Promise.promisifyAll(require("fs")),
	path = require("path"),
	lcovParse = Promise.promisify(require("lcov-parse")),
	sourcemap = require("source-map");

var File = require("./File");

module.exports = module.exports.getLcov = getLcov;
module.exports.writeLcov = writeLcov;

function getLcov(lcov, sourcemaps, sourceDir) {
	return getTransformedFiles(lcov, sourcemaps).then(function (files) {
		return getOutputLcov(files, sourceDir);
	});
};

function writeLcov(lcov, sourcemaps, sourceDir, outputFile) {
	return getLcov(lcov, sourcemaps, sourceDir).then(function (lcov) {
		return fs.writeFileAsync(outputFile, lcov);
	});
};

function getOutputLcov(files, sourceDir) {
	sourceDir = sourceDir || process.cwd();

	return Promise.all(_.map(files, function (file) {
		return new Promise(function (resolve) {
			fs.exists(path.resolve(sourceDir, file.path), function (exists) {
				if (!exists) {
					resolve(null);
					return;
				}
				resolve(file);
			});
		});
	})).then(function (files) {
		return _.filter(files);
	}).then(function (files) {
		var output = [];

		_.each(files, function (file) {
			output.push(file.toString());
		});

		return output.join("\n");
	});
}

function getTransformedFiles(lcov, sourcemaps) {
	return getData(lcov, sourcemaps).then(function (data) {
		return _.chain(data.lcov).map(function (lcov, key) {
			var sourcemap = data.sourcemap[key];
			if (!sourcemap) {
				throw new Error("Missing sourcemap: " + key);
			}
			return transformLcovMap(lcov, sourcemap);
		}).map(function (group) {
			return _.values(group);
		}).flatten().value();
	});
}

function transformLcovMap(lcov, sourcemap) {
	var sourceRootRegex = new RegExp("^" + sourcemap.sourceRoot.replace(/(\W)/g, "\\$1"));

	var files = {};

	var getFile = function (source) {
		var fn = source.source.replace(sourceRootRegex, "./");
		return files[fn] = files[fn] || new File(fn);
	};

	_.each(lcov.functions.details, function (func) {
		var source = sourcemap.originalPositionFor({
			line: func.line,
			column: 0,
			bias: sourcemap.constructor.LEAST_UPPER_BOUND
		});

		// Can't find it in source map, fuhgeddaboudit
		if (!source || !source.source) {
			return;
		}

		getFile(source).addFunction({
			name: func.name,
			line: source.line,
			hit: func.hit
		});
	});

	_.each(lcov.lines.details, function (line) {
		var source = sourcemap.originalPositionFor({
			line: line.line,
			column: 0,
			bias: sourcemap.constructor.LEAST_UPPER_BOUND
		});

		// Can't find it in source map, fuhgeddaboudit
		if (!source || !source.source) {
			return;
		}

		getFile(source).addLine({
			line: source.line,
			hit: line.hit
		});
	});

	_.each(lcov.branches.details, function (branch) {
		var source = sourcemap.originalPositionFor({
			line: branch.line,
			column: 0,
			bias: sourcemap.constructor.LEAST_UPPER_BOUND
		});

		// Can't find it in source map, fuhgeddaboudit
		if (!source || !source.source) {
			return;
		}

		getFile(source).addBranch({
			block: branch.block,
			line: source.line,
			branch: branch.branch,
			taken: branch.taken
		});
	});

	return files;
}

function getData(lcov, sourcemaps) {
	return Promise.props({
		lcov: getLcovData(lcov),
		sourcemap: getSourcemapsData(sourcemaps)
	});
}

function getSourcemapsData(sourcemaps) {
	if (!_.isObject(sourcemaps)) {
		sourcemaps = {
			map: sourcemaps
		};
	}

	return Promise.props(_.mapValues(sourcemaps, function (file) {
		return fs.readFileAsync(file).then(function (file) {
			return file.toString();
		}).then(function (content) {
			return new sourcemap.SourceMapConsumer(content);
		});
	}));
}

function getLcovData(lcov) {
	return lcovParse(lcov).then(function (data) {
		return _.chain(data).map(function (item) {
			var name = path.resolve(item.file);
			return [
				name,
				item
			];
		}).zipObject().value();
	});
}
