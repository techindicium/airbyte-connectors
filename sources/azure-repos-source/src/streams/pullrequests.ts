import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureRepoConfig, AzureRepos} from '../azure-repos';
import {PullRequest} from '../models';

export class PullRequests extends AirbyteStreamBase {
  constructor(
    private readonly config: AzureRepoConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pullrequests.json');
  }

  get primaryKey(): StreamKey {
    return 'pullRequestId';
  }

  get cursorField(): string | string[] {
    return 'creationDate';
  }

  async *readRecords(): AsyncGenerator<PullRequest> {
    const azureRepos = await AzureRepos.make(this.config);
    yield* azureRepos.getPullRequests();
  }
}
