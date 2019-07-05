import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError, Connection } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import * as path from 'path';
import * as XLSX from 'xlsx';
import {
  CustomObjectMetadataInfo,
  CustomObjectTranslationMetadataInfo
} from '../../../common/types';
import { MetadataInfo } from 'jsforce';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('sfdx-i18n', 'export');

export default class Org extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    `$ sfdx i18n:object:export --objects Account,Contact --targetusername your.username@email.com
    `,
    `$ sfdx i18n:object:export --objects Account,Contact --locales en_US,es_MX --directory ./path/to/folder/ --targetusername your.username@email.com
    `
  ];

  public static args = [];

  protected static flagsConfig = {
    objects: flags.array({char: 'o', description: messages.getMessage('objectsFlagDescription')}),
    locales: flags.array({char: 'l', description: messages.getMessage('localesFlagDescription')}),
    directory: flags.directory({char: 'd', description: messages.getMessage('directoryFlagDescription')})
  };

  protected static requiresUsername = true;
  protected static supportsDevhubUsername = true;
  protected static requiresProject = false;

  public async run(): Promise<AnyJson> {
    this.ux.startSpinner(messages.getMessage('startSpinnerDescription'));

    const { objects, locales, directory } = this.flags;
    const conn = this.org.getConnection();

    const result = await Promise.all([
      this.readObjectTranslations(conn, objects, locales),
      this.readObjectDefinitions(conn, objects)
    ])
    .then(([[sfLocales, objectTranslations], customObjects]) => {
      const translationMap = this.prepareTranslationMap(objectTranslations as CustomObjectTranslationMetadataInfo[]);
      return this.prepareResult(customObjects, translationMap, sfLocales);
    })
    .catch(error => {
      this.ux.stopSpinner();
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
    }), directory);

    this.ux.stopSpinner();
    return result;
  }

  private  writeExcel(result, directory) {
    const wb = XLSX.utils.book_new();

    result.forEach(({sheet, header, rows}) => {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(rows, { header }),
        sheet
      );
    });

    if (!directory) {
      directory = './';
    }

    XLSX.writeFile(wb, path.join(directory, 'i18n.xlsx'));
  }

  private async prepareResult(customObjects, translationMap, locales): Promise<AnyJson[]> {
    return customObjects.map(customObject => {
      const customFieldTranslations = [];
      const picklistTranslations = [];

      customObject.fields
        .filter(field => field.fullName.endsWith('__c'))
        .forEach(customField => {
          const fieldName = `${customObject.fullName}.${customField.fullName}`;
          const xlsFieldName = fieldName.endsWith('__c')
            ? fieldName.substring(0, fieldName.lastIndexOf('__c'))
            : fieldName;
          const { description, type } = customField;
          const translations = locales.map(locale => {
            return {
              locale,
              translation: translationMap[customObject.fullName][locale][fieldName]};
          });

          customFieldTranslations.push({
            component: 'CustomField',
            suffix: 'FieldLabel',
            fieldName: customField.fullName,
            key: `CustomField.${xlsFieldName}.FieldLabel`,
            label: customField.label,
            ...translations.reduce((state, {locale, translation}) => {
              state[locale] = !translation ?  null : translation.label;
              return state;
            }, {}),
            description
          });

          switch (type) {
            case 'MultiselectPicklist':
            case 'Picklist': {
              let picklistValues =
                customField.valueSet ?
                customField.valueSet.valueSetDefinition ?
                customField.valueSet.valueSetDefinition.value : null : null;
              if (!picklistValues) {
                break;
              }

              if (!Array.isArray(picklistValues)) {
                picklistValues = [picklistValues];
              }

              const picklistValueMap = this.preparePicklistMap(picklistValues, locales, translations);
              picklistValues.forEach(({fullName, label}) => {
                picklistTranslations.push({
                  component: 'PicklistValue',
                  suffix: fullName,
                  fieldName: customField.fullName,
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
                fieldName: customField.fullName,
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

  private prepareTranslationMap(objectTranslations: CustomObjectTranslationMetadataInfo[]) {
    return (objectTranslations)
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

  private async readObjectDefinitions(conn: Connection, objects: string[]) {
    return Promise.all(objects
      .reduce((state, objectName, index) => {
        if (index % 10 === 0) {
          state.push([]);
        }
        state[state.length - 1].push(objectName);
        return state;
      }, [])
      .map(each10object => conn.metadata.read('CustomObject', each10object))
    )
    .then((each10objects: CustomObjectMetadataInfo[][]) => {
      if (!Array.isArray(each10objects)) {
        each10objects = [each10objects];
      }

      return each10objects.reduce((state, each10Object) => {
        if (!Array.isArray(each10Object)) {
          each10Object = [each10Object];
        }
        return state.concat(each10Object);
      }, []);
    });
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

        return Promise.all(locales
          .map(locale => objects.map(objectName => `${objectName}-${locale}`))
          .reduce((state, translationNames) => state.concat(translationNames), [])
          .reduce((state, translationName, index) => {
            if (index % 10 === 0) {
              state.push([]);
            }
            state[state.length - 1].push(translationName);
            return state;
          }, [])
          .map(each10translations => conn.metadata.read('CustomObjectTranslation', each10translations))
        );
      })
      .then(each10translations => each10translations.reduce((state: MetadataInfo[], each10translation) => {
        if (Array.isArray(each10translation)) {
          return state.concat(each10translation);
        } else {
          state.push(each10translation);
          return state;
        }
      }, []))
      .then(objectTranslations => {
        if (!Array.isArray(objectTranslations)) {
          objectTranslations = [objectTranslations];
        }
        return [locales, objectTranslations];
      });
  }
}
