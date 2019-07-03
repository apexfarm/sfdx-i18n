import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError, Connection } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { MetadataInfo } from 'jsforce';
import * as path from 'path';
import * as XLSX from 'xlsx';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('sfdx-i18n', 'retrieve');

interface CustomObjectMetadataInfo extends MetadataInfo {
  fields: MetadataInfo[];
}

interface CustomObjectTranslationMetadataInfo extends MetadataInfo {
  fields: { name: string } | Array<{ name: string }>;
}

export default class Org extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    `$ sfdx i18n:object:retrieve --objects Account,Contact --locales en_US,es_MX
    `,
    `$ sfdx i18n:object:retrieve --objects Account,Contact --locales en_US,es_MX --label --description --helptext --picklist
    `
  ];

  public static args = [];

  protected static flagsConfig = {
    objects: flags.array({char: 'o', description: messages.getMessage('objectsFlagDescription')}),
    locales: flags.array({char: 'l', description: messages.getMessage('localesFlagDescription')}),
    outputdir: flags.directory({char: 'd', description: messages.getMessage('outputdirFlagDescription')}),
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

  public async run(): Promise<AnyJson> {
    const { objects, locales, outputdir } = this.flags;

    const conn = this.org.getConnection();

    const result = await Promise.all([
      this.readObjectTranslations(conn, objects, locales),
      this.readObjectDefinitions(conn, objects)
    ])
    .then(([[sfLocales, objectTranslations], [customObjects, customFields]]) => {
      const translationMap = this.prepareTranslationMap(objectTranslations);
      const customFieldMap = this.prepareCustomFieldMap(customFields as AnyJson[], customObjects as AnyJson[]);
      return this.prepareResult(customObjects, customFieldMap, translationMap, sfLocales);
    })
    .catch(error => {
      console.log(error);
      throw new SfdxError(error);
    });

    if (!result || result.length <= 0) {
      throw new SfdxError(messages.getMessage('errorNoOrgResults', [this.org.getOrgId()]));
    }

    this.writeExcel((result as any).map(({sheet, header, rows}) => {
      return {
        sheet,
        header,
        rows: rows.map(row => {
          const newRow = { ...row };
          delete newRow.component;
          delete newRow.suffix;
          delete newRow.fieldName;
          return newRow;
        })
      };
    }), outputdir);

    return result;
  }

  private  writeExcel(result, outputdir) {
    const wb = XLSX.utils.book_new();

    result.forEach(({sheet, header, rows}) => {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(rows, { header }),
        sheet
      );
    });

    if (!outputdir) {
      outputdir = './';
    }

    XLSX.writeFile(wb, path.join(outputdir, 'i18n.xlsx'));
  }

  private async prepareResult(customObjects, customFieldMap, translationMap, locales): Promise<AnyJson[]> {
    return customObjects.map(customObject => {
      const customFieldTranslations = [];
      const picklistTranslations = [];

      customObject.fields
        .filter(field => field.fullName.endsWith('__c'))
        .forEach(field => {
          const fieldName = `${customObject.fullName}.${field.fullName}`;
          const customField = customFieldMap[customObject.fullName][fieldName];
          const { description, type } = customField;
          const translations = locales.map(locale => {
            return {
              locale,
              translation: translationMap[customObject.fullName][locale][fieldName]};
          });

          const xlsFieldName = fieldName.endsWith('__c')
            ? fieldName.substring(0, fieldName.lastIndexOf('__c'))
            : fieldName;

          customFieldTranslations.push({
            component: 'CustomField',
            suffix: 'FieldLabel',
            fieldName: field.fullName,
            key: `CustomField.${xlsFieldName}.FieldLabel`,
            label: customField.label,
            ...translations.reduce((state, {locale, translation}) => {
              state[locale] = !translation ?  null : translation.label;
              return state;
            }, {}),
            description
          });

          switch (type) {
            case 'Picklist': {
              const { picklistValues } = customField;
              if (!picklistValues) {
                break;
              }

              const picklistValueMap = this.preparePicklistMap(picklistValues, locales, translations);
              picklistValues.forEach(({fullName, label}) => {
                picklistTranslations.push({
                  component: 'PicklistValue',
                  suffix: fullName,
                  fieldName: field.fullName,
                  key: `PicklistValue.${xlsFieldName}.${label}`,
                  label,
                  ...picklistValueMap[label]
                });
              });
              break;
            }
            case 'Lookup': {
              customFieldTranslations.push({
                component: 'CustomField',
                suffix: 'RelatedListLabel',
                fieldName: field.fullName,
                key: `CustomField.${xlsFieldName}.RelatedListLabel`,
                label: customField.relationshipLabel,
                ...translations.reduce((state, {locale, translation}) => {
                  state[locale] = !translation ?  null :  translation.relationshipLabel;
                  return state;
                }, {})
              });
              break;
            }
          }
        });

      return {
        sheet: customObject.fullName,
        header: ['key', 'label', ...locales, 'description'],
        rows: customFieldTranslations.concat(picklistTranslations)
      };
    });
  }

  private preparePicklistMap(picklistValues, locales, translations) {
    const translationDict = translations.reduce((state, { locale, translation }) => {
      if (!state[locale]) {
        state[locale] = {};
      }

      if (translation && translation.picklistValues) {
        if (!Array.isArray(translation.picklistValues)) {
          translation.picklistValues = [translation.picklistValues];
        }
        translation.picklistValues.forEach(({ masterLabel, translation: picklistTranslation }) => {
          state[locale][masterLabel] = picklistTranslation;
        });
      }
      return state;
    }, {});

    return picklistValues.reduce((state, {fullName, label}) => {
      if (!state[label]) {
        state[label] = {};
      }
      locales.forEach((locale => {
        state[label][locale] = translationDict[locale] && translationDict[locale][label]
          ? translationDict[locale][label] : null;
      }));
      return state;
    }, {});
  }

  private prepareTranslationMap(objectTranslations: string[] | MetadataInfo[]) {
    return (objectTranslations as CustomObjectTranslationMetadataInfo[])
      .map(({ fullName, fields }) => {
        const objectName = fullName.substring(0, fullName.indexOf('-'));
        const lang = fullName.substring(fullName.indexOf('-') + 1);
        if (!Array.isArray(fields)) {
          fields = [fields];
        }
        return {
          objectName,
          lang,
          map: fields.reduce((state, field) => {
            state[`${objectName}.${field.name}`] = field;
            return state;
          }, {})
        };
      })
      .reduce((state, { objectName, lang, map }) => {
        if (!state[objectName]) {
          state[objectName] = {};
        }
        state[objectName][lang] = map;
        return state;
      }, {});
  }

  private prepareCustomFieldMap(customFields: any[], customObjects: any[]) {
    const customFieldMap = customFields.reduce((state, { fullName, label, type, description }) => {
      const objectName = fullName.substring(0, fullName.indexOf('.'));
      if (!state[objectName]) {
        state[objectName] = {};
      }
      state[objectName][fullName] = { fullName, label, type, description };
      return state;
    }, {});
    customObjects.forEach((customObject => {
      const objectName = customObject.fullName;
      customObject.fields
        .filter(field => field.type === 'Picklist' && field.valueSet)
        .forEach(field => {
          let picklistValues = [];
          if (field.valueSet && field.valueSet.valueSetDefinition) {
            const { value } = field.valueSet.valueSetDefinition;
            if (!Array.isArray(value)) {
              picklistValues = [value];
            } else {
              picklistValues = value;
            }
          }
          customFieldMap[objectName][`${objectName}.${field.fullName}`].picklistValues
            = picklistValues;
        });
    }));
    return customFieldMap;
  }

  private async readObjectDefinitions(conn: Connection, objects: string[]) {
    return conn.metadata.read('CustomObject', objects)
      .then(customObjects => {
        if (!Array.isArray(customObjects)) {
          customObjects = [customObjects];
        }
        return [customObjects, customObjects
          .map(customObject => {
            const { fullName: objectName, fields } = customObject as CustomObjectMetadataInfo;
            return fields.map(field => `${objectName}.${field.fullName}`);
          })
          .reduce((state, fieldNames) => state.concat(fieldNames), [])
          .reduce((state, fieldName, index) => {
            if (index % 10 === 0) {
              state.push([]);
            }
            state[state.length - 1].push(fieldName);
            return state;
          }, [])];
      })
      .then(([customObjects, customFields]) => Promise.all([
        customObjects,
        Promise.all(customFields.map(each10Field => conn.metadata.read('CustomField', each10Field)))
      ]))
      .then(([customObjects, customFields]) => [
        customObjects,
        customFields.reduce((state: MetadataInfo[], each10Field: MetadataInfo | MetadataInfo[]): MetadataInfo[] => {
          if (!Array.isArray(each10Field)) {
            each10Field = [each10Field];
          }
          return state.concat(each10Field);
        }, [])
      ]);
  }

  private async readObjectTranslations(conn: Connection, objects: string[], locales: string[]) {
    return conn.metadata.list([{type: 'Translations', folder: null}], '46.0')
      .then(translations => {
        if (!Array.isArray(translations)) {
          translations = [translations];
        }

        if (locales != null && locales.length > 0) {
          translations = translations.filter(({ fullName: locale }) => locales.includes(locale));
        }
        locales = translations.map(({ fullName: locale }) => locale);

        return locales
          .map(locale => objects.map(objectName => `${objectName}-${locale}`))
          .reduce((state, translationNames) => state.concat(translationNames), []);
      })
      .then(translationNames => conn.metadata.read('CustomObjectTranslation', translationNames))
      .then(objectTranslations => {
        if (!Array.isArray(objectTranslations)) {
          objectTranslations = [objectTranslations];
        }
        return [locales, objectTranslations];
      });
  }
}
