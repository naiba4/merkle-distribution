#!/usr/bin/env node

const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');
const { assert } = require('console');
const qrdrop = require('./gen_qr_lib.js');

const commander = require('commander');
const { exit } = require('process');
const program = new commander.Command();

// Example usage: node ./src/gen_qr_drop_cmd.js -gqlcv 28 -a 10,20,30,40,50 -n 140,140,210,140,70
// Example usage: node ./src/gen_qr_drop_cmd.js -gqlv 28 -a 10,20,30,40,50 -n 140,140,210,140,70
// Example usage: node ./src/gen_qr_drop_cmd.js -x -u "https://app.1inch.io/#/1/qr?d=IgA..." -r "0x347b0605206ea9851b1172ad9c2a935f"
// Example usage: node ./src/gen_qr_drop_cmd.js -c
program
    // generation mode
    .option('-v, --version <version>', 'deployment instance version', false)
    .option('-g, --gencodes', 'generate codes mode', false)
    .option('-q, --qrs', 'generate qr: ', false)
    .option('-l, --links', 'generate links: ', false)
    .option('-n, --numbers <numbers>', 'codes to generate')
    .option('-a, --amounts <amounts>', 'amounts to generate')
    .option('-t, --testcodes <codes>', 'test codes', '10,1')
    .option('-s, --nodeploy', 'test run, ignores version', false)
    .option('-c, --cleanup', 'cleanup qr directories before codes generation', false)
    // verification mode
    .option('-x, --validate', 'validation mode', false)
    .option('-u, --url <url>', 'qr url')
    .option('-r, --root <root>', 'merkle root')
    // cleanup mode
    .option('-w, --wipe', 'clean up qr directories', false)
    // general parameters generation and validation
    .option('-b, --chainid <chainid>', 'chain id', '1');

program.parse(process.argv);

const options = program.opts();
const VERSION = Number(options.version);
const flagGenerateCodes = options.gencodes;
const flagSaveQr = options.qrs;
const flagSaveLink = options.links;
const COUNTS = options.numbers === undefined ? [] : options.numbers.split(',').map(x => BigInt(x));
const AMOUNTS = options.amounts === undefined ? [] : options.amounts.split(',').map(x => BigInt(x));
const testCode = options.testcodes.split(',').map(x => BigInt(x));
const flagNoDeploy = options.nodeploy;
const flagCleanup = options.cleanup;
const flagValidateOnly = options.validate;
const validateUrl = options.url;
const validateRoot = options.root;
const flagWipe = options.wipe;
const chainId = Number(options.chainid);

validateArgs();

if (flagGenerateCodes) {
    const settings = qrdrop.createNewDropSettings(flagSaveQr, flagSaveLink, COUNTS, AMOUNTS, VERSION, chainId, flagNoDeploy);

    if (!flagNoDeploy) {
        validateVersion(settings.version, settings.fileLatest);
    }

    if (flagCleanup) {
        cleanDir(settings.pathTestQr);
        cleanDir(settings.pathQr);
    }

    COUNTS.unshift(testCode[0]);
    AMOUNTS.unshift(testCode[1]);
    AMOUNTS.forEach((element, index) => { AMOUNTS[index] = ethers.parseEther(element.toString()); });

    qrdrop.generateCodes(settings);
}

if (flagValidateOnly) {
    const settings = qrdrop.createNewDropSettings(false, false, null, null, null, chainId, true);
    assert(qrdrop.verifyLink(validateUrl, validateRoot, settings.prefix));
}

if (flagWipe) {
    const settings = qrdrop.createNewDropSettings();
    cleanDir(settings.pathTestQr);
    cleanDir(settings.pathQr);
}

function validateArgs () {
    // Validate input
    if (Number(flagGenerateCodes) + Number(flagValidateOnly) + Number(flagWipe) !== 1) {
        console.error('please specify mode, either "generate codes" or "validate code" or "cleanup": -g or -x or -c, respectively');
        exit(1);
    }

    // Validate generation mode arguments
    if (flagGenerateCodes) {
        // check version is an integer
        if (isNaN(VERSION)) {
            console.error('option \'-v, --version <version>\' is required to be an integer above zero');
            exit(1);
        }

        if (isNotIntegerAboveZero(chainId)) {
            console.error('option \'-b, --chainid <chainid>\' is required to be an integer above zero');
            exit(1);
        }

        // check counts and amounts have the same length
        if (COUNTS.length !== AMOUNTS.length) {
            console.error('counts and amounts should have the same length');
            exit(1);
        }

        // check there are elements in th array
        if (COUNTS.length === 0 || AMOUNTS.length === 0) {
            console.error('counts and amounts should contain at least one element');
            exit(1);
        }

        // check non-integer elements in the array
        if (COUNTS.some(isNotIntegerAboveZero) || AMOUNTS.some(isNotIntegerAboveZero)) {
            console.error('counts and amounts should contain only integers above zero');
            exit(1);
        }

        if (testCode.some(isNotIntegerAboveZero) || testCode.length !== 2) {
            console.error('test codes should contain exactly two integers above zero.\nan example for 10 test codes with ether(\'1\') amount: -t 10,1');
            exit(1);
        }
    }

    if (flagValidateOnly) {
        if (!validateUrl || !validateRoot) {
            console.error('please specify url and root for validation: -u and -r, respectively');
            exit(1);
        }
    }
}

function isNotIntegerAboveZero (value) {
    return !(value > 0);
}

function validateVersion (version, latestFile) {
    const latestVersion = getLatestVersion(latestFile);
    if (version <= latestVersion) {
        console.error('version should be greater than ' + latestVersion.toString());
        exit(1);
    }
}

function getLatestVersion (latestFile) {
    if (!fs.existsSync(latestFile)) {
        return 0;
    }

    const latestVersion = Number(fs.readFileSync(latestFile));
    if (isNaN(latestVersion) || latestVersion < 0) {
        console.log('WARNING! version file is corrupted');
        exit(1);
    }

    return latestVersion;
}

function cleanDir (directoryPath) {
    // Check if the directory exists and it's a directory.
    if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
        throw new Error(`Not a valid directory: ${directoryPath}`);
    }

    const files = fs.readdirSync(directoryPath);
    for (const file of files) {
        const filePath = path.join(directoryPath, file);
        fs.unlinkSync(filePath);
    }

    console.log(`Directory cleaned ${directoryPath}`);
}
