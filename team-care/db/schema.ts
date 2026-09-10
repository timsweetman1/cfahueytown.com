import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const requests=sqliteTable('care_requests',{
 id:text('id').primaryKey(),created:text('created').notNull(),updated:text('updated').notNull(),name:text('name').notNull(),contact:text('contact').notNull(),topic:text('topic').notNull(),timing:text('timing').notNull(),details:text('details').notNull(),status:text('status').notNull().default('new'),owner:text('owner').notNull().default(''),revision:integer('revision').notNull().default(0),emailState:text('email_state').notNull().default('pending'),emailId:text('email_id'),emailTo:text('email_to').notNull(),isTest:integer('is_test').notNull().default(0)
});
export const audit=sqliteTable('care_audit',{id:text('id').primaryKey(),requestId:text('request_id').notNull(),at:text('at').notNull(),actor:text('actor').notNull(),action:text('action').notNull()});
export const usage=sqliteTable('care_usage',{day:text('day').notNull(),page:text('page').notNull(),views:integer('views').notNull().default(0)},t=>[primaryKey({columns:[t.day,t.page]})]);

export const aiBudget=sqliteTable('care_ai_budget',{day:text('day').primaryKey(),calls:integer('calls').notNull().default(0)});
