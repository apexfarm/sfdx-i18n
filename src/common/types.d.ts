import { MetadataInfo } from 'jsforce';

interface CustomObjectMetadataInfo extends MetadataInfo {
  fields: CustomFieldMetadataInfo[];
}

interface CustomFieldMetadataInfo extends MetadataInfo {
  label?: string;
  relationshipLabel?: string;
  description?: string;
}

interface CustomObjectTranslationMetadataInfo extends MetadataInfo {
  fields: { name: string } | Array<{ name: string }>;
}
