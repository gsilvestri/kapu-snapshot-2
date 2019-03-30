const execSync = require('child_process').execSync;
const constants = require('./constants');
const readdirp = require('readdirp');
const {
    createLogger,
    format,
    transports
} = require('winston')
const {
    colorize,
    combine,
    timestamp,
    printf
} = format
const findRemoveSync = require('find-remove');

// Define your custom format with printf.
const loggerFormat = printf(info => {
    return `[${info.timestamp}] - ${info.level}: ${info.message}`
})

const logger = createLogger({
    level: 'info',
    format: combine(
        timestamp(),
        loggerFormat
    ),
    transports: [
        new transports.File({
            filename: 'snapshot_creation_error.log',
            level: 'error'
        }),
        new transports.File({
            filename: 'snapshot_creation_combined.log'
        })
    ]
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
// 
if (process.env.NODE_ENV !== 'production') {
    logger.add(new transports.Console({
        format: combine(
            timestamp(),
            colorize(),
            loggerFormat
        ),
    }));
}
var snapshotCommand = 'yarn create:xpx:mainnet';
var snapshotCommandOptions = {
    cwd: constants.XPX_NODE_FOLDER + '/packages/core-snapshots-cli',
    stdio: 'inherit'
};

function createSnapshot() {

    logger.info('Removing snapshots older than ' + constants.DELETE_OLDER_THAN_SECONDS + ' seconds');
    findRemoveSync(constants.XPX_SNAPSHOT_SOURCE + '/' + constants.XPX_NETWORK + '/', {
        dir: '*',
        file: '*.*',
        age: {
            seconds: constants.DELETE_OLDER_THAN_SECONDS
        }
    });
    var deleteCommand = 'find ' + constants.XPX_SNAPSHOT_DESTINATION + ' -name \"*\" -type f -mmin +' + constants.DELETE_OLDER_THAN_SECONDS / 60 + ' -delete';
    var deleteCommandOptions = {
        cwd: constants.XPX_SNAPSHOT_DESTINATION,
        stdio: 'inherit'
    };
    execSync(deleteCommand, deleteCommandOptions);

    logger.info('Start snapshot creation');
    execSync(snapshotCommand, snapshotCommandOptions);
    logger.info('Snapshot created SUCCESSFULLY');
    logger.info('Zip snapshot and copy to destination folder');

    var settings = {
        root: constants.XPX_SNAPSHOT_SOURCE + '/' + constants.XPX_NETWORK + '/',
        depth: 1,
        entryType: 'directories'
    };
    // In this example, this variable will store all the paths of the files and directories inside the providen path
    var allFilePaths = [];

    readdirp(settings,
        // This callback is executed everytime a file or directory is found inside the providen path
        function (fileInfo) {
            // Store the fullPath of the file/directory in our custom array 
            allFilePaths.push(
                fileInfo
            );
        },

        // This callback is executed once 
        function (err, res) {
            if (err) {
                throw err;
            }
            var ctime = 0;
            var lastSnapshot = null;
            for (var i = 0; i < allFilePaths.length; i++) {
                if (allFilePaths[i].stat) {
                    logger.debug('Ctime: ' + allFilePaths[i].stat.ctime);
                    if (allFilePaths[i].stat.ctime >= ctime) {
                        ctime = allFilePaths[i].stat.ctime;
                        lastSnapshot = allFilePaths[i];
                    }
                }
            }
            if (lastSnapshot) {
                logger.info('Last Snapshot: ' + lastSnapshot.fullPath);
                var zipCommand = 'tar -zcvf ' + lastSnapshot.name + '.tar.gz ' + lastSnapshot.name;
                var zipCommandOptions = {
                    cwd: lastSnapshot.fullParentDir,
                    stdio: 'inherit'
                };
                execSync(zipCommand, zipCommandOptions);
                var moveCommand = 'mv ' + lastSnapshot.name + '.tar.gz ' + constants.XPX_SNAPSHOT_DESTINATION + '/' + lastSnapshot.name + '.tar.gz';
                execSync(moveCommand, zipCommandOptions);
            }
            logger.info('End');
        }
    );
}

createSnapshot();
//var createSnapshotThread = setInterval(createSnapshot, constants.EXECUTE_EVERY_SECONDS * 1000);