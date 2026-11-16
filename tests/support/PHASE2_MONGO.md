# Isolated MongoDB integration test

Run `tests/integration/mongo-transactions.test.mjs` through the backend runner.

```text
npm ci
npm run test:mongo
npm test
```

Use Node 22 and MongoDB Community Server 8.x. On Windows, install the [Community Server binary](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-windows/) in its standard Program Files location. On Ubuntu, install [mongodb-org-server from the MongoDB 8.0 repository](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-ubuntu/), as the backend CI workflow does. A service is optional. The fixture detects standard Windows installations and otherwise uses `mongod` from PATH. For a custom installation, set `SA_TEST_MONGOD` to the absolute path of the executable. The runner no longer takes an external test URI.

Each invocation starts a separate mongod listening on a dynamically selected loopback port. It initializes a single-member replica set and verifies the process PID, replica set name, and writable primary state before connecting the test. The test checks that its randomly named `sa_phase2_` database starts empty. It writes character, command receipt, treatment lock, and campaign records, exercising authenticated reads, concurrent revisions, committed transactions, rollback and receipt replay. A fresh Node process reads the saved characters back through HTTP.

At teardown the fixture stops its own process and removes its temporary data directory. It issues no database drop command and uses neither the application connection settings nor the running MongoDB service.

A missing executable, blocked child process, or replica set startup failure fails the test. Check `mongod --version` using the installed binary, the `SA_TEST_MONGOD` path if set, and whether the test process can spawn children, bind loopback sockets, and write to its temporary directory. If startup reports a port collision, rerun to select a new port.
