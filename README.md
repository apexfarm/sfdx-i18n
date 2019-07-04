sfdx-i18n
=========

Convinient commands for exporting importing text and translation metadata

[![Version](https://img.shields.io/npm/v/sfdx-i18n.svg)](https://npmjs.org/package/sfdx-i18n)
[![CircleCI](https://circleci.com/gh/apexfarm/sfdx-i18n/tree/master.svg?style=shield)](https://circleci.com/gh/apexfarm/sfdx-i18n/tree/master)
[![Appveyor CI](https://ci.appveyor.com/api/projects/status/github/apexfarm/sfdx-i18n?branch=master&svg=true)](https://ci.appveyor.com/project/heroku/sfdx-i18n/branch/master)
[![Codecov](https://codecov.io/gh/apexfarm/sfdx-i18n/branch/master/graph/badge.svg)](https://codecov.io/gh/apexfarm/sfdx-i18n)
[![Greenkeeper](https://badges.greenkeeper.io/apexfarm/sfdx-i18n.svg)](https://greenkeeper.io/)
[![Known Vulnerabilities](https://snyk.io/test/github/apexfarm/sfdx-i18n/badge.svg)](https://snyk.io/test/github/apexfarm/sfdx-i18n)
[![Downloads/week](https://img.shields.io/npm/dw/sfdx-i18n.svg)](https://npmjs.org/package/sfdx-i18n)
[![License](https://img.shields.io/npm/l/sfdx-i18n.svg)](https://github.com/apexfarm/sfdx-i18n/blob/master/package.json)

<!-- toc -->
* [Debugging your plugin](#debugging-your-plugin)
<!-- tocstop -->
<!-- install -->
<!-- usage -->
```sh-session
$ npm install -g sfdx-i18n
$ sfdx COMMAND
running command...
$ sfdx (-v|--version|version)
sfdx-i18n/0.0.1-alpha.1 darwin-x64 node-v12.4.0
$ sfdx --help [COMMAND]
USAGE
  $ sfdx COMMAND
...
```
<!-- usagestop -->
<!-- commands -->
* [`sfdx i18n:object:retrieve [-o <array>] [-l <array>] [-d <directory>] [--label] [--description] [--helptext] [--picklist] [-v <string>] [-u <string>] [--apiversion <string>] [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]`](#sfdx-i18nobjectretrieve--o-array--l-array--d-directory---label---description---helptext---picklist--v-string--u-string---apiversion-string---json---loglevel-tracedebuginfowarnerrorfataltracedebuginfowarnerrorfatal)

## `sfdx i18n:object:retrieve [-o <array>] [-l <array>] [-d <directory>] [--label] [--description] [--helptext] [--picklist] [-v <string>] [-u <string>] [--apiversion <string>] [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]`

retrieve translations in .xlsx format

```
USAGE
  $ sfdx i18n:object:retrieve [-o <array>] [-l <array>] [-d <directory>] [--label] [--description] [--helptext] 
  [--picklist] [-v <string>] [-u <string>] [--apiversion <string>] [--json] [--loglevel 
  trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

OPTIONS
  -d, --outputdir=outputdir                                                         a directory to output the .xlsx
                                                                                    files

  -l, --locales=locales                                                             a list of supported locales

  -o, --objects=objects                                                             a list of sObject API names

  -u, --targetusername=targetusername                                               username or alias for the target
                                                                                    org; overrides default target org

  -v, --targetdevhubusername=targetdevhubusername                                   username or alias for the dev hub
                                                                                    org; overrides default dev hub org

  --apiversion=apiversion                                                           override the api version used for
                                                                                    api requests made by this command

  --description                                                                     require .xlsx file to include field
                                                                                    descriptions

  --helptext                                                                        require .xlsx file to include field
                                                                                    help texts

  --json                                                                            format output as json

  --label                                                                           require .xlsx file to include field
                                                                                    labels

  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)  [default: warn] logging level for
                                                                                    this command invocation

  --picklist                                                                        require .xlsx file to include
                                                                                    picklist values

EXAMPLES
  $ sfdx i18n:object:retrieve --objects Account,Contact --locales en_US,es_MX
    
  $ sfdx i18n:object:retrieve --objects Account,Contact --locales en_US,es_MX --label --description --helptext 
  --picklist
```

_See code: [src/commands/i18n/object/retrieve.ts](https://github.com/apexfarm/sfdx-i18n/blob/v0.0.1-alpha.1/src/commands/i18n/object/retrieve.ts)_
<!-- commandsstop -->
<!-- debugging-your-plugin -->
# Debugging your plugin
We recommend using the Visual Studio Code (VS Code) IDE for your plugin development. Included in the `.vscode` directory of this plugin is a `launch.json` config file, which allows you to attach a debugger to the node process when running your commands.

To debug the `hello:org` command: 
1. Start the inspector
  
If you linked your plugin to the sfdx cli, call your command with the `dev-suspend` switch: 
```sh-session
$ sfdx hello:org -u myOrg@example.com --dev-suspend
```
  
Alternatively, to call your command using the `bin/run` script, set the `NODE_OPTIONS` environment variable to `--inspect-brk` when starting the debugger:
```sh-session
$ NODE_OPTIONS=--inspect-brk bin/run hello:org -u myOrg@example.com
```

2. Set some breakpoints in your command code
3. Click on the Debug icon in the Activity Bar on the side of VS Code to open up the Debug view.
4. In the upper left hand corner of VS Code, verify that the "Attach to Remote" launch configuration has been chosen.
5. Hit the green play button to the left of the "Attach to Remote" launch configuration window. The debugger should now be suspended on the first line of the program. 
6. Hit the green play button at the top middle of VS Code (this play button will be to the right of the play button that you clicked in step #5).
<br><img src=".images/vscodeScreenshot.png" width="480" height="278"><br>
Congrats, you are debugging!
