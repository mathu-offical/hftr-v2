import { sql } from 'drizzle-orm';
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { brokerConnections } from './brokers';
import { companies, modules } from './companies';
import { userApiKeys, userResearchKeys } from './identity';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Persisted module↔verified service source bindings (D-090 / D-092).
 * Exactly one of broker_connection_id / user_api_key_id / user_research_key_id (DB CHECK).
 */
export const moduleServiceBindings = pgTable(
  'module_service_bindings',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id),
    /** Denormalized source discriminator for queries (matches XOR FKs). */
    sourceKind: text('source_kind', {
      enum: ['broker_connection', 'user_api_key', 'user_research_key'],
    }).notNull(),
    capability: text('capability').notNull(),
    brokerConnectionId: uuid('broker_connection_id').references(() => brokerConnections.id),
    userApiKeyId: uuid('user_api_key_id').references(() => userApiKeys.id),
    userResearchKeyId: uuid('user_research_key_id').references(() => userResearchKeys.id),
    status: text('status', { enum: ['bound', 'stale', 'missing', 'revoked'] })
      .notNull()
      .default('bound'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('module_service_bindings_broker_unique')
      .on(t.moduleId, t.capability, t.brokerConnectionId)
      .where(sql`${t.brokerConnectionId} is not null`),
    uniqueIndex('module_service_bindings_key_unique')
      .on(t.moduleId, t.capability, t.userApiKeyId)
      .where(sql`${t.userApiKeyId} is not null`),
    uniqueIndex('module_service_bindings_research_unique')
      .on(t.moduleId, t.capability, t.userResearchKeyId)
      .where(sql`${t.userResearchKeyId} is not null`),
    index('module_service_bindings_company_idx').on(t.companyId),
  ],
);
