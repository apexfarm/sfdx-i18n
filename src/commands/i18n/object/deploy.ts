import { flags, SfdxCommand, SfdxResult } from '@salesforce/command';
import { Messages, SfdxError, Connection } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { MetadataInfo, SaveResult } from 'jsforce';
import * as path from 'path';
import * as XLSX from 'xlsx';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('sfdx-i18n', 'deploy');

export default class Org extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    `$ sfdx i18n:object:deploy --objects Account,Contact --locales en_US,es_MX
    `,
    `$ sfdx i18n:object:deploy --objects Account,Contact --locales en_US,es_MX --label --description --helptext --picklist
    `
  ];

  public static args = [];

  public static result: SfdxResult = {
    tableColumnData: {
      columns: [
        { key: 'fullName', label: 'Field Name' },
        { key: 'message', label: 'Error Message' }
      ]
    },
    display() {
      const { failure, success } = this.data as { failure, success };
      if (Array.isArray(failure) && failure.length) {
        this.ux.log('\n');
        this.ux.table(failure.map(({fullName, errors}) => ({
          fullName,
          message: Array.isArray(errors)
            ? errors.reduce((state, error) => {
              state += `${error.statusCode}: ${error.message}\n`;
              return state;
            }, '')
            : `${errors.statusCode}: ${errors.message}`
        })), this.tableColumnData);
      }
      this.ux.log(`\nSuccessfully deployed ${success} fields.\n`);
    }
};

  protected static flagsConfig = {
    objects: flags.array({char: 'o', description: messages.getMessage('objectsFlagDescription')}),
    locales: flags.array({char: 'l', description: messages.getMessage('localesFlagDescription')}),
    file: flags.directory({char: 'f', description: messages.getMessage('fileFlagDescription')}),
    label: flags.boolean({description: messages.getMessage('labelFlagDescription')}),
    description: flags.boolean({description: messages.getMessage('descriptionFlagDescription')}),
    helptext: flags.boolean({description: messages.getMessage('helptextFlagDescription')}),
    picklist: flags.boolean({description: messages.getMessage('picklistFlagDescription')})
  };

  // Comment this out if your command does not require an org username
  protected static requiresUsername = true;

  // Comment this out if your command does not support a hub org username
  protected static supportsDevhubUsername = true;

  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  protected static requiresProject = false;

  public async run(): Promise<{}> {
    const { objects, locales, file } = this.flags;

    const conn = this.org.getConnection();

    const results = await Promise.all([
      this.readObjectTranslations(conn, locales)
    ])
    .then(([sfLocales]) => this.readExcel(file, objects, locales))
    .then(sheets => sheets.map(({name, rows}) => rows
      .filter(({key}) => key.startsWith('CustomField'))
      .map(({key, label, description}) => {
        let fullName = key.substring(key.indexOf('.') + 1);
        fullName = fullName.substring(0, fullName.lastIndexOf('.'));
        fullName = `${fullName}__c`;
        let isLookup = key.substring(key.lastIndexOf('.') + 1) === 'RelatedListLabel';
        if (isLookup) {
          return {
            fullName,
            relationshipLabel: label
          };
        } else {
          return {
            fullName,
            label,
            description
          };
        }
      })
      .reduce((state, field) => {
        if (!state[field.fullName]) {
          state[field.fullName] = { ...field };
        } else {
          state[field.fullName] = { ...state[field.fullName], ...field };
        }
        return state;
      }, {})
    ))
    .then(fieldsByObject => fieldsByObject.reduce((state: [], fields: {}) => state.concat(Object.values(fields)), []))
    .then((fields: []) => {
      const each10fields = fields.reduce((state, field, index) => {
        if (index % 10 === 0) {
          state.push([]);
        }
        state[state.length - 1].push(field);
        return state;
      }, []);
      return each10fields;
    })
    .then(each10fields => Promise.all(each10fields.map(each10field =>
      Promise.all([each10field, conn.metadata.read('CustomField', each10field.map(({fullName}) => fullName))])
    )))
    .then(each10fields => Promise.all(each10fields.map(([each10field, customFields]) => {
      let each10fieldMap = each10field.reduce((state, field) => {
        state[field.fullName] = field;
        return state;
      }, {});

      if (!Array.isArray(customFields)) {
        customFields = [customFields];
      }

      const updatedCustomFields = customFields.map(field => {
        return { ...field, ...each10fieldMap[field.fullName] };
      });
      return conn.metadata.update('CustomField', updatedCustomFields);
    })))
    .then(each10results => each10results
      .reduce((state: SaveResult[], each10result): SaveResult[] => {
        if (!Array.isArray(each10result)) {
          each10result = [each10result];
        }
        return state.concat(each10result as SaveResult[]);
      }, []) as SaveResult[]
    )
    .catch(error => {
      console.log(error);
      throw new SfdxError(error);
    });

    const result = {
      success: results.filter(field => field.success).length,
      failure: results.filter(field => !field.success)
    };

    return result;
  }

  private readExcel(file, objects, locales) {
    const wb = XLSX.readFile(file);
    return objects
      .map(object => [object, wb.Sheets[object]])
      .filter(([name, ws]) => !!ws)
      .map(([name, ws]) => {
        const rows = XLSX.utils.sheet_to_json(ws);
        return { name, rows };
      });
  }

  private async readObjectTranslations(conn: Connection, locales: string[]) {
    return conn.metadata.list([{type: 'Translations', folder: null}], '46.0')
      .then(translations => {
        if (!Array.isArray(translations)) {
          translations = [translations];
        }

        if (locales != null && locales.length > 0) {
          translations = translations.filter(({ fullName: locale }) => locales.includes(locale));
        }
        return translations.map(({ fullName: locale }) => locale);
      });
  }
}
