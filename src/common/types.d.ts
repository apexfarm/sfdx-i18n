import { MetadataInfo } from 'jsforce';

interface CustomObjectMetadataInfo extends MetadataInfo {
  fields: MetadataInfo[];
}

interface CustomObjectTranslationMetadataInfo extends MetadataInfo {
  fields: { name: string } | Array<{ name: string }>;
}
