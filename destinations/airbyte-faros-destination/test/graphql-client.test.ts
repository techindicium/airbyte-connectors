import {AirbyteLogger, AirbyteLogLevel} from 'faros-airbyte-cdk';
import {Schema} from 'faros-js-client';
import fs from 'fs-extra';

import {
  batchIterator,
  GraphQLBackend,
  GraphQLClient,
  groupByKeys,
  mergeByPrimaryKey,
  serialize,
  strictPick,
  toLevels,
  toPostgresArrayLiteral,
  Upsert,
  UpsertBuffer,
} from '../src/common/graphql-client';
import {Operation, UpdateRecord} from '../src/common/types';

describe('graphql-client', () => {
  test('basic batch mutation', async () => {
    const json: any = [
      {
        mutation: {
          insert_vcs_Membership_one: {
            __args: {
              object: {
                vcs_User: {
                  data: {uid: 'ashnet16', source: 'GitHub', origin: 'myghsrc'},
                  on_conflict: {
                    constraint: {value: 'vcs_User_pkey'},
                    update_columns: [{value: 'uid'}, {value: 'source'}],
                  },
                },
                vcs_Organization: {
                  data: {uid: 'faros-ai', source: 'GitHub', origin: 'myghsrc'},
                  on_conflict: {
                    constraint: {value: 'vcs_Organization_pkey'},
                    update_columns: [{value: 'uid'}, {value: 'source'}],
                  },
                },
                origin: 'myghsrc',
              },
              on_conflict: {
                constraint: {value: 'vcs_Membership_pkey'},
                update_columns: [{value: 'origin'}, {value: 'refreshedAt'}],
              },
            },
            id: true,
          },
        },
      },
      {
        mutation: {
          insert_vcs_User_one: {
            __args: {
              object: {
                uid: 'betafood',
                type: {category: 'User', detail: 'user'},
                source: 'GitHub',
                origin: 'myghsrc',
              },
              on_conflict: {
                constraint: {value: 'vcs_User_pkey'},
                update_columns: [
                  {value: 'email'},
                  {value: 'name'},
                  {value: 'origin'},
                  {value: 'refreshedAt'},
                  {value: 'type'},
                  {value: 'url'},
                ],
              },
            },
            id: true,
          },
        },
      },
    ];
    expect(GraphQLClient.batchMutation(json)).toMatchSnapshot();
  });
  test('empty batch mutation', async () => {
    expect(GraphQLClient.batchMutation([])).toBeUndefined();
  });
  test('no mutations', async () => {
    const json: any = [
      {
        query: {
          insert_vcs_Membership_one: {
            __args: {
              object: {
                vcs_User: {
                  data: {uid: 'ashnet16', source: 'GitHub', origin: 'myghsrc'},
                  on_conflict: {
                    constraint: {value: 'vcs_User_pkey'},
                    update_columns: [{value: 'uid'}, {value: 'source'}],
                  },
                },
                vcs_Organization: {
                  data: {uid: 'faros-ai', source: 'GitHub', origin: 'myghsrc'},
                  on_conflict: {
                    constraint: {value: 'vcs_Organization_pkey'},
                    update_columns: [{value: 'uid'}, {value: 'source'}],
                  },
                },
                origin: 'myghsrc',
              },
              on_conflict: {
                constraint: {value: 'vcs_Membership_pkey'},
                update_columns: [{value: 'origin'}, {value: 'refreshedAt'}],
              },
            },
            id: true,
          },
        },
      },
      {
        query: {
          insert_vcs_User_one: {
            __args: {
              object: {
                uid: 'betafood',
                type: {category: 'User', detail: 'user'},
                source: 'GitHub',
                origin: 'myghsrc',
              },
              on_conflict: {
                constraint: {value: 'vcs_User_pkey'},
                update_columns: [
                  {value: 'email'},
                  {value: 'name'},
                  {value: 'origin'},
                  {value: 'refreshedAt'},
                  {value: 'type'},
                  {value: 'url'},
                ],
              },
            },
            id: true,
          },
        },
      },
    ];
    expect(GraphQLClient.batchMutation(json)).toBeUndefined();
  });
});

describe('graphql-client write batch upsert', () => {
  const schemaLoader = {
    async loadSchema(): Promise<Schema> {
      return await fs.readJson('test/resources/hasura-schema.json', {
        encoding: 'utf-8',
      });
    },
  };
  test('basic end-to-end', async () => {
    const res1 = JSON.parse(`
    {
      "data": {
      "insert_vcs_Organization": {
        "returning": [
          {
            "id": "t1|gql-e2e-v2|GitHub|faros-ai",
            "uid": "faros-ai",
            "source": "GitHub"
            }
          ]
        }
      }
    }`);
    const res2 = JSON.parse(`
    {
      "data": {
        "insert_vcs_Repository": {
          "returning": [
            {
              "id": "t1|gql-e2e-v2|metis|t1|gql-e2e-v2|GitHub|faros-ai",
              "name": "metis",
              "organizationId": "t1|gql-e2e-v2|GitHub|faros-ai"
            },
            {
              "id": "t1|gql-e2e-v2|hermes|t1|gql-e2e-v2|GitHub|faros-ai",
              "name": "hermes",
              "organizationId": "t1|gql-e2e-v2|GitHub|faros-ai"
            }
          ]
        }
      }
    }`);
    const res3 = JSON.parse(`
    {
      "data": {
        "insert_vcs_Branch": {
          "returning": [
            {
              "id": "t1|gql-e2e-v2|foo|t1|gql-e2e-v2|metis|t1|gql-e2e-v2|GitHub|faros-ai",
              "name": "foo",
              "repositoryId": "t1|gql-e2e-v2|metis|t1|gql-e2e-v2|GitHub|faros-ai"
            },
            {
              "id": "t1|gql-e2e-v2|main|t1|gql-e2e-v2|hermes|t1|gql-e2e-v2|GitHub|faros-ai",
              "name": "main",
              "repositoryId": "t1|gql-e2e-v2|hermes|t1|gql-e2e-v2|GitHub|faros-ai"
            }
          ]
        }
      }
    }`);
    const record1 = JSON.parse(
      '{"name":"foo","uid":"foo","repository":{"name":"metis","uid":"metis","organization":{"uid":"faros-ai","source":"GitHub"}},"source":"GitHub"}'
    );
    const record2 = JSON.parse(
      '{"name":"main","uid":"main","repository":{"name":"hermes","uid":"hermes","organization":{"uid":"faros-ai","source":"GitHub"}},"source":"GitHub"}'
    );
    let queries = 0;
    const backend: GraphQLBackend = {
      healthCheck() {
        return Promise.resolve();
      },
      postQuery(query: any) {
        expect(query).toMatchSnapshot();
        queries++;
        if (query.startsWith('mutation { insert_vcs_Organization')) {
          return Promise.resolve(res1);
        } else if (query.startsWith('mutation { insert_vcs_Repository')) {
          return Promise.resolve(res2);
        } else if (query.startsWith('mutation { insert_vcs_Branch')) {
          return Promise.resolve(res3);
        } else {
          throw new Error('unexpected query ' + query);
        }
      },
    };
    const client = new GraphQLClient(
      new AirbyteLogger(AirbyteLogLevel.INFO),
      schemaLoader,
      backend,
      10,
      1
    );
    await client.loadSchema();
    await client.writeRecord('vcs_Branch', record1, 'mytestsource');
    await client.writeRecord('vcs_Branch', record2, 'mytestsource');
    await client.flush();
    expect(queries).toEqual(3);
  });
  test('on_conflict update_columns bug', async () => {
    const responses = [
      JSON.parse(`
    {
      "data": {
      "insert_vcs_Organization": {
        "returning": [
          {
            "id": "t1|gql-e2e-v2|GitHub|faros-ai",
            "uid": "faros-ai",
            "source": "GitHub"
            }
          ]
        }
      }
    }`),
      JSON.parse(`
    {
      "data": {
        "insert_vcs_Repository": {
          "returning": [
            {
              "id": "t1|gql-e2e-v2|hermes|t1|gql-e2e-v2|GitHub|faros-ai",
              "name": "hermes",
              "organizationId": "t1|gql-e2e-v2|GitHub|faros-ai"
            }
          ]
        }
      }
    }`),
      JSON.parse(`
    {
      "data": {
        "insert_vcs_Branch": {
          "returning": [
            {
              "id": "t1|gql-e2e-v2|foo|t1|gql-e2e-v2|metis|t1|gql-e2e-v2|GitHub|faros-ai",
              "name": "foo",
              "repositoryId": null
            }
          ]
        }
      }
    }`),
      JSON.parse(`
    {
      "data": {
        "insert_vcs_Branch": {
          "returning": [
            {
              "id": "t1|gql-e2e-v2|main|t1|gql-e2e-v2|hermes|t1|gql-e2e-v2|GitHub|faros-ai",
              "name": "main",
              "repositoryId": "t1|gql-e2e-v2|hermes|t1|gql-e2e-v2|GitHub|faros-ai"
            }
          ]
        }
      }
    }`),
    ];
    const records = [
      JSON.parse('{"name":"foo","uid":"foo"}'),
      JSON.parse(
        '{"name":"main","uid":"main","repository":{"name":"hermes","uid":"hermes","organization":{"uid":"faros-ai","source":"GitHub"}},"source":"GitHub"}'
      ),
    ];
    let queries = 0;
    const backend: GraphQLBackend = {
      healthCheck() {
        return Promise.resolve();
      },
      postQuery(query: any) {
        expect(query).toMatchSnapshot();
        return responses[queries++];
      },
    };
    const client = new GraphQLClient(
      new AirbyteLogger(AirbyteLogLevel.INFO),
      schemaLoader,
      backend,
      10,
      1
    );
    await client.loadSchema();
    for (const record of records) {
      await client.writeRecord('vcs_Branch', record, 'mytestsource');
    }
    await client.flush();
    expect(queries).toEqual(responses.length);
  });
  test('record with null primary key field', async () => {
    const res1 = JSON.parse(`
    {
      "data": {
      "insert_vcs_Organization": {
        "returning": [
          {
            "id": "t1|gql-e2e-v2|GitHub|faros-ai",
            "uid": "faros-ai",
            "source": null
            }
          ]
        }
      }
    }`);
    // org without source (aka null primary key field)
    const record1 = JSON.parse('{"uid":"faros-ai"}');
    let queries = 0;
    const backend: GraphQLBackend = {
      healthCheck() {
        return Promise.resolve();
      },
      postQuery(query: any) {
        expect(query).toMatchSnapshot();
        queries++;
        if (query.startsWith('mutation { insert_vcs_Organization')) {
          return Promise.resolve(res1);
        } else {
          throw new Error('unexpected query ' + query);
        }
      },
    };
    const client = new GraphQLClient(
      new AirbyteLogger(AirbyteLogLevel.INFO),
      schemaLoader,
      backend,
      10,
      1
    );
    await client.loadSchema();
    await client.writeRecord('vcs_Organization', record1, 'mytestsource');
    await client.flush();
    expect(queries).toEqual(1);
  });
  test('mergeByPrimaryKey', async () => {
    const users = [
      {
        uid: 'tovbinm',
        name: 'tovbinm',
        htmlUrl: 'https://github.com/tovbinm',
        type: {category: 'User', detail: 'user'},
        source: 'GitHub',
        origin: 'mytestsource',
      },
      {uid: 'tovbinm', source: 'GitHub', origin: 'mytestsource2'},
      {
        uid: 'vitalyg',
        name: 'vitalyg',
        htmlUrl: 'https://github.com/vitalyg',
        type: {category: 'User', detail: 'user'},
        source: 'GitHub',
        origin: 'mytestsource',
      },
      {
        uid: 'vitalyg',
        source: 'GitHub',
        origin: 'mytestsource',
        type: {foo: 'bar'},
      },
      {
        uid: 'vitalyg',
        source: null,
        origin: 'mytestsource',
        type: {foo: 'bar'},
      },
      {
        uid: 'vitalyg',
        source: null,
        name: 'vitality',
      },
    ];
    const primaryKeys = ['uid', 'source'];
    expect(mergeByPrimaryKey(users, primaryKeys)).toMatchSnapshot();
  });
  test('self-referent model', async () => {
    const responses = [
      // #1
      JSON.parse(`  
      {
        "data": {
          "insert_org_Employee": {
            "returning": [
              {
                "id": "t1|gql-e2e-v2|7",
                "uid": "7"
              },
              {
                "id": "t1|gql-e2e-v2|9",
                "uid": "9"
              }
            ]
          }
        }
      }`),
      // #2
      JSON.parse(`  
      {
        "data": {
          "insert_org_Employee": {
            "returning": [
              {
                "id": "t1|gql-e2e-v2|9",
                "uid": "9"
              }
            ]
          }
        }
      }`),
      // #3
      JSON.parse(`
      {
        "data": {
          "insert_org_Employee": {
            "returning": [
              {
                "id": "t1|gql-e2e-v2|10",
                "uid": "10"
              },
              {
                "id": "t1|gql-e2e-v2|8",
                "uid": "8"
              },
              {
                "id": "t1|gql-e2e-v2|7",
                "uid": "7"
              }
            ]
          }
        }
      }`),
    ];
    const records = [
      JSON.parse('{"uid":"10","manager":{"uid":"7"},"source":"BambooHR"}'),
      JSON.parse('{"uid":"8","manager":{"uid":"9"},"source":"BambooHR"}'),
      JSON.parse('{"uid":"7","manager":{"uid":"9"},"source":"BambooHR"}'),
      JSON.parse('{"uid":"9","source":"BambooHR"}'),
    ];
    let queries = 0;
    const backend: GraphQLBackend = {
      healthCheck() {
        return Promise.resolve();
      },
      postQuery(query: any) {
        expect(query).toMatchSnapshot();
        return responses[queries++];
      },
    };
    const client = new GraphQLClient(
      new AirbyteLogger(AirbyteLogLevel.INFO),
      schemaLoader,
      backend,
      10,
      1
    );
    await client.loadSchema();
    for (const rec of records) {
      await client.writeRecord('org_Employee', rec, 'mytestsource');
    }
    await client.flush();
    expect(queries).toEqual(responses.length);
  });
  test('update as upsert', async () => {
    const responses: any[] = [
      {
        data: {
          insert_vcs_Organization: {
            returning: [
              {
                id: '4d1025a2cfb95b311b9871a49de3a56bf594beee',
                source: 'Bitbucket',
                uid: 'playg',
              },
            ],
          },
        },
      },
      {
        data: {
          insert_vcs_Repository: {
            returning: [
              {
                id: 'f9b8248bfcbd563eb23d05a8b1c188a873de787e',
                name: 'repo1',
                organizationId: '4d1025a2cfb95b311b9871a49de3a56bf594beee',
              },
            ],
          },
        },
      },
      {
        data: {
          insert_vcs_Commit: {
            returning: [
              {
                id: 'c9edcbbadfd386d367b8a5d6fd33e04937f5ff34',
                repositoryId: 'f9b8248bfcbd563eb23d05a8b1c188a873de787e',
                sha: 'b500332b58c74fc15302c8961e54facf66c16c44',
              },
            ],
          },
        },
      },
      {
        data: {
          insert_vcs_PullRequest: {
            returning: [
              {
                id: '601bfb71ffa7cac5059940af2508dbce01d023df',
                number: 2,
                repositoryId: 'f9b8248bfcbd563eb23d05a8b1c188a873de787e',
              },
            ],
          },
        },
      },
      {
        data: {
          m0: {
            id: '601bfb71ffa7cac5059940af2508dbce01d023df',
          },
        },
      },
    ];
    const updateRecord: UpdateRecord = {
      operation: Operation.UPDATE,
      model: 'vcs_PullRequest',
      origin: 'my-origin',
      at: 1683125806803,
      where: {
        number: 2,
        uid: '2',
        repository: {
          uid: 'repo1',
          name: 'repo1',
          organization: {
            uid: 'playg',
            source: 'Bitbucket',
          },
        },
      },
      mask: ['mergeCommit', 'mergedAt'],
      patch: {
        mergeCommit: {
          sha: 'b500332b58c74fc15302c8961e54facf66c16c44',
          uid: 'b500332b58c74fc15302c8961e54facf66c16c44',
          repository: {
            uid: 'repo1',
            name: 'repo1',
            organization: {
              uid: 'playg',
              source: 'Bitbucket',
            },
          },
        },
        mergedAt: '2022-09-21T03:00:27.505Z',
      },
    };
    const records: {model: string; origin: string; data: any}[] = [
      {
        model: 'vcs_PullRequest',
        origin: 'my-origin',
        data: JSON.parse(
          '{"number":2,"uid":"2","repository":{"name":"repo1","uid":"repo1","organization":{"uid":"playg","source":"Bitbucket"}}}'
        ),
      },
      {
        model: 'vcs_Commit',
        origin: 'my-origin',
        data: JSON.parse(
          '{"sha":"b500332b58c74fc15302c8961e54facf66c16c44","uid":"b500332b58c74fc15302c8961e54facf66c16c44","repository":{"name":"repo1","uid":"repo1","organization":{"uid":"playg","source":"Bitbucket"}}}'
        ),
      },
    ];
    let queries = 0;
    const backend: GraphQLBackend = {
      healthCheck() {
        return Promise.resolve();
      },
      postQuery(query: any) {
        expect(query).toMatchSnapshot();
        return responses[queries++];
      },
    };
    const client = new GraphQLClient(
      new AirbyteLogger(AirbyteLogLevel.INFO),
      schemaLoader,
      backend,
      10,
      1
    );
    await client.loadSchema();
    for (const rec of records) {
      await client.writeRecord(rec.model, rec.data, rec.origin);
    }
    await client.writeTimestampedRecord(updateRecord);
    await client.flush();
    expect(queries).toEqual(responses.length);
  });
});

describe('graphql-client write batch updates', () => {
  const schemaLoader = {
    async loadSchema(): Promise<Schema> {
      return await fs.readJson('test/resources/hasura-ce-schema.json', {
        encoding: 'utf-8',
      });
    },
  };

  test('update_columns bug', async () => {
    const responses = [
      JSON.parse(`
      {
        "data": {
          "insert_tms_Task_one": {
            "returning": [
              {
                "id": "t1|gql-e2e-v2|7"
              }
            ]
          }
        }
      }`),
    ];
    const records = [
      JSON.parse('{"uid":"9","source":"jira"}'),
      JSON.parse('{"uid":"7","source":"jira"}'),
      JSON.parse(
        '{"uid":"7","parent":{"uid":"9", "source":"jira"},"source":"jira"}'
      ),
    ];
    let queries = 0;
    const backend: GraphQLBackend = {
      healthCheck() {
        return Promise.resolve();
      },
      postQuery(query: any) {
        expect(query).toMatchSnapshot();
        return responses[queries++];
      },
    };
    const client = new GraphQLClient(
      new AirbyteLogger(AirbyteLogLevel.INFO),
      schemaLoader,
      backend,
      0,
      5
    );
    await client.loadSchema();
    for (const rec of records) {
      await client.writeRecord('tms_Task', rec, 'mytestsource');
    }
    await client.flush();
    expect(queries).toEqual(responses.length);
  });
});

describe('upsert buffer', () => {
  test('basic', async () => {
    const buf = new UpsertBuffer();
    buf.add({model: 'm1', object: {}, foreignKeys: {}});
    expect(buf.size()).toEqual(1);
    expect(buf.pop('unknown')).toBeUndefined();
    buf.add({model: 'm2', object: {}, foreignKeys: {}});
    buf.add({model: 'm2', object: {}, foreignKeys: {}});
    expect(buf.size()).toEqual(2);
    expect(buf.pop('m2')?.length).toEqual(2);
    expect(buf.size()).toEqual(1);
    expect(buf.get('m1')?.length).toEqual(1);
    expect(buf.size()).toEqual(1);
    expect(buf.pop('m1')?.length).toEqual(1);
    expect(buf.size()).toEqual(0);
  });
});

describe('graphql-client utilities', () => {
  test('serialize', async () => {
    expect(serialize({z: 1, a: 'bar'})).toEqual('a:bar|z:1');
    expect(serialize({})).toEqual('');
  });
  test('strictPick', async () => {
    expect(strictPick({z: 0, a: 'bar'}, ['z', 'b'])).toEqual({z: 0, b: 'null'});
    expect(strictPick({z: 1, a: 'bar'}, ['z', 'b'])).toEqual({z: 1, b: 'null'});
    expect(strictPick({z: 1, a: 'bar'}, ['b'])).toEqual({b: 'null'});
  });
});

describe('toLevels', () => {
  async function expectLevels(upserts: Upsert[]): Promise<void> {
    const iterator = batchIterator(toLevels(upserts), (batch) => {
      return Promise.resolve(batch.map((u) => u.id).sort());
    });
    const res = [];
    for await (const result of iterator) {
      res.push(result);
    }
    expect(res).toMatchSnapshot();
  }

  test('simple chain', async () => {
    const u0: Upsert = {
      id: 'u0',
      model: 'm',
      object: {},
      foreignKeys: {},
    };
    const u1: Upsert = {
      id: 'u1',
      model: 'm',
      object: {},
      foreignKeys: {
        r: u0,
      },
    };
    const u2: Upsert = {
      id: 'u2',
      model: 'm',
      object: {},
      foreignKeys: {
        r: u1,
      },
    };
    await expectLevels([u2]);
    await expectLevels([u1]);
    await expectLevels([u0]);
  });
  test('simple tree', async () => {
    const u0: Upsert = {
      id: 'u0',
      model: 'm',
      object: {},
      foreignKeys: {},
    };
    const u1: Upsert = {
      id: 'u1',
      model: 'm',
      object: {},
      foreignKeys: {},
    };
    const u2: Upsert = {
      id: 'u2',
      model: 'm',
      object: {},
      foreignKeys: {
        l: u0,
        r: u1,
      },
    };
    await expectLevels([u2]);
  });
  test('imbalanced tree', async () => {
    const u0: Upsert = {
      id: 'u0',
      model: 'm',
      object: {},
      foreignKeys: {},
    };
    const u3: Upsert = {
      id: 'u3',
      model: 'm',
      object: {},
      foreignKeys: {},
    };
    const u1: Upsert = {
      id: 'u1',
      model: 'm',
      object: {},
      foreignKeys: {
        r: u3,
      },
    };
    const u2: Upsert = {
      id: 'u2',
      model: 'm',
      object: {},
      foreignKeys: {
        l: u0,
        r: u1,
      },
    };
    await expectLevels([u2]);
  });
  test('ignore other models', async () => {
    const u0: Upsert = {
      id: 'u0',
      model: 'm',
      object: {},
      foreignKeys: {},
    };
    const u3: Upsert = {
      id: 'u3',
      model: 'm',
      object: {},
      foreignKeys: {},
    };
    const u1: Upsert = {
      id: 'u1',
      model: 'm2', // different model type
      object: {},
      foreignKeys: {
        r: u3,
      },
    };
    const u2: Upsert = {
      id: 'u2',
      model: 'm',
      object: {},
      foreignKeys: {
        l: u0,
        r: u1,
      },
    };
    await expectLevels([u2]);
  });
});

describe('groupByKeys', () => {
  const u0a = {id: 'u0a', f1: 'f1a', f2: 'f2a', f3: 'f3a'};
  const u0b = {id: 'u0b', f1: 'f1b', f2: 'f2b', f3: 'f3b'};
  const u1a = {id: 'u1a', f1: 'f1a'};
  const u1b = {id: 'u1b', f1: 'f1b'};
  const u2a = {id: 'u2a', f3: 'f3'};
  const u2b = {id: 'u2b', f3: 'f3'};

  async function expectGroupByKeys(objects: any[]): Promise<void> {
    const iterator = batchIterator(groupByKeys(objects), (batch) => {
      return Promise.resolve(batch.map((u) => u.id).sort());
    });
    const res = [];
    for await (const result of iterator) {
      res.push(result);
    }
    expect(res).toMatchSnapshot();
  }
  test('3 groups of 2', async () => {
    await expectGroupByKeys([u0a, u0b, u1a, u1b, u2a, u2b]);
  });
  test('1 group of 2', async () => {
    await expectGroupByKeys([u0a, u0b]);
  });
  test('2 groups of 1', async () => {
    await expectGroupByKeys([u0a, u1a]);
  });
  test('2 groups of mix', async () => {
    await expectGroupByKeys([u0a, u1a, u1b]);
  });
});

describe('toPostgresArrayLiteral', () => {
  test('strings', async () => {
    expect(toPostgresArrayLiteral(['a', 'b', 'c'])).toEqual(`{"a","b","c"}`);
    expect(toPostgresArrayLiteral(['a', '', 'c'])).toEqual(`{"a","","c"}`);
    expect(toPostgresArrayLiteral(['a', null, 'c'])).toEqual(`{"a",NULL,"c"}`);
    expect(toPostgresArrayLiteral(['a', undefined, 'c'])).toEqual(
      `{"a",NULL,"c"}`
    );
  });
  test('numbers', async () => {
    expect(toPostgresArrayLiteral([1, 2, 3])).toEqual(`{1,2,3}`);
    expect(toPostgresArrayLiteral([1, null, 3])).toEqual(`{1,NULL,3}`);
    expect(toPostgresArrayLiteral([1, undefined, 3])).toEqual(`{1,NULL,3}`);
    expect(toPostgresArrayLiteral([1, 0, 3])).toEqual(`{1,0,3}`);
  });
});
