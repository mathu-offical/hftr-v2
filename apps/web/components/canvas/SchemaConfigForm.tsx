'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MODULE_CONFIG_SCHEMAS, type ModuleType } from '@hftr/contracts';
import { z } from 'zod';
import { api } from '@/lib/client';

type FieldSpec = {
  path: string;
  label: string;
  optional: boolean;
  kind: 'string' | 'number' | 'boolean' | 'enum' | 'string_array';
  enumValues?: string[];
};

function humanizeFieldLabel(path: string): string {
  const segment = path.split('.').pop() ?? path;
  return segment
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function unwrapSchema(schema: z.ZodTypeAny): {
  schema: z.ZodTypeAny;
  optional: boolean;
  defaultValue?: unknown;
} {
  if (schema instanceof z.ZodOptional) {
    const inner = unwrapSchema(schema._def.innerType as z.ZodTypeAny);
    return { ...inner, optional: true };
  }
  if (schema instanceof z.ZodDefault) {
    const inner = unwrapSchema(schema._def.innerType as z.ZodTypeAny);
    return {
      ...inner,
      optional: true,
      defaultValue:
        typeof schema._def.defaultValue === 'function'
          ? schema._def.defaultValue()
          : schema._def.defaultValue,
    };
  }
  return { schema, optional: false };
}

function isOneLevelNumberRecord(schema: z.ZodObject<z.ZodRawShape>): boolean {
  const shape = schema.shape;
  return Object.values(shape).every((field) => {
    const { schema: inner } = unwrapSchema(field as z.ZodTypeAny);
    return inner instanceof z.ZodNumber;
  });
}

function enumValuesFromSchema(schema: z.ZodTypeAny): string[] | null {
  if (schema instanceof z.ZodEnum) {
    return [...schema.options];
  }
  if (schema instanceof z.ZodNativeEnum) {
    return Object.values(schema.enum).filter((value): value is string => typeof value === 'string');
  }
  return null;
}

function collectFields(
  schema: z.ZodTypeAny,
  prefix = '',
  fields: FieldSpec[] = [],
): FieldSpec[] {
  const { schema: base, optional } = unwrapSchema(schema);

  if (base instanceof z.ZodObject) {
    const shape = base.shape;
    for (const [key, rawField] of Object.entries(shape)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const { schema: fieldSchema, optional: fieldOptional } = unwrapSchema(
        rawField as z.ZodTypeAny,
      );

      if (fieldSchema instanceof z.ZodObject) {
        if (!prefix && isOneLevelNumberRecord(fieldSchema)) {
          for (const nestedKey of Object.keys(fieldSchema.shape)) {
            fields.push({
              path: `${path}.${nestedKey}`,
              label: `${humanizeFieldLabel(path)} · ${humanizeFieldLabel(nestedKey)}`,
              optional: fieldOptional,
              kind: 'number',
            });
          }
        }
        continue;
      }

      const enumValues = enumValuesFromSchema(fieldSchema);
      if (enumValues) {
        fields.push({
          path,
          label: humanizeFieldLabel(path),
          optional: fieldOptional || optional,
          kind: 'enum',
          enumValues,
        });
        continue;
      }

      if (fieldSchema instanceof z.ZodBoolean) {
        fields.push({
          path,
          label: humanizeFieldLabel(path),
          optional: fieldOptional || optional,
          kind: 'boolean',
        });
        continue;
      }

      if (fieldSchema instanceof z.ZodNumber) {
        fields.push({
          path,
          label: humanizeFieldLabel(path),
          optional: fieldOptional || optional,
          kind: 'number',
        });
        continue;
      }

      if (fieldSchema instanceof z.ZodString) {
        fields.push({
          path,
          label: humanizeFieldLabel(path),
          optional: fieldOptional || optional,
          kind: 'string',
        });
        continue;
      }

      if (fieldSchema instanceof z.ZodArray) {
        const { schema: elementSchema } = unwrapSchema(fieldSchema._def.type as z.ZodTypeAny);
        if (elementSchema instanceof z.ZodString) {
          fields.push({
            path,
            label: humanizeFieldLabel(path),
            optional: fieldOptional || optional,
            kind: 'string_array',
          });
        }
      }
    }
    return fields;
  }

  return fields;
}

function readPath(config: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = config;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function writePath(
  config: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split('.');
  if (parts.length === 1) {
    return { ...config, [parts[0]!]: value };
  }
  const [head, ...rest] = parts;
  const child =
    config[head!] && typeof config[head!] === 'object' && !Array.isArray(config[head!])
      ? (config[head!] as Record<string, unknown>)
      : {};
  return {
    ...config,
    [head!]: writePath(child, rest.join('.'), value),
  };
}

function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
): (...args: Args) => void {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  fnRef.current = fn;

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return useCallback(
    (...args: Args) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay],
  );
}

const inputClass =
  'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]';

export function SchemaConfigForm(props: {
  companyId: string;
  moduleId: string;
  moduleType: ModuleType;
  config: Record<string, unknown>;
  onPatched?: (config: Record<string, unknown>) => void;
}) {
  const schema = MODULE_CONFIG_SCHEMAS[props.moduleType];
  const fields = collectFields(schema);
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>(props.config);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalConfig(props.config);
    setMessage(null);
  }, [props.config, props.moduleId, props.moduleType]);

  const persistConfig = useCallback(
    async (nextConfig: Record<string, unknown>) => {
      setSaving(true);
      try {
        const { module } = await api<{ module: { config: Record<string, unknown> } }>(
          `/api/companies/${props.companyId}/modules/${props.moduleId}`,
          {
            method: 'PATCH',
            body: { config: nextConfig },
          },
        );
        props.onPatched?.(module.config);
        setMessage(null);
      } catch {
        setMessage('Config save failed.');
        setLocalConfig(props.config);
      } finally {
        setSaving(false);
      }
    },
    [props.companyId, props.moduleId, props.config, props.onPatched],
  );

  const debouncedPersist = useDebouncedCallback((next: Record<string, unknown>) => {
    void persistConfig(next);
  }, 450);

  function updateField(path: string, rawValue: unknown) {
    const next = writePath(localConfig, path, rawValue);
    setLocalConfig(next);
    debouncedPersist(next);
  }

  if (fields.length === 0) {
    return (
      <div className="space-y-2 border-t border-[var(--color-line)] pt-4">
        <span className="text-xs text-[var(--color-ink-dim)]">Configuration</span>
        <p className="text-[11px] text-[var(--color-ink-faint)]">No editable config fields for this module.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--color-ink-dim)]">Configuration</span>
        {saving && <span className="text-[10px] text-[var(--color-ink-faint)]">Saving…</span>}
      </div>

      {fields.map((field) => {
        const raw = readPath(localConfig, field.path);
        const optionalSuffix = field.optional ? ' (optional)' : '';

        if (field.kind === 'boolean') {
          return (
            <label
              key={field.path}
              className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-2 text-[11px] text-[var(--color-ink-dim)]"
            >
              <span>
                {field.label}
                {optionalSuffix}
              </span>
              <input
                type="checkbox"
                checked={Boolean(raw)}
                onChange={(event) => updateField(field.path, event.target.checked)}
                aria-label={field.label}
                className="h-3.5 w-3.5 accent-[var(--color-accent)]"
              />
            </label>
          );
        }

        if (field.kind === 'enum' && field.enumValues) {
          return (
            <label key={field.path} className="block space-y-1">
              <span className="text-xs text-[var(--color-ink-dim)]">
                {field.label}
                {optionalSuffix}
              </span>
              <select
                value={typeof raw === 'string' ? raw : ''}
                onChange={(event) => updateField(field.path, event.target.value)}
                className={inputClass}
                aria-label={field.label}
              >
                {field.optional && <option value="">—</option>}
                {field.enumValues.map((value) => (
                  <option key={value} value={value}>
                    {humanizeFieldLabel(value)}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (field.kind === 'number') {
          return (
            <label key={field.path} className="block space-y-1">
              <span className="text-xs text-[var(--color-ink-dim)]">
                {field.label}
                {optionalSuffix}
              </span>
              <input
                type="number"
                value={typeof raw === 'number' ? raw : ''}
                onChange={(event) => {
                  const next = event.target.value;
                  updateField(field.path, next === '' ? undefined : Number(next));
                }}
                className={inputClass}
                aria-label={field.label}
              />
            </label>
          );
        }

        if (field.kind === 'string_array') {
          const text = Array.isArray(raw) ? raw.filter((entry) => typeof entry === 'string').join(', ') : '';
          return (
            <label key={field.path} className="block space-y-1">
              <span className="text-xs text-[var(--color-ink-dim)]">
                {field.label}
                {optionalSuffix}
              </span>
              <textarea
                value={text}
                rows={2}
                onChange={(event) => {
                  const list = event.target.value
                    .split(/[\n,]+/)
                    .map((entry) => entry.trim())
                    .filter(Boolean);
                  updateField(field.path, list);
                }}
                placeholder="Comma or newline separated"
                className={`${inputClass} resize-y`}
                aria-label={field.label}
              />
            </label>
          );
        }

        return (
          <label key={field.path} className="block space-y-1">
            <span className="text-xs text-[var(--color-ink-dim)]">
              {field.label}
              {optionalSuffix}
            </span>
            <input
              type="text"
              value={typeof raw === 'string' ? raw : ''}
              onChange={(event) => updateField(field.path, event.target.value)}
              className={inputClass}
              aria-label={field.label}
            />
          </label>
        );
      })}

      {message && <p className="text-xs text-[var(--color-block)]">{message}</p>}
    </div>
  );
}
