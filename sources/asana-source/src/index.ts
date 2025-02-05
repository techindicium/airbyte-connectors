import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Asana, AsanaConfig} from './asana';
import {Projects, Tags, Tasks, Users, Workspaces} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new AsanaSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Asana source implementation. */
export class AsanaSource extends AirbyteSourceBase<AsanaConfig> {
  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AsanaConfig): Promise<[boolean, VError]> {
    try {
      const asana = Asana.instance(config);
      await asana.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AsanaConfig): AirbyteStreamBase[] {
    return [
      new Projects(config, this.logger),
      new Tags(config, this.logger),
      new Tasks(config, this.logger),
      new Users(config, this.logger),
      new Workspaces(config, this.logger),
    ];
  }
}
