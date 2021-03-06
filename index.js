"use strict";

const _ = require('lodash');
const csv = require('csv');
const multipipe = require('multipipe');
const stream = require('stream');

const _durationPattern = /^duration: (\d+\.\d+)\s*ms\s+plan:\s*([\s\S]*)$/;
const _textPattern = /^Query Text:\s*([\s\S]*)$/;
const _dateFields = ['session_start_time', 'log_time'];
const _numericFields = ['process_id', 'session_line_num'];

class PostgresCSVLog extends stream.Transform {
  constructor(options) {
    super({
      allowHalfOpen: false,
      readableObjectMode: true,
      writableObjectMode: true
    });
  }

  _transform(record, encoding, callback) {
    for (const field of _dateFields) {
      record[field] = new Date(record[field]);
    }

    for (const field of _numericFields) {
      record[field] = +record[field];
    }

    // Attempt to parse log_min_duration_statement lines.
    if (record.sql_state_code === '00000') {
      const match = record.message.match(_durationPattern);
      if (_.size(match)) {
        record.duration = +match[1];
        const textMatch = match[2].match(_textPattern);
        if (_.size(textMatch)) {
          record.query = textMatch[1];
        }
        else {
          try {
            record.plan = JSON.parse(match[2]);
            record.query = record.plan['Query Text'];
          }
          catch (e) {
            // If the query/plan is not in text format or JSON format, we just
            // ignore it here since there isn't much else we can do.
          }
        }
      }
    }

    this.push(record);
    setImmediate(callback);
  }
}

module.exports = (options) => {
  const csvParser = csv.parse({
    columns: [
      'log_time',
      'user_name',
      'database_name',
      'process_id',
      'connection_from',
      'session_id',
      'session_line_num',
      'command_tag',
      'session_start_time',
      'virtual_transaction_id',
      'transaction_id',
      'error_severity',
      'sql_state_code',
      'message',
      'detail',
      'hint',
      'internal_query',
      'internal_query_pos',
      'context',
      'query',
      'query_pos',
      'location',
      'application_name',
    ],
  });
  const logParser = new PostgresCSVLog(options);
  return multipipe(csvParser, logParser);
};
