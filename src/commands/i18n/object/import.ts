import { flags, SfdxCommand, SfdxResult } from '@salesforce/command';
import { Messages, SfdxError, Connection } from '@salesforce/core';
import { SaveResult } from 'jsforce';
import * as XLSX from 'xlsx';
import { AnyJson } from '@salesforce/ts-types';
import { CustomFieldMetadataInfo } from '../../../common/types';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('sfdx-i18n', 'import');

export default class Org extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    `$ sfdx i18n:object:import --file ./path/to/i18n.xlsx --targetusername your@email.com
    `,
    `$ sfdx i18n:object:import --file ./path/to/i18n.xlsx --targetusername your@email.com --objects Account,Contact --locales en_US,es_MX
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
      if (failure.length) {
        this.ux.log(`\nFailed to import ${failure.length} fields:\n`);
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
      this.ux.log(`\nSuccessfully imported ${success.length} fields.\n`);
    }
  };

  protected static flagsConfig = {
    objects: flags.array({char: 'o', description: messages.getMessage('objectsFlagDescription')}),
    locales: flags.array({char: 'l', description: messages.getMessage('localesFlagDescription')}),
    file: flags.directory({char: 'f', description: messages.getMessage('fileFlagDescription')})
  };

  protected static requiresUsername = true;
  protected static supportsDevhubUsername = true;
  protected static requiresProject = false;

  public async run(): Promise<{}> {
    this.ux.startSpinner(messages.getMessage('startSpinnerDescription'));

    const conn = this.org.getConnection();
    const wb = XLSX.readFile(this.flags.file);

    const locales = await this.verifyLocales(conn, this.flags.locales);
    const objects = await this.verifyObjects(conn, this.flags.objects, wb);
    const sheets = this.parseExcel(wb, objects, locales);
    const fields: CustomFieldMetadataInfo[] = this.parseFields(sheets);

    const results = await this.importFields(conn, fields);
    await this.rerunFailedImports(conn, fields, results);

    const result = {
      success: results.filter(field => field.success),
      failure: results.filter(field => !field.success)
    };

    this.ux.stopSpinner();
    return result;
  }

  private async rerunFailedImports(conn: Connection, fields: CustomFieldMetadataInfo[], results: SaveResult[]) {
    const unknownExceptions = this.findUnknownExceptions(results);
    const rerunMap = unknownExceptions.reduce((state, result) => {
      state[result.fullName] = true;
      return state;
    }, {});

    if (unknownExceptions.length) {
      const rerunResults = await this.importFields(conn, fields.filter(field => rerunMap[field.fullName]) as []);
      const rerunSuccessResultMap = rerunResults
        .filter(result => result.success)
        .reduce((state, result) => {
          state[result.fullName] = result;
          return state;
        }, {});

      if (Object.keys(rerunSuccessResultMap).length) {
        results.map(result => result)
          .forEach((result, index) => {
            if (rerunSuccessResultMap[result.fullName]) {
              results[index] = rerunSuccessResultMap[result.fullName];
            }
          });
      }
    }
  }

  private findUnknownExceptions(results: SaveResult[]) {
    return results
      .filter(({ success }) => !success)
      .filter((result: unknown) => {
        const errors = (result as {errors}).errors;
        return Array.isArray(errors)
          ? errors.find(error => error.statusCode === 'UNKNOWN_EXCEPTION')
          : errors.statusCode === 'UNKNOWN_EXCEPTION';
      });
  }

  private async importFields(conn: Connection, fields: CustomFieldMetadataInfo[]) {
    return await Promise.resolve(fields.reduce((state, field, index) => {
      if (index % 10 === 0) {
        state.push([]);
      }
      state[state.length - 1].push(field);
      return state;
    }, []))
      .then(each10fields => Promise.all(each10fields.map(each10field => Promise.all([each10field, conn.metadata.read('CustomField', each10field.map(({ fullName }) => fullName))]))))
      .then(each10fields => Promise.all(each10fields.map(([each10field, customFields]) => {
        const each10fieldMap = each10field.reduce((state, field) => {
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
        // return updatedCustomFields;
      })))
      .then(each10results => each10results
        .reduce((state: SaveResult[], each10result): SaveResult[] => {
          if (!Array.isArray(each10result)) {
            each10result = [each10result];
          }
          return state.concat(each10result as SaveResult[]);
        }, []) as SaveResult[])
      .catch(error => {
        this.ux.stopSpinner();
        console.log(error);
        throw new SfdxError(error);
      });
  }

  private parseFields(sheets: [{name, rows}]) {
    const fields = sheets.map(({ rows }) => rows
      .filter(({ key }) => key.startsWith('CustomField'))
      .map(({ key, label, description }) => {
        let fullName = key.substring(key.indexOf('.') + 1);
        fullName = fullName.substring(0, fullName.lastIndexOf('.'));
        fullName = `${fullName}__c`;
        const field: CustomFieldMetadataInfo = { fullName };

        switch (key.substring(key.lastIndexOf('.') + 1)) {
          case 'RelatedListLabel':
            if (label) field.relationshipLabel = label;
            break;
          case 'FieldLabel':
            if (label) field.label = label;
            if (description) field.description = description;
            break;
        }
        return field;
      })
      .reduce((state, field) => {
        if (!state[field.fullName]) {
          state[field.fullName] = { ...field };
        } else {
          state[field.fullName] = { ...state[field.fullName], ...field };
        }
        return state;
      }, {}))
      .reduce((state: [], fieldMap: {}) => state.concat(Object.values(fieldMap)), []);
    return fields;
  }

  private parseExcel(wb, objects, locales) {
    return objects
      .map(object => [object, wb.Sheets[object]])
      .filter(([ws]) => !!ws)
      .map(([name, ws]) => {
        const rows = XLSX.utils.sheet_to_json(ws).map(({key, label, description, ...translation}) => {
          const row: AnyJson = { key, label };
          if (description) row.description = description;
          locales.forEach(locale => {
            if (translation[locale]) row[locale] = translation[locale];
          });
          return row;
        });
        return { name, rows };
      });
  }

  private async verifyObjects(conn: Connection, objects: string[], wb: XLSX.WorkBook) {
    if (!objects) {
      objects = wb.SheetNames.map(sheetName => sheetName);
    }
    return objects;
  }

  private async verifyLocales(conn: Connection, locales: string[]) {
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
