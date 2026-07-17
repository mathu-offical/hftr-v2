import { describe, expect, it } from 'vitest';
import { jsonSchemaForRef, SCHEMA_REFS } from './index';

describe('jsonSchemaForRef', () => {
  it('returns schemas for all registered refs', () => {
    for (const ref of Object.values(SCHEMA_REFS)) {
      const schema = jsonSchemaForRef(ref);
      expect(schema, `missing json schema for ${ref}`).toBeDefined();
      expect(schema?.type).toBe('object');
    }
  });

  it('returns undefined for unknown refs', () => {
    expect(jsonSchemaForRef('unknown.v99')).toBeUndefined();
  });
});
