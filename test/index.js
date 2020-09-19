////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// WhatDB tests.
//
// Copyright ⓒ 2020 Aral Balkan. Licensed under AGPLv3 or later.
// Shared with ♥ by the Small Technology Foundation.
//
// Like this? Fund us!
// https://small-tech.org/fund-us
//
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

process.env['QUIET'] = true

const test = require('tape')

const fs = require('fs-extra')
const path = require('path')

const WhatDB = require('..')

function loadTable (databaseName, tableName) {
  const tablePath = path.join(__dirname, databaseName, `${tableName}.json`)
  return fs.readFileSync(tablePath, 'utf-8')
}

const databasePath = path.join(__dirname, 'db')


test('basic persistence', t => {
  // Ensure database does not exist.
  fs.removeSync(databasePath)

  //
  // Database creation.
  //

  const people = [
    {"name":"aral","age":44},
    {"name":"laura","age":34}
  ]

  const db = new WhatDB(databasePath)

  t.ok(fs.existsSync(databasePath), 'database is created')

  //
  // Table creation.
  //

  db.people = people

  t.doesNotEqual(db.people, people, 'proxy and object are different')
  t.strictEquals(JSON.stringify(db.people), JSON.stringify(people), 'original object and data in table are same')

  const expectedTablePath = path.join(databasePath, 'people.json')
  t.ok(fs.existsSync(expectedTablePath), 'table is created')

  const createdTable = loadTable('db', 'people')
  t.strictEquals(createdTable, JSON.stringify(db.people, null, 2), 'persisted table matches in-memory table')

  //
  // Property update.
  //

  // Listen for the save event.
  let actualWriteCount = 0
  const tableListener = table => {

    actualWriteCount++

    if (actualWriteCount === 1) {
      t.strictEquals(table.tableName, 'people', 'the correct table is saved')
      t.strictEquals(expectedWriteCount, actualWriteCount, 'write 1: expected number of writes has taken place')

      t.strictEquals(JSON.stringify(db.people), JSON.stringify(people), 'write 1: original object and data in table are same after property update')

      const updatedTable = loadTable('db', 'people')
      t.strictEquals(updatedTable, JSON.stringify(db.people, null, 2), 'write 1: persisted table matches in-memory table after property update')

      //
      // Update two properties within the same stack frame.
      //
      expectedWriteCount = 2

      db.people[0].age = 43
      db.people[1].age = 33
    }

    if (actualWriteCount === 2) {
      t.strictEquals(expectedWriteCount, actualWriteCount, 'write 2: expected number of writes has taken place')
      t.strictEquals(JSON.stringify(db.people), JSON.stringify(people), 'write 2: original object and data in table are same after property update')
      const updatedTable = loadTable('db', 'people')
      t.strictEquals(updatedTable, JSON.stringify(db.people, null, 2), 'write 2: persisted table matches in-memory table after property update')

      db.people.__table__.removeListener('save', tableListener)

      t.end()
    }
  }
  db.people.__table__.addListener('save', tableListener)

  // Update a property
  let expectedWriteCount = 1
  db.people[0].age = 21
})

test('concurrent updates', t => {
  // Ensure database does not exist.
  fs.removeSync(databasePath)

  const settings = {
    darkMode: 'auto',
    colours: {
      red: '#FF5555',
      green: '#55FF55',
      magenta: '#FF55FF'
    }
  }

  const db = new WhatDB(databasePath)

  db.settings = settings

  const expectedTablePath = path.join(databasePath, 'settings.json')
  t.ok(fs.existsSync(expectedTablePath), 'table is created')

  const createdTable = loadTable('db', 'settings')
  t.strictEquals(createdTable, JSON.stringify(db.settings, null, 2), 'persisted table matches in-memory table')

  let handlerInvocationCount = 0

  db.settings.__table__.addListener('save', table => {

    handlerInvocationCount++

    if (handlerInvocationCount === 1) {
      //
      // After the first save, we expect darkMode to be 'always-on'
      // and the colours to be the original ones.
      //
      const persistedTable = JSON.parse(loadTable('db', 'settings'))
      const originalColours = {red: '#FF5555', green: '#55FF55', magenta: '#FF55FF'}

      t.strictEquals(persistedTable.darkMode, 'always-on', 'write 1: updated value is correctly saved')
      t.strictEquals(JSON.stringify(persistedTable.colours), JSON.stringify(originalColours), 'write 1: unchanged values are unchanged as expected')

    } else if (handlerInvocationCount === 2) {
      //
      // After the second save, the state of the persisted table should
      // match the state of the in-memory one.
      //
      const persistedTable = loadTable('db', 'settings')
      t.strictEquals(persistedTable, JSON.stringify(settings, null, 2), 'write 2: persisted table matches in-memory table')

      // Trigger a new change.
      delete db.settings.colours

    } else if (handlerInvocationCount === 3) {
      //
      // After the third save, the colours object should be deleted.
      //
      t.strictEquals(settings.colours, undefined, 'write 3: object confirmed as deleted from in-memory table')
      const persistedTable = loadTable('db', 'settings')
      t.strictEquals(persistedTable, JSON.stringify(settings, null, 2), 'write 3: persisted table matches in-memory table')

      t.end()
    } else {
      t.fail('save handler called too many times')
    }
  })

  // This update should trigger a save.
  db.settings.darkMode = 'always-on'

  setImmediate(() => {
    // This update should also trigger a single save
    // but after the first one is done.
    // Note: this also tests deep proxification of a changed object.
    db.settings.colours = {red: '#AA0000', green: '#00AA00', magenta: '#AA00AA'}
  })
})
